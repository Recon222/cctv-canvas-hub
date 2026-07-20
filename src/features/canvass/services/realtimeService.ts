import { getSupabase } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { useHealthStore, type ChannelStatus } from '@/store/health-store'
import type { CaseRow, LocationRow } from '../types'

/**
 * AD1: one private broadcast channel, `agency:activity`, carrying full
 * old+new rows from the `broadcast_agency_activity` trigger. The ONLY
 * row-dispatch API is case-partitioned (G6) — events are filtered by
 * case before dispatch, against the CURRENT case id read through
 * `getCaseId` at delivery time. But this API also DELIBERATELY consumes
 * agency-wide traffic BEFORE that filter: every well-formed envelope
 * confirms liveness (G4), and any location/case traffic keeps the
 * landing's counts and case list live via the pre-filter callbacks. A
 * V2 swap to per-case `case:{id}:activity` topics is therefore NOT a
 * drop-in — narrowing the topic silently kills landing liveness and
 * quiet-agency health confirmation. V2 must preserve an agency-wide
 * signal for both (e.g. keep a slim agency topic alongside the per-case
 * ones) before it narrows anything.
 *
 * The subscription must never be torn down and re-created on a case
 * switch: against installed realtime-js 2.110.7, `removeChannel` waits a
 * network round trip for the leave ack while `channel()` on the same
 * topic returns the SAME mid-leave channel, whose `subscribe()` is gated
 * on `isClosed()` and silently no-ops — a cleanup→setup pair on one
 * topic permanently kills realtime for the session (review CRITICAL).
 * Subscribe once, filter live.
 *
 * Envelope shape verified against a live capture (2026-07-20):
 * `{ type, event, payload: { id, table, record, schema, operation,
 * old_record }, meta }` — handlers receive the whole envelope; the
 * contract fields live under `payload` (doc 01 §5.2).
 */

const TOPIC = 'agency:activity'

export type Op = 'INSERT' | 'UPDATE' | 'DELETE'

export type ActivityEvent =
  | { table: 'cloud_cases'; op: Op; row: CaseRow; old: CaseRow | null }
  | {
      table: 'cloud_locations'
      op: Op
      row: LocationRow
      old: LocationRow | null
    }

const OPS: readonly Op[] = ['INSERT', 'UPDATE', 'DELETE']

function isOp(value: unknown): value is Op {
  return OPS.includes(value as Op)
}

/** supabase-js subscribe states → the canonical ChannelStatus union. */
function mapChannelStatus(status: string): ChannelStatus {
  switch (status) {
    case 'SUBSCRIBED':
      return 'subscribed'
    case 'TIMED_OUT':
      return 'timed-out'
    case 'CLOSED':
      return 'closed'
    default:
      return 'error'
  }
}

export function subscribeToCaseActivity(
  getCaseId: () => string | null,
  onEvent: (event: ActivityEvent) => void,
  onStatus: (status: ChannelStatus) => void,
  /**
   * Any well-formed `cloud_locations` envelope, BEFORE the case filter —
   * whoever's case it is, the landing counts may have changed.
   */
  onLocationTraffic?: () => void,
  /**
   * Any well-formed `cloud_cases` envelope, BEFORE the id filter — a
   * new canvass, rename, or status change must reach the landing's case
   * list live, not on the next reconcile (review LOW: counts were live
   * while the list above them was not — mixed freshness on one card).
   */
  onCaseTraffic?: () => void
): () => void {
  const supabase = getSupabase()

  // Envelope-contract violations log at `warn`: `debug` is a no-op
  // outside DEV, and if the trigger payload drifts, 100% of events land
  // in these branches with nothing else explaining the dead board.
  const dispatch = (message: unknown): void => {
    const payload = (message as { payload?: unknown } | null)?.payload
    if (typeof payload !== 'object' || payload === null) {
      logger.warn('realtime: ignoring malformed broadcast envelope')
      return
    }
    const { operation, table, record, old_record } = payload as {
      operation?: unknown
      table?: unknown
      record?: unknown
      old_record?: unknown
    }
    if (!isOp(operation)) {
      logger.warn('realtime: ignoring unknown operation', {
        operation: String(operation),
      })
      return
    }
    // DELETE carries the row in old_record only.
    const raw = record ?? old_record
    if (typeof raw !== 'object' || raw === null) {
      logger.warn('realtime: ignoring event with no row')
      return
    }
    // Any delivered well-formed envelope proves the channel is alive —
    // record BEFORE the case filter (G4). With only post-filter confirms,
    // a healthy multi-case agency reads STALE most of the time, because
    // other cases' events silently confirm nothing.
    useHealthStore.getState().recordEvent()
    if (table === 'cloud_locations') {
      onLocationTraffic?.()
      const row = raw as LocationRow
      if (row.case_id !== getCaseId()) {
        return
      }
      onEvent({
        table,
        op: operation,
        row,
        old: (old_record ?? null) as LocationRow | null,
      })
      return
    }
    if (table === 'cloud_cases') {
      onCaseTraffic?.()
      const row = raw as CaseRow
      if (row.id !== getCaseId()) {
        return
      }
      onEvent({
        table,
        op: operation,
        row,
        old: (old_record ?? null) as CaseRow | null,
      })
      return
    }
    // Forward-compat: V2 traffic (e.g. cloud_media_files) is a no-op.
    logger.debug('realtime: ignoring unknown table', { table: String(table) })
  }

  // A handler throw would otherwise escape into phoenix's catch-less
  // `bind.callback` loop and die invisibly in the WebSocket onmessage
  // path — no ErrorBoundary, no log, green light on stale data.
  const handle = (message: unknown): void => {
    try {
      dispatch(message)
    } catch (cause) {
      logger.error('realtime: event dispatch failed', { cause })
    }
  }

  const channel = supabase.channel(TOPIC, { config: { private: true } })
  for (const op of OPS) {
    channel.on('broadcast', { event: op }, handle)
  }
  channel.subscribe((status, err) => {
    if (err !== undefined) {
      // The err argument carries the only diagnosable cause (e.g. a
      // `realtime.messages` RLS denial) — CHANNEL_ERROR alone is a
      // symptom with no cause.
      logger.error('realtime: channel error', { status, cause: err })
    }
    onStatus(mapChannelStatus(status))
  })

  return () => {
    void supabase.removeChannel(channel).catch((cause: unknown) => {
      logger.warn('realtime: channel removal failed', { cause })
    })
  }
}

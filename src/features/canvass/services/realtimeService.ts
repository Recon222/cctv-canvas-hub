import { getSupabase } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import type { ChannelStatus } from '@/store/health-store'
import type { CaseRow, LocationRow } from '../types'

/**
 * AD1: one private broadcast channel, `agency:activity`, carrying full
 * old+new rows from the `broadcast_agency_activity` trigger. The ONLY
 * consumer API is case-partitioned (G6) — events are filtered by case
 * before dispatch. V2 migrates by swapping the topic string to
 * `case:{id}:activity`; this API does not change.
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
  caseId: string,
  onEvent: (event: ActivityEvent) => void,
  onStatus: (status: ChannelStatus) => void
): () => void {
  const supabase = getSupabase()

  const handle = (message: unknown): void => {
    const payload = (message as { payload?: unknown } | null)?.payload
    if (typeof payload !== 'object' || payload === null) {
      logger.debug('realtime: ignoring malformed broadcast envelope')
      return
    }
    const { operation, table, record, old_record } = payload as {
      operation?: unknown
      table?: unknown
      record?: unknown
      old_record?: unknown
    }
    if (!isOp(operation)) {
      logger.debug('realtime: ignoring unknown operation', {
        operation: String(operation),
      })
      return
    }
    // DELETE carries the row in old_record only.
    const raw = record ?? old_record
    if (typeof raw !== 'object' || raw === null) {
      logger.debug('realtime: ignoring event with no row')
      return
    }
    if (table === 'cloud_locations') {
      const row = raw as LocationRow
      if (row.case_id !== caseId) {
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
      const row = raw as CaseRow
      if (row.id !== caseId) {
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

  const channel = supabase.channel(TOPIC, { config: { private: true } })
  for (const op of OPS) {
    channel.on('broadcast', { event: op }, handle)
  }
  channel.subscribe(status => {
    onStatus(mapChannelStatus(status))
  })

  return () => {
    void supabase.removeChannel(channel)
  }
}

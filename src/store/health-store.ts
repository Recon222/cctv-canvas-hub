import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

/**
 * Global connection-health store (doc 01 §5.4, AD11). Cross-cutting by
 * design: fed by the canvass feature's queries/realtime and read by any
 * surface that renders liveness. Canonical home of `HealthState`,
 * `ChannelStatus`, and the shared timing constants — every other module
 * imports these, never re-declares.
 *
 * The machine only degrades on evidence and only upgrades on positive
 * confirmation (fetch OK or channel event) — no optimistic `live`.
 */

export type HealthState =
  | 'connecting'
  | 'live'
  | 'reconnecting'
  | 'stale'
  | 'offline'

/** supabase-js channel subscribe states, mapped to a stable local union. */
export type ChannelStatus = 'subscribed' | 'timed-out' | 'closed' | 'error'

/** No realtime confirm AND no fetch OK for longer than this ⇒ `stale` (G4). */
export const STALE_AFTER_MS = 90_000

/**
 * Slow reconcile interval for case-data queries — the lost-broadcast
 * safety net (Flow E4). Broadcast is best-effort with no replay.
 */
export const RECONCILE_MS = 300_000

/**
 * Query-key prefix for signed-URL queries (M4). Owned here so the M2
 * catch-up exclusion predicate never forward-references M4 — it matches
 * nothing until `useSignedUrl` builds its keys from the same constant.
 */
export const SIGNED_URL_KEY_PREFIX = 'signed-url'

/** `offline` pauses polling; every other state keeps data flowing. */
export function canPoll(state: HealthState): boolean {
  return state !== 'offline'
}

export interface HealthMarks {
  online: boolean
  /** Last reported channel status; null until the first subscribe attempt resolves. */
  channel: ChannelStatus | null
  lastEventAt: number | null
  lastFetchOkAt: number | null
  lastFetchErrorAt: number | null
  /** When tracking began — lets silence-since-boot degrade honestly. */
  startedAt: number
}

/** Pure state derivation — the whole machine, unit-testable without time. */
export function evaluate(marks: HealthMarks, now: number): HealthState {
  if (!marks.online) {
    return 'offline'
  }
  const lastConfirm =
    Math.max(marks.lastEventAt ?? 0, marks.lastFetchOkAt ?? 0) || null
  if (now - (lastConfirm ?? marks.startedAt) > STALE_AFTER_MS) {
    return 'stale'
  }
  if (marks.channel === 'subscribed') {
    // SUBSCRIBED alone is not a confirmation — live needs positive proof.
    return lastConfirm !== null ? 'live' : 'connecting'
  }
  if (marks.channel === null) {
    return 'connecting'
  }
  return 'reconnecting'
}

interface HealthStore {
  state: HealthState
  marks: HealthMarks
  /** A broadcast arrived on the channel — positive liveness confirmation. */
  recordEvent: () => void
  /** A case-data fetch succeeded — positive liveness confirmation. */
  recordFetchOk: () => void
  /** A case-data fetch failed — evidence for degradation, never an upgrade. */
  recordFetchError: () => void
  /** Channel subscribe-state transition from the realtime consumer. */
  channelStatus: (status: ChannelStatus) => void
  setOnline: (online: boolean) => void
  /** Re-derive state from marks (interval tick / wake). */
  reevaluate: (now?: number) => void
}

function initialMarks(): HealthMarks {
  return {
    online: typeof navigator === 'undefined' ? true : navigator.onLine,
    channel: null,
    lastEventAt: null,
    lastFetchOkAt: null,
    lastFetchErrorAt: null,
    startedAt: Date.now(),
  }
}

export const useHealthStore = create<HealthStore>()(
  devtools(
    set => {
      const apply = (
        action: string,
        mutate: (marks: HealthMarks, now: number) => Partial<HealthMarks>
      ) =>
        set(
          current => {
            const now = Date.now()
            const marks = { ...current.marks, ...mutate(current.marks, now) }
            return { marks, state: evaluate(marks, now) }
          },
          undefined,
          action
        )

      return {
        state: 'connecting',
        marks: initialMarks(),

        recordEvent: () =>
          apply('recordEvent', (_, now) => ({ lastEventAt: now })),

        recordFetchOk: () =>
          apply('recordFetchOk', (_, now) => ({ lastFetchOkAt: now })),

        recordFetchError: () =>
          apply('recordFetchError', (_, now) => ({ lastFetchErrorAt: now })),

        channelStatus: status =>
          apply('channelStatus', () => ({ channel: status })),

        setOnline: online => apply('setOnline', () => ({ online })),

        reevaluate: now =>
          set(
            current => ({ state: evaluate(current.marks, now ?? Date.now()) }),
            undefined,
            'reevaluate'
          ),
      }
    },
    { name: 'health-store' }
  )
)

/** Test helper: back to a fresh boot state. */
export function resetHealthStore(): void {
  useHealthStore.setState({ state: 'connecting', marks: initialMarks() })
}

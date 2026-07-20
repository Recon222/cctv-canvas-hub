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
 * Reconcile interval for case-data queries — the lost-broadcast safety
 * net (Flow E4) AND the liveness floor on a silent agency: with zero
 * broadcasts (e.g. an idle overnight wall board) the reconcile fetch is
 * the only positive confirmation, so this must stay BELOW
 * `STALE_AFTER_MS` or a healthy quiet board reads stale most of every
 * cycle. Two small queries per minute is the accepted cost.
 */
export const RECONCILE_MS = 60_000

/**
 * Query-key prefix for signed-URL queries (M4). Signed URLs refresh on
 * their own interval and are deliberately OUTSIDE the catch-up
 * allow-list (useConnectionHealth) — M4's `useSignedUrl` builds its
 * keys from this constant.
 */
export const SIGNED_URL_KEY_PREFIX = 'signed-url'

/** Case-data query-key family prefixes — the hooks build their keys
 * from these, never from bare strings. */
export const CASES_KEY = 'cases'
export const LOCATIONS_KEY = 'locations'
export const LOCATION_COUNTS_KEY = 'location-counts'
export const MEDIA_KEY = 'media'

/**
 * The case-data key families as one tuple: everything the reconcile net
 * protects. The catch-up allow-list (useConnectionHealth) and the
 * session-boundary cache purge (CanvassRoot) both consume it — renaming
 * a family in a hook without renaming it here is a compile error, not a
 * silently dropped invalidation (fix-delta review MEDIUM: five files
 * agreed on bare strings with zero linkage).
 */
export const CASE_DATA_KEY_FAMILIES = [
  CASES_KEY,
  LOCATIONS_KEY,
  LOCATION_COUNTS_KEY,
  MEDIA_KEY,
] as const

/** Is this query-key head segment a case-data family? */
export function isCaseDataKey(
  value: unknown
): value is (typeof CASE_DATA_KEY_FAMILIES)[number] {
  return (CASE_DATA_KEY_FAMILIES as readonly unknown[]).includes(value)
}

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
    if (lastConfirm === null) {
      // SUBSCRIBED alone is not a confirmation — live needs positive proof.
      return 'connecting'
    }
    // A fetch failure NEWER than the last positive confirm means the
    // data plane is degraded even while the socket delivers — PostgREST
    // 500ing continuously must not read `live` (review MEDIUM:
    // lastFetchErrorAt was a write-only mark).
    if ((marks.lastFetchErrorAt ?? 0) > lastConfirm) {
      return 'reconnecting'
    }
    return 'live'
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

/** Back to a fresh boot state — the session-exit unmount (CanvassRoot)
 * and tests both call this. The next operator's `live` must come from
 * their own session's confirmations, never inherited marks. */
export function resetHealthStore(): void {
  useHealthStore.setState({ state: 'connecting', marks: initialMarks() })
}

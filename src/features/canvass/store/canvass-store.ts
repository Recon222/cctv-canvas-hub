import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { PopOutView } from '@/lib/services/sessionEvents'
import type { ActivityEntry } from '../types'

/**
 * Canvass board UI state (Phase 2.4A): selection, the A1 three-view IA
 * (AD12), the in-memory activity ring (AD7), and attention stamps.
 * Selector-only access (repo-wide ast-grep `no-destructure`).
 *
 * `attentionByLocation` is a plain record, not a Map — Zustand selectors
 * compare references; in-place Map mutation would silently skip
 * re-renders (doc 01 §5.4).
 */

export type CanvassView = 'cases' | 'case' | 'map'

/** AD7 — in-memory ring, session-scoped. */
export const ACTIVITY_RING_CAP = 200
/** Marker pulse / card highlight lifetime (doc 01 §5.4). */
export const ATTENTION_TTL_MS = 12_000

interface CanvassStore {
  selectedCaseId: string | null
  selectedLocationId: string | null
  /**
   * Monotonic nonce bumped by EVERY `selectLocation` call — including
   * same-id re-selects, which are otherwise a Zustand no-op (PR #6
   * review M1: click marker A, pan away, click A again must re-fly).
   */
  selectionTick: number
  /** `'cases'` is the landing view; `'case'`/`'map'` need a selection (AD12). */
  view: CanvassView
  /** Newest first. */
  activity: ActivityEntry[]
  /** locationId → last attention stamp (epoch ms). */
  attentionByLocation: Record<string, number>
  /** M7 (7.3B): which views are popped out — the rail's indicator.
   * Main-window state only; a plain record for selector safety. */
  poppedViews: Record<PopOutView, boolean>
  selectCase: (caseId: string | null) => void
  selectLocation: (locationId: string | null) => void
  setView: (view: CanvassView) => void
  setViewPopped: (view: PopOutView, popped: boolean) => void
  /** Prepends to the ring and stamps attention for the entry's location. */
  pushActivity: (entry: ActivityEntry) => void
  clearExpiredAttention: (now?: number) => void
}

export const useCanvassStore = create<CanvassStore>()(
  devtools(
    set => ({
      selectedCaseId: null,
      selectedLocationId: null,
      selectionTick: 0,
      view: 'cases',
      activity: [],
      attentionByLocation: {},
      poppedViews: { case: false, map: false },

      selectCase: caseId =>
        set(
          { selectedCaseId: caseId, selectedLocationId: null },
          undefined,
          'selectCase'
        ),

      selectLocation: locationId =>
        set(
          current => ({
            selectedLocationId: locationId,
            selectionTick: current.selectionTick + 1,
          }),
          undefined,
          'selectLocation'
        ),

      setView: view => set({ view }, undefined, 'setView'),

      setViewPopped: (view, popped) =>
        set(
          current => ({
            poppedViews: { ...current.poppedViews, [view]: popped },
          }),
          undefined,
          'setViewPopped'
        ),

      pushActivity: entry =>
        set(
          current => ({
            activity: [entry, ...current.activity].slice(0, ACTIVITY_RING_CAP),
            attentionByLocation:
              entry.locationId === undefined
                ? current.attentionByLocation
                : {
                    ...current.attentionByLocation,
                    [entry.locationId]: entry.at,
                  },
          }),
          undefined,
          'pushActivity'
        ),

      clearExpiredAttention: (now = Date.now()) =>
        set(
          current => {
            const kept: Record<string, number> = {}
            for (const [locationId, at] of Object.entries(
              current.attentionByLocation
            )) {
              if (now - at < ATTENTION_TTL_MS) {
                kept[locationId] = at
              }
            }
            return { attentionByLocation: kept }
          },
          undefined,
          'clearExpiredAttention'
        ),
    }),
    { name: 'canvass-store' }
  )
)

/** Back to the landing state — the session-exit unmount (CanvassRoot)
 * and tests both call this. */
export function resetCanvassStore(): void {
  useCanvassStore.setState({
    selectedCaseId: null,
    selectedLocationId: null,
    selectionTick: 0,
    view: 'cases',
    activity: [],
    attentionByLocation: {},
    poppedViews: { case: false, map: false },
  })
}

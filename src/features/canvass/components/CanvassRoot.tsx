import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import { isCaseDataKey, resetHealthStore } from '@/store/health-store'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { NavRail } from './NavRail'
import { CasesView } from './CasesView'
import { LocationCardStack } from './LocationCardStack'

/**
 * The live board (Phase 2.4B): NavRail + the active A1 view. Mounted by
 * MainWindowContent only while the session is active/locked — so the
 * realtime subscription lives and dies with the session (D12), and a
 * locked board keeps flowing unchanged (doc 01 §5.4).
 *
 * Case File restyle: chrome/layout classes only — bootstrap, store, and
 * reset logic untouched. The header chrome (case tag, clock, connection
 * chip, monitor toggle) mounts here at M5 wiring (components under
 * ./chrome + cloud-session's ConnectionIndicator).
 */
export function CanvassRoot() {
  const view = useCanvassStore(state => state.view)
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const queryClient = useQueryClient()
  useCaseRealtime(selectedCaseId)
  useConnectionHealth()
  // Module-scoped state outlives sign-out; unmount IS the session exit
  // (active/locked → anything else), so reset EVERYTHING session-scoped
  // here: the canvass store (selection/view/activity), the health marks
  // (operator B's `live` must come from their own confirmations, not
  // operator A's — and a dead-socket 'subscribed' carcass would skip
  // the resubscribe catch-up), and the case-data query cache (a cached
  // list inside staleTime would suppress the sign-in refetch)
  // (fix-delta review MEDIUM: only the canvass store reset here).
  useEffect(() => {
    return () => {
      resetCanvassStore()
      resetHealthStore()
      queryClient.removeQueries({
        predicate: query => isCaseDataKey(query.queryKey[0]),
      })
    }
  }, [queryClient])

  return (
    <div className="flex h-full bg-hub-ground font-inter text-hub-body">
      <NavRail />
      <main className="min-w-0 flex-1 overflow-hidden">
        {view === 'cases' && <CasesView />}
        {view === 'case' && <LocationCardStack />}
        {view === 'map' && <MapPlaceholder />}
      </main>
    </div>
  )
}

/** The `'map'` view is M3 — a designed placeholder, never a blank pane. */
function MapPlaceholder() {
  const { t } = useTranslation()
  return (
    <div className="hub-grid-paper flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
        aria-hidden
        className="text-hub-ghost"
      >
        <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
        <path d="M9 4v14" />
        <path d="M15 6v14" />
      </svg>
      <p className="font-nacelle text-3xl font-semibold text-hub-heading">
        {t('canvass.map.placeholder.title')}
      </p>
      <p className="max-w-md text-lg text-hub-muted [text-wrap:pretty]">
        {t('canvass.map.placeholder.description')}
      </p>
    </div>
  )
}

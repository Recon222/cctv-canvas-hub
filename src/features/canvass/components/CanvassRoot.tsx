import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Map as MapIcon } from 'lucide-react'
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
    <div className="flex h-full bg-zinc-950 text-zinc-100">
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
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <MapIcon className="size-10 text-zinc-600" aria-hidden />
      <p className="text-3xl font-semibold text-zinc-300">
        {t('canvass.map.placeholder.title')}
      </p>
      <p className="max-w-md text-lg text-zinc-500">
        {t('canvass.map.placeholder.description')}
      </p>
    </div>
  )
}

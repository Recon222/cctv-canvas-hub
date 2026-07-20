import { useTranslation } from 'react-i18next'
import { FolderKanban, LayoutDashboard, Map as MapIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/features/cloud-session'
import { useCanvassStore, type CanvassView } from '../store/canvass-store'

/**
 * The slim icon rail (AD12) — navigation chrome in the repurposed
 * LeftSideBar slot, NOT an info panel. `case`/`map` need a selected
 * case. A flex column with room for a fourth entry (V2 admin). Sign-out
 * stays reachable from the rail's foot (D4). Pop-out affordances are M7.
 */
export function NavRail() {
  const { t } = useTranslation()
  const view = useCanvassStore(state => state.view)
  const hasSelectedCase = useCanvassStore(
    state => state.selectedCaseId !== null
  )

  const entries: {
    view: CanvassView
    label: string
    icon: typeof FolderKanban
    enabled: boolean
  }[] = [
    {
      view: 'cases',
      label: t('canvass.nav.cases'),
      icon: FolderKanban,
      enabled: true,
    },
    {
      view: 'case',
      label: t('canvass.nav.case'),
      icon: LayoutDashboard,
      enabled: hasSelectedCase,
    },
    {
      view: 'map',
      label: t('canvass.nav.map'),
      icon: MapIcon,
      enabled: hasSelectedCase,
    },
  ]

  return (
    <nav className="flex w-16 shrink-0 flex-col items-center gap-2 border-e border-zinc-800 bg-zinc-950 py-4">
      {entries.map(entry => {
        const Icon = entry.icon
        return (
          <button
            key={entry.view}
            type="button"
            aria-label={entry.label}
            title={entry.label}
            disabled={!entry.enabled}
            data-active={view === entry.view}
            onClick={() => {
              useCanvassStore.getState().setView(entry.view)
            }}
            className={cn(
              'flex size-11 items-center justify-center rounded-lg text-zinc-400 transition-colors',
              view === entry.view && 'bg-zinc-800 text-zinc-100',
              entry.enabled
                ? 'hover:bg-zinc-800/70 hover:text-zinc-200'
                : 'opacity-40'
            )}
          >
            <Icon className="size-5" aria-hidden />
          </button>
        )
      })}
      <div className="flex-1" />
      <SignOutButton />
    </nav>
  )
}

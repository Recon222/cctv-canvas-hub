import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import type { PopOutView } from '@/lib/services/sessionEvents'
import { SignOutButton } from '@/features/cloud-session'
import { openViewWindow } from '../services/viewWindows'
import { useCanvassStore, type CanvassView } from '../store/canvass-store'

/**
 * The slim icon rail (AD12) — navigation chrome in the repurposed
 * LeftSideBar slot, NOT an info panel. `case`/`map` need a selected
 * case. A flex column with room for a fourth entry (V2 admin). Sign-out
 * stays reachable from the rail's foot (D4).
 *
 * M7 (7.3B): the ↗ glyph is a REAL pop-out affordance on the `case` and
 * `map` entries only — never `cases`, which is bound to the main window
 * (#119). It opens (or focuses+retargets) the view's secondary window
 * with the selected case (#112–113); the popped state renders on the
 * glyph (gold) from `poppedViews`.
 *
 * Case File restyle: 86px labeled rail — investigators are not
 * tech-savvy, every entry carries its word (design_handoff §1).
 */

function CrosshairLogo() {
  return (
    <svg
      width="34"
      height="34"
      viewBox="0 0 34 34"
      fill="none"
      aria-hidden
      className="text-hub-accent"
    >
      <circle cx="17" cy="17" r="12" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M17 1.5v7M17 25.5v7M1.5 17h7M25.5 17h7"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <circle cx="17" cy="17" r="3.4" className="fill-hub-working" />
    </svg>
  )
}

function PopOutGlyph() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M15 3h6v6" />
      <path d="M10 14 21 3" />
      <path d="M20 13v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h6" />
    </svg>
  )
}

const RAIL_ICONS: Record<CanvassView, ReactNode> = {
  cases: (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 8a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    </svg>
  ),
  case: (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <rect x="3" y="3" width="7" height="9" rx="1" />
      <rect x="14" y="3" width="7" height="5" rx="1" />
      <rect x="14" y="12" width="7" height="9" rx="1" />
      <rect x="3" y="16" width="7" height="5" rx="1" />
    </svg>
  ),
  map: (
    <svg
      width="21"
      height="21"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </svg>
  ),
}

export function NavRail() {
  const { t } = useTranslation()
  const view = useCanvassStore(state => state.view)
  const hasSelectedCase = useCanvassStore(
    state => state.selectedCaseId !== null
  )
  const poppedViews = useCanvassStore(state => state.poppedViews)

  const entries: {
    view: CanvassView
    label: string
    enabled: boolean
    /** Non-null on the entries that can pop out (never `cases`, #119). */
    popOut: PopOutView | null
  }[] = [
    {
      view: 'cases',
      label: t('canvass.nav.cases'),
      enabled: true,
      popOut: null,
    },
    {
      view: 'case',
      label: t('canvass.nav.case'),
      enabled: hasSelectedCase,
      popOut: 'case',
    },
    {
      view: 'map',
      label: t('canvass.nav.map'),
      enabled: hasSelectedCase,
      popOut: 'map',
    },
  ]

  const handlePopOut = (popOutView: PopOutView) => {
    const caseId = useCanvassStore.getState().selectedCaseId
    if (caseId === null) {
      return
    }
    openViewWindow(popOutView, caseId).catch((cause: unknown) => {
      logger.error('Failed to open the view window', {
        view: popOutView,
        cause,
      })
      toast.error(t('canvass.nav.popOutFailed'))
    })
  }

  return (
    <nav className="flex w-[86px] shrink-0 flex-col items-center gap-1.5 border-e border-hub-hairline bg-hub-chrome py-4">
      <div
        className="mb-3 flex size-10 items-center justify-center"
        aria-hidden
      >
        <CrosshairLogo />
      </div>
      {entries.map(entry => (
        <div key={entry.view} className="relative">
          <button
            type="button"
            aria-label={entry.label}
            title={entry.enabled ? entry.label : t('canvass.nav.needsCase')}
            disabled={!entry.enabled}
            data-active={view === entry.view}
            onClick={() => {
              useCanvassStore.getState().setView(entry.view)
            }}
            className={cn(
              'relative flex h-[60px] w-[68px] flex-col items-center justify-center gap-1.5 rounded-md border border-transparent text-hub-muted transition-colors',
              view === entry.view &&
                'border-hub-hairline-bright bg-hub-accent/10 text-hub-heading',
              entry.enabled
                ? 'hover:text-hub-heading'
                : 'cursor-not-allowed text-hub-ghost opacity-45'
            )}
          >
            {RAIL_ICONS[entry.view]}
            <span className="font-stmono text-[9px] uppercase tracking-[1.5px]">
              {entry.label}
            </span>
          </button>
          {entry.popOut !== null && (
            // Sibling, never nested — a button inside a button is
            // invalid HTML and AT reports neither.
            <button
              type="button"
              aria-label={t('canvass.nav.popOutLabel', { view: entry.label })}
              title={
                poppedViews[entry.popOut]
                  ? t('canvass.nav.popped')
                  : t('canvass.nav.popOutLabel', { view: entry.label })
              }
              disabled={!entry.enabled}
              data-popped={poppedViews[entry.popOut]}
              onClick={() => {
                if (entry.popOut !== null) {
                  handlePopOut(entry.popOut)
                }
              }}
              className={cn(
                'absolute end-0.5 top-0.5 rounded-sm p-1 transition-colors',
                poppedViews[entry.popOut]
                  ? 'text-hub-working'
                  : 'text-hub-ghost hover:text-hub-heading',
                !entry.enabled && 'cursor-not-allowed opacity-45'
              )}
            >
              <PopOutGlyph />
            </button>
          )}
        </div>
      ))}
      {/* Reserved V2 admin slot (design_handoff §1) */}
      <div
        aria-hidden
        className="h-[60px] w-[68px] rounded-md border border-dashed border-hub-hairline/80"
      />
      <div className="flex-1" />
      <SignOutButton />
    </nav>
  )
}

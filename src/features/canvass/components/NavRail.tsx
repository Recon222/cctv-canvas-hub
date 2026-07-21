import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { SignOutButton } from '@/features/cloud-session'
import { useCanvassStore, type CanvassView } from '../store/canvass-store'

/**
 * The slim icon rail (AD12) — navigation chrome in the repurposed
 * LeftSideBar slot, NOT an info panel. `case`/`map` need a selected
 * case. A flex column with room for a fourth entry (V2 admin). Sign-out
 * stays reachable from the rail's foot (D4). Pop-out affordances are M7
 * (the ↗ glyph is presentation only — it previews the future posture).
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
      className="absolute end-1 top-1 text-hub-ghost"
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

  const entries: {
    view: CanvassView
    label: string
    enabled: boolean
    popOut: boolean
  }[] = [
    {
      view: 'cases',
      label: t('canvass.nav.cases'),
      enabled: true,
      popOut: false,
    },
    {
      view: 'case',
      label: t('canvass.nav.case'),
      enabled: hasSelectedCase,
      popOut: true,
    },
    {
      view: 'map',
      label: t('canvass.nav.map'),
      enabled: hasSelectedCase,
      popOut: true,
    },
  ]

  return (
    <nav className="flex w-[86px] shrink-0 flex-col items-center gap-1.5 border-e border-hub-hairline bg-hub-chrome py-4">
      <div
        className="mb-3 flex size-10 items-center justify-center"
        aria-hidden
      >
        <CrosshairLogo />
      </div>
      {entries.map(entry => (
        <button
          key={entry.view}
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
          {entry.popOut && <PopOutGlyph />}
        </button>
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

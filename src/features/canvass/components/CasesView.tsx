import { useTranslation } from 'react-i18next'
import { useCases } from '../hooks/useCases'
import { useLocationCounts } from '../hooks/useLocationCounts'
import { useNow } from '../hooks/useNow'
import { useCanvassStore } from '../store/canvass-store'
import { formatBoardTimestamp } from '../services/format'
import type { LocationStatusCounts } from '../services/canvassService'
import type { CanvassCase, CanvassLocation } from '../types'

/**
 * The A1 landing view (AD12): one card per active case — number, name,
 * incident address, live status counts, last activity. Selecting a card
 * opens the case view. Replaces the originally-planned CaseSwitcher
 * dropdown: the multi-case reality stays visible.
 *
 * Case File restyle (design_handoff §2): panel cards on the dark ground,
 * gold mono case numbers, JetBrains Mono status counts in the status
 * trio colors. Data wiring unchanged.
 */
export function CasesView() {
  const { t } = useTranslation()
  const { data: cases, isPending } = useCases()
  // ONE counts query for the whole wall — never a query per card.
  const { data: counts } = useLocationCounts(
    (cases ?? []).map(canvassCase => canvassCase.id)
  )
  // One ticking clock for every card's recency dot (Date.now() in
  // render violates the React Compiler purity rule).
  const now = useNow(60_000)

  if (isPending) {
    return <p className="p-8 text-lg text-hub-faint">{t('canvass.loading')}</p>
  }
  // Only blank when there is genuinely no data: a failed background
  // reconcile keeps the cached list on the wall (stale-visible beats
  // blank — the M5 health UI carries the degradation signal).
  if (cases === undefined) {
    return (
      <p role="alert" className="p-8 text-lg text-hub-danger">
        {t('canvass.cases.error')}
      </p>
    )
  }
  if (cases.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <span
          aria-hidden
          className="size-2.5 animate-pulse rounded-full bg-hub-complete [box-shadow:var(--hub-glow-complete)]"
        />
        <p className="font-nacelle text-3xl font-semibold text-hub-heading">
          {t('canvass.cases.empty.title')}
        </p>
        <p className="max-w-md text-lg text-hub-muted [text-wrap:pretty]">
          {t('canvass.cases.empty.description')}
        </p>
        <p className="mt-2 font-stmono text-[10px] uppercase tracking-[2px] text-hub-ghost">
          {t('canvass.cases.empty.listening')}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-hub-ground p-9">
      <div className="mb-6 flex items-baseline gap-4">
        <h1 className="font-nacelle text-2xl font-semibold tracking-tight text-hub-heading">
          {t('canvass.cases.title')}
        </h1>
        <p className="font-stmono text-xs uppercase tracking-[2px] text-hub-faint">
          {t('canvass.cases.syncedCount', { count: cases.length })}
        </p>
      </div>
      <div className="grid max-w-[1500px] grid-cols-[repeat(auto-fill,minmax(400px,1fr))] gap-5">
        {cases.map(canvassCase => (
          <CaseCard
            key={canvassCase.id}
            canvassCase={canvassCase}
            now={now}
            // No counts data at all ⇒ unknown (the card refuses to invent
            // zeros); a case absent from a SUCCESSFUL fetch genuinely has
            // no locations.
            counts={
              counts === undefined
                ? undefined
                : (counts[canvassCase.id] ?? ZERO_COUNTS)
            }
          />
        ))}
      </div>
    </div>
  )
}

const COUNTED_STATUSES: CanvassLocation['status'][] = [
  'started',
  'working',
  'complete',
]

const STATUS_COUNT_COLOR: Record<CanvassLocation['status'], string> = {
  started: 'text-hub-started',
  working: 'text-hub-working',
  complete: 'text-hub-complete',
}

// Frozen: one shared instance is handed to every card — a mutation
// anywhere would corrupt the fallback for the session (review LOW).
const ZERO_COUNTS: LocationStatusCounts = Object.freeze({
  started: 0,
  working: 0,
  complete: 0,
})

function CaseCard({
  canvassCase,
  counts,
  now,
}: {
  canvassCase: CanvassCase
  counts: LocationStatusCounts | undefined
  now: number
}) {
  const { t } = useTranslation()

  const lastActivity = new Date(canvassCase.updatedAt)
  // Presentation-only recency dot: cyan when the case moved in the last
  // 10 minutes, ghost otherwise. Derived from the ticking `now`, never
  // stored.
  const recent =
    !Number.isNaN(lastActivity.getTime()) &&
    now - lastActivity.getTime() < 10 * 60_000
  return (
    <button
      type="button"
      onClick={() => {
        const store = useCanvassStore.getState()
        store.selectCase(canvassCase.id)
        store.setView('case')
      }}
      className="flex flex-col gap-3 rounded-lg border border-hub-hairline bg-hub-panel p-6 pb-4 text-start transition-[border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-hub-hairline-bright"
    >
      <div className="flex items-center gap-2.5">
        <p className="font-jbmono text-[12.5px] text-hub-working">
          {canvassCase.caseNumber}
        </p>
        <span className="flex-1" />
        <span
          aria-hidden
          className={
            recent
              ? 'size-2 rounded-full bg-hub-complete [box-shadow:var(--hub-glow-complete)]'
              : 'size-2 rounded-full bg-hub-ghost'
          }
        />
      </div>
      <div>
        <p className="font-nacelle text-xl font-semibold leading-tight text-hub-heading [text-wrap:pretty]">
          {canvassCase.displayName ?? canvassCase.caseNumber}
        </p>
        <p className="mt-1 text-[13.5px] text-hub-muted">
          {canvassCase.incidentAddress}
        </p>
      </div>
      <div className="h-px bg-hub-row-divider" />
      <div className="flex items-end gap-6">
        {COUNTED_STATUSES.map(status => (
          <span key={status} className="flex flex-col gap-0.5">
            <span
              className={`font-jbmono text-2xl leading-none ${STATUS_COUNT_COLOR[status]}`}
            >
              {/* A number we don't have renders as "—", never a fabricated
                  zero indistinguishable from an untouched case. */}
              {counts?.[status] ?? '—'}
            </span>
            <span className="font-stmono text-[9px] uppercase tracking-[1.5px] text-hub-faint">
              {t(`canvass.status.${status}`)}
            </span>
          </span>
        ))}
        <span className="flex-1" />
        <p className="font-stmono text-[10px] uppercase tracking-[1.5px] text-hub-ghost">
          {t('canvass.cases.lastActivity', {
            time: Number.isNaN(lastActivity.getTime())
              ? canvassCase.updatedAt
              : formatBoardTimestamp(canvassCase.updatedAt),
          })}
        </p>
      </div>
    </button>
  )
}

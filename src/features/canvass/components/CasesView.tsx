import { useTranslation } from 'react-i18next'
import { useCases } from '../hooks/useCases'
import { useLocationCounts } from '../hooks/useLocationCounts'
import { useCanvassStore } from '../store/canvass-store'
import type { LocationStatusCounts } from '../services/canvassService'
import type { CanvassCase, CanvassLocation } from '../types'

/**
 * The A1 landing view (AD12): one card per active case — number, name,
 * incident address, live status counts, last activity. Selecting a card
 * opens the case view. Replaces the originally-planned CaseSwitcher
 * dropdown: the multi-case reality stays visible.
 */
export function CasesView() {
  const { t } = useTranslation()
  const { data: cases, isPending } = useCases()
  // ONE counts query for the whole wall — never a query per card.
  const { data: counts } = useLocationCounts(
    (cases ?? []).map(canvassCase => canvassCase.id)
  )

  if (isPending) {
    return <p className="p-8 text-lg text-zinc-500">{t('canvass.loading')}</p>
  }
  // Only blank when there is genuinely no data: a failed background
  // reconcile keeps the cached list on the wall (stale-visible beats
  // blank — the M5 health UI carries the degradation signal).
  if (cases === undefined) {
    return (
      <p role="alert" className="p-8 text-lg text-red-400">
        {t('canvass.cases.error')}
      </p>
    )
  }
  if (cases.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-3xl font-semibold text-zinc-300">
          {t('canvass.cases.empty.title')}
        </p>
        <p className="max-w-md text-lg text-zinc-500">
          {t('canvass.cases.empty.description')}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto p-8">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-zinc-100">
        {t('canvass.cases.title')}
      </h1>
      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {cases.map(canvassCase => (
          <CaseCard
            key={canvassCase.id}
            canvassCase={canvassCase}
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

const ZERO_COUNTS: LocationStatusCounts = {
  started: 0,
  working: 0,
  complete: 0,
}

function CaseCard({
  canvassCase,
  counts,
}: {
  canvassCase: CanvassCase
  counts: LocationStatusCounts | undefined
}) {
  const { t } = useTranslation()

  const lastActivity = new Date(canvassCase.updatedAt)
  return (
    <button
      type="button"
      onClick={() => {
        const store = useCanvassStore.getState()
        store.selectCase(canvassCase.id)
        store.setView('case')
      }}
      className="flex flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-start transition-colors hover:border-zinc-600"
    >
      <div>
        <p className="text-sm font-medium uppercase tracking-widest text-zinc-500">
          {canvassCase.caseNumber}
        </p>
        <p className="mt-1 text-xl font-semibold tracking-tight text-zinc-100">
          {canvassCase.displayName ?? canvassCase.caseNumber}
        </p>
        <p className="mt-1 text-base text-zinc-400">
          {canvassCase.incidentAddress}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {COUNTED_STATUSES.map(status => (
          <span
            key={status}
            className="rounded-full bg-zinc-800 px-3 py-1 text-sm text-zinc-300"
          >
            {/* A number we don't have renders as "—", never a fabricated
                zero indistinguishable from an untouched case. */}
            {counts?.[status] ?? '—'} {t(`canvass.status.${status}`)}
          </span>
        ))}
      </div>
      <p className="text-sm text-zinc-500">
        {t('canvass.cases.lastActivity', {
          time: Number.isNaN(lastActivity.getTime())
            ? canvassCase.updatedAt
            : lastActivity.toLocaleString(),
        })}
      </p>
    </button>
  )
}

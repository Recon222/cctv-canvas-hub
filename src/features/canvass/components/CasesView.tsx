import { useTranslation } from 'react-i18next'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useCanvassStore } from '../store/canvass-store'
import type { CanvassCase, CanvassLocation } from '../types'

/**
 * The A1 landing view (AD12): one card per active case — number, name,
 * incident address, live status counts, last activity. Selecting a card
 * opens the case view. Replaces the originally-planned CaseSwitcher
 * dropdown: the multi-case reality stays visible.
 */
export function CasesView() {
  const { t } = useTranslation()
  const { data: cases, isPending, isError } = useCases()

  if (isPending) {
    return <p className="p-8 text-lg text-zinc-500">{t('canvass.loading')}</p>
  }
  if (isError) {
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
          <CaseCard key={canvassCase.id} canvassCase={canvassCase} />
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

function CaseCard({ canvassCase }: { canvassCase: CanvassCase }) {
  const { t } = useTranslation()
  const { data: locations } = useCaseLocations(canvassCase.id)

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
            {(locations ?? []).filter(l => l.status === status).length}{' '}
            {t(`canvass.status.${status}`)}
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

import { useTranslation } from 'react-i18next'
import { useCanvassStore } from '../store/canvass-store'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { LocationCard } from './LocationCard'
import type { CanvassLocation } from '../types'

/**
 * The vertical case-grouped card list (Phase 2.4B) — M2's interim
 * `'case'` view content (DashboardView is M5). Grouped by status;
 * empty states are designed states, never blank screens.
 */

const STATUS_ORDER: CanvassLocation['status'][] = [
  'working',
  'started',
  'complete',
]

export function LocationCardStack() {
  const { t } = useTranslation()
  const caseId = useCanvassStore(state => state.selectedCaseId)
  const { data: locations, isPending } = useCaseLocations(caseId)

  if (caseId === null) {
    return (
      <EmptyState
        title={t('canvass.locations.empty.title')}
        description={t('canvass.locations.empty.description')}
      />
    )
  }
  if (isPending) {
    return <p className="p-8 text-lg text-zinc-500">{t('canvass.loading')}</p>
  }
  // Only blank when there is genuinely no data — a failed background
  // reconcile keeps the cached cards rendering (stale-visible beats blank).
  if (locations === undefined) {
    return (
      <p role="alert" className="p-8 text-lg text-red-400">
        {t('canvass.locations.error')}
      </p>
    )
  }
  if (locations.length === 0) {
    return (
      <EmptyState
        title={t('canvass.locations.empty.title')}
        description={t('canvass.locations.empty.description')}
      />
    )
  }

  // Drift posture: the status union is closed, but a wire value it
  // doesn't model must SHOW on the board, not silently vanish from a
  // fixed group order (review LOW: an unmodeled status rendered nowhere).
  const unmodeled = locations.filter(
    location => !STATUS_ORDER.includes(location.status)
  )
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {STATUS_ORDER.map(status => {
          const group = locations.filter(location => location.status === status)
          if (group.length === 0) {
            return null
          }
          return (
            <section key={status} aria-label={t(`canvass.status.${status}`)}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
                {t(`canvass.status.${status}`)} · {group.length}
              </h2>
              <div className="flex flex-col gap-3">
                {group.map(location => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          )
        })}
        {unmodeled.length > 0 && (
          <section aria-label={t('canvass.status.other')}>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-zinc-500">
              {t('canvass.status.other')} · {unmodeled.length}
            </h2>
            <div className="flex flex-col gap-3">
              {unmodeled.map(location => (
                <LocationCard key={location.id} location={location} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function EmptyState({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <p className="text-3xl font-semibold text-zinc-300">{title}</p>
      <p className="max-w-md text-lg text-zinc-500">{description}</p>
    </div>
  )
}

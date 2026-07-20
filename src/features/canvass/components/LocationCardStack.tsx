import { useTranslation } from 'react-i18next'
import { useCanvassStore } from '../store/canvass-store'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { LocationCard } from './LocationCard'
import type { CanvassLocation } from '../types'

/**
 * The vertical case-grouped card list (Phase 2.4B) — M2's interim
 * `'case'` view content (DashboardView is M5), and the §4 floating
 * stack once the map lands (3.4A repositions it; the column styling
 * below already tolerates both homes). Grouped by status; empty states
 * are designed states, never blank screens.
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
    return <p className="p-8 text-lg text-hub-faint">{t('canvass.loading')}</p>
  }
  // Only blank when there is genuinely no data — a failed background
  // reconcile keeps the cached cards rendering (stale-visible beats blank).
  if (locations === undefined) {
    return (
      <p role="alert" className="p-8 text-lg text-hub-danger">
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
    <div className="h-full overflow-y-auto bg-hub-ground p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        {STATUS_ORDER.map(status => {
          const group = locations.filter(location => location.status === status)
          if (group.length === 0) {
            return null
          }
          return (
            <section key={status} aria-label={t(`canvass.status.${status}`)}>
              <h2 className="mb-3 font-stmono text-[11px] uppercase tracking-[2.5px] text-hub-muted">
                {t(`canvass.status.${status}`)} · {group.length}
              </h2>
              <div className="flex flex-col gap-2.5">
                {group.map(location => (
                  <LocationCard key={location.id} location={location} />
                ))}
              </div>
            </section>
          )
        })}
        {unmodeled.length > 0 && (
          <section aria-label={t('canvass.status.other')}>
            <h2 className="mb-3 font-stmono text-[11px] uppercase tracking-[2.5px] text-hub-muted">
              {t('canvass.status.other')} · {unmodeled.length}
            </h2>
            <div className="flex flex-col gap-2.5">
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
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-hub-ground p-8 text-center">
      <span
        aria-hidden
        className="size-2.5 animate-pulse rounded-full bg-hub-complete [box-shadow:var(--hub-glow-complete)]"
      />
      <p className="font-nacelle text-3xl font-semibold text-hub-heading">
        {title}
      </p>
      <p className="max-w-md text-lg text-hub-muted [text-wrap:pretty]">
        {description}
      </p>
    </div>
  )
}

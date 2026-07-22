import { useTranslation } from 'react-i18next'
import { useCanvassStore } from '../store/canvass-store'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useCaseMedia } from '../hooks/useCaseMedia'
import { DashboardView } from './DashboardView'
import type { LocationStatusCounts } from '../services/canvassService'
import type { CanvassLocation, CanvassMedia } from '../types'

/**
 * The case view's host (Phase 5.3A, AD12: Cases → Case dashboard →
 * Map): derives the poured DashboardView's props from the loaded
 * queries. As of 6.3C the view IS the dashboard alone — the M5-interim
 * feed column moved into the ProcessPanel's ACTIVITY lane
 * (PanelActivityLane, composed by CanvassRoot), and the recomposed
 * DashboardView's roster owns the freed width (test #98 amended in
 * place per doc 03's sanctioned exception).
 */

/** Counts from the LOADED rows — never the landing counts query (that
 * family serves the cases view). Mirrors fetchLocationCounts' drift
 * guard: an unmodeled wire status is visible in the stack's catch-all,
 * not silently counted here. */
function deriveCounts(locations: CanvassLocation[]): LocationStatusCounts {
  const counts: LocationStatusCounts = { started: 0, working: 0, complete: 0 }
  for (const location of locations) {
    const status: string = location.status
    if (status === 'started' || status === 'working' || status === 'complete') {
      counts[status] += 1
    }
  }
  return counts
}

/** Newest media row's timestamp (epoch ms); null when none/unparseable. */
function deriveLastMediaAt(media: CanvassMedia[]): number | null {
  let latest: number | null = null
  for (const row of media) {
    const at = new Date(row.createdAt).getTime()
    if (!Number.isNaN(at) && (latest === null || at > latest)) {
      latest = at
    }
  }
  return latest
}

export function CaseDashboard() {
  const { t } = useTranslation()
  const caseId = useCanvassStore(state => state.selectedCaseId)
  const { data: cases, isPending: casesPending } = useCases()
  const { data: locations, isPending: locationsPending } =
    useCaseLocations(caseId)
  const { data: media } = useCaseMedia(caseId)

  const canvassCase = cases?.find(c => c.id === caseId)

  if (casesPending || locationsPending) {
    return <p className="p-8 text-lg text-hub-faint">{t('canvass.loading')}</p>
  }
  if (canvassCase === undefined || locations === undefined) {
    // Selection points at a case the list no longer carries (or the
    // first fetch failed) — an honest designed error, never blank.
    return (
      <p role="alert" className="p-8 text-lg text-hub-danger">
        {t('canvass.cases.error')}
      </p>
    )
  }

  const mediaRows = media ?? []
  const officerInCharge =
    canvassCase.oicName === null
      ? undefined
      : canvassCase.oicBadgeNumber === null
        ? canvassCase.oicName
        : `${canvassCase.oicName} · ${canvassCase.oicBadgeNumber}`

  return (
    <div className="h-full min-h-0 bg-hub-ground">
      <DashboardView
        canvassCase={canvassCase}
        locations={locations}
        counts={deriveCounts(locations)}
        media={mediaRows}
        officerInCharge={officerInCharge}
        lastMediaAt={deriveLastMediaAt(mediaRows)}
      />
    </div>
  )
}

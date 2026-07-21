import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useHealthStore, type HealthState } from '@/store/health-store'
import { useCanvassStore } from '../store/canvass-store'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useCaseMedia } from '../hooks/useCaseMedia'
import { useNow } from '../hooks/useNow'
import { DashboardView } from './DashboardView'
import { ActivityFeed } from './ActivityFeed'
import type { LocationStatusCounts } from '../services/canvassService'
import type { CanvassLocation, CanvassMedia } from '../types'

/**
 * The case view's host (Phase 5.3A, AD12: Cases → Case dashboard →
 * Map): derives the poured DashboardView's props from the loaded
 * queries and composes the M5-INTERIM feed column beside it (design §3
 * two-column `1fr 400px`). The poured DashboardView is the 6.3C
 * recomposed final (no feed column by design) — the interim hosting is
 * HOST-level composition only; 6.3C drops this column, relocates the
 * feed into the ProcessPanel's ACTIVITY lane, and the view becomes the
 * dashboard alone (test #98 amended in place then).
 */

/** Feed-header dot per health state — the design's "LIVE ACTIVITY"
 * connection dot, honest like the chip (never a hardcoded green). */
const FEED_DOT: Record<HealthState, string> = {
  live: 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]',
  connecting: 'bg-hub-accent [box-shadow:var(--hub-glow-accent)]',
  reconnecting: 'bg-hub-working [box-shadow:var(--hub-glow-working)]',
  stale: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
  offline: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
}

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
  const activity = useCanvassStore(state => state.activity)
  const healthState = useHealthStore(state => state.state)
  // 1 s tick drives the feed's 12 s freshness tint (useNow — never
  // Date.now() in render).
  const now = useNow(1_000)
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
  const entries = activity.filter(entry => entry.caseId === canvassCase.id)
  const officerInCharge =
    canvassCase.oicName === null
      ? undefined
      : canvassCase.oicBadgeNumber === null
        ? canvassCase.oicName
        : `${canvassCase.oicName} · ${canvassCase.oicBadgeNumber}`

  return (
    <div className="grid h-full min-h-0 grid-cols-[1fr_400px] bg-hub-ground">
      <div className="min-h-0 min-w-0">
        <DashboardView
          canvassCase={canvassCase}
          locations={locations}
          counts={deriveCounts(locations)}
          media={mediaRows}
          officerInCharge={officerInCharge}
          lastMediaAt={deriveLastMediaAt(mediaRows)}
        />
      </div>
      {/* M5-interim feed column (design §3 right column) — removed at
          6.3C when the ProcessPanel's ACTIVITY lane takes the feed. */}
      <aside
        aria-label={t('canvass.feed.title')}
        className="flex min-h-0 flex-col border-s border-hub-hairline bg-hub-panel"
      >
        <header className="flex shrink-0 items-center gap-2.5 border-b border-hub-hairline px-4 py-3">
          <h2 className="flex-1 font-stmono text-[11px] uppercase tracking-[2.5px] text-hub-muted">
            {t('canvass.feed.title')}
          </h2>
          <span
            aria-hidden
            className={cn('size-2 rounded-full', FEED_DOT[healthState])}
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ActivityFeed entries={entries} now={now} />
        </div>
      </aside>
    </div>
  )
}

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, MapPinOff, Image as ImageIcon, Video } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatBoardTimestamp, formatClockTime } from '../services/format'
import type { CanvassCase, CanvassLocation, CanvassMedia } from '../types'
import type { LocationStatusCounts } from '../services/canvassService'

/**
 * The case dashboard (Phase 5.3A, design_handoff §3, recomposed final):
 * incident panel · four stat tiles · media strip · roster grid
 * (15+ investigators, inline-expandable location rows). NO activity
 * feed column — the feed lives in the process panel (plan 6.3C).
 *
 * Typed props only (M5 wiring is agent-owned): the host derives the
 * roster from locations (investigator grouping per AD8) and passes
 * media summaries. Expansion state is local (presentation).
 */

export interface DashboardViewProps {
  canvassCase: CanvassCase
  locations: CanvassLocation[]
  counts: LocationStatusCounts
  media: CanvassMedia[]
  /** OIC line, e.g. "DET. SGT. R. WHITFIELD · 2201" (case metadata). */
  officerInCharge?: string
  /** Epoch ms of the newest media row; host derives from `media`. */
  lastMediaAt?: number | null
}

interface RosterEntry {
  investigator: string
  locations: CanvassLocation[]
}

const STATUS_DOT: Record<CanvassLocation['status'], string> = {
  started: 'bg-hub-started [box-shadow:var(--hub-glow-started)]',
  working: 'bg-hub-working [box-shadow:var(--hub-glow-working)]',
  complete: 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]',
}

const STATUS_TILE: Record<
  CanvassLocation['status'],
  { border: string; value: string }
> = {
  started: { border: 'border-hub-started/40', value: 'text-hub-started' },
  working: { border: 'border-hub-working/35', value: 'text-hub-working' },
  complete: { border: 'border-hub-complete/35', value: 'text-hub-complete' },
}

export function DashboardView({
  canvassCase,
  locations,
  counts,
  media,
  officerInCharge,
  lastMediaAt = null,
}: DashboardViewProps) {
  const { t } = useTranslation()

  const roster = buildRoster(locations)
  const noFix = locations.filter(location => location.coord === null).length
  // `type` is the MediaKind union (PR #7 M1) — a wrong literal here is
  // now a compile error, and drifted wire values arrive as 'unknown'.
  const photos = media.filter(item => item.type === 'image').length
  const videos = media.filter(item => item.type === 'video').length
  const total = locations.length
  const pct = total === 0 ? null : Math.round((counts.complete / total) * 100)

  return (
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-hub-ground p-5">
      {/* Incident + stat tiles */}
      <div className="grid shrink-0 grid-cols-[380px_1fr] gap-4">
        <section
          aria-label={t('canvass.dashboard.incident')}
          className="rounded-md border border-hub-hairline bg-hub-panel px-6 py-4"
        >
          <p className="mb-1 font-stmono text-[10px] uppercase tracking-[3px] text-hub-danger">
            {t('canvass.dashboard.incident')}
          </p>
          <p className="font-nacelle text-xl font-semibold text-hub-heading">
            {canvassCase.incidentBusinessName}
          </p>
          <p className="mt-0.5 text-sm text-hub-muted">
            {canvassCase.incidentAddress}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            <span className="font-jbmono text-xs text-hub-danger">
              {t('canvass.dashboard.occurred', {
                time: formatBoardTimestamp(canvassCase.createdAt),
              })}
            </span>
            {officerInCharge !== undefined && (
              <span className="font-stmono text-[10.5px] uppercase tracking-[1px] text-hub-faint">
                {t('canvass.dashboard.oic', { name: officerInCharge })}
              </span>
            )}
          </div>
        </section>
        <div className="grid grid-cols-4 gap-3.5">
          <StatTile
            value={total}
            label={t('canvass.dashboard.tiles.locations')}
            sub={
              noFix > 0
                ? t('canvass.dashboard.tiles.noFixCount', { count: noFix })
                : t('canvass.dashboard.tiles.allGeolocated')
            }
            borderClass="border-hub-hairline"
            valueClass="text-hub-heading"
          />
          <StatTile
            value={counts.started}
            label={t('canvass.status.started')}
            sub={t('canvass.dashboard.tiles.onScene')}
            borderClass={STATUS_TILE.started.border}
            valueClass={STATUS_TILE.started.value}
          />
          <StatTile
            value={counts.working}
            label={t('canvass.status.working')}
            sub={t('canvass.dashboard.tiles.collecting')}
            borderClass={STATUS_TILE.working.border}
            valueClass={STATUS_TILE.working.value}
          />
          <StatTile
            value={counts.complete}
            label={t('canvass.status.complete')}
            sub={
              pct === null
                ? '—'
                : t('canvass.dashboard.tiles.percentDone', { pct })
            }
            borderClass={STATUS_TILE.complete.border}
            valueClass={STATUS_TILE.complete.value}
          />
        </div>
      </div>

      {/* Media strip */}
      <div className="flex shrink-0 items-center gap-5 rounded-md border border-hub-hairline bg-hub-panel px-5 py-2.5">
        <span className="font-stmono text-[10px] uppercase tracking-[2px] text-hub-faint">
          {t('canvass.dashboard.mediaCollected')}
        </span>
        <span className="flex items-center gap-2 text-hub-accent">
          <ImageIcon className="size-[15px]" aria-hidden />
          <span className="font-jbmono text-sm text-hub-body-2">
            {t('canvass.media.photoCount', { count: photos })}
          </span>
        </span>
        <span className="flex items-center gap-2 text-hub-accent">
          <Video className="size-[15px]" aria-hidden />
          <span className="font-jbmono text-sm text-hub-body-2">
            {t('canvass.media.videoCount', { count: videos })}
          </span>
        </span>
        <span className="flex-1" />
        <span className="font-jbmono text-[11.5px] uppercase text-hub-faint">
          {t('canvass.dashboard.lastMedia', {
            time: lastMediaAt === null ? '—' : formatClockTime(lastMediaAt),
          })}
        </span>
      </div>

      {/* Roster */}
      {total === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-hub-hairline text-center">
          <span
            aria-hidden
            className="size-2.5 animate-pulse rounded-full bg-hub-complete [box-shadow:var(--hub-glow-complete)]"
          />
          <p className="font-nacelle text-xl font-semibold text-hub-heading">
            {t('canvass.dashboard.empty.title')}
          </p>
          <p className="max-w-sm text-sm text-hub-muted [text-wrap:pretty]">
            {t('canvass.dashboard.empty.description')}
          </p>
        </div>
      ) : (
        <section
          aria-label={t('canvass.dashboard.roster')}
          className="flex min-h-0 flex-1 flex-col gap-2.5"
        >
          <h2 className="ps-0.5 font-stmono text-[11px] uppercase tracking-[2.5px] text-hub-muted">
            {t('canvass.dashboard.roster')}
          </h2>
          {/* auto-fill grid: 15+ investigators wrap and scroll (§3) */}
          <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(380px,1fr))] content-start gap-3.5 overflow-y-auto pe-0.5">
            {roster.map(entry => (
              <InvestigatorCard key={entry.investigator} entry={entry} />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

function StatTile({
  value,
  label,
  sub,
  borderClass,
  valueClass,
}: {
  value: number
  label: string
  sub: string
  borderClass: string
  valueClass: string
}) {
  return (
    <div
      className={cn(
        'flex flex-col justify-center gap-1 rounded-md border bg-hub-panel px-4 py-3',
        borderClass
      )}
    >
      <span className={cn('font-jbmono text-5xl leading-none', valueClass)}>
        {value}
      </span>
      <span className="font-stmono text-[10px] uppercase tracking-[2px] text-hub-muted">
        {label}
      </span>
      <span className="font-stmono text-[9.5px] uppercase tracking-[1px] text-hub-faint">
        {sub}
      </span>
    </div>
  )
}

function buildRoster(locations: CanvassLocation[]): RosterEntry[] {
  const byInvestigator = new Map<string, CanvassLocation[]>()
  for (const location of locations) {
    const group = byInvestigator.get(location.investigator)
    if (group === undefined) {
      byInvestigator.set(location.investigator, [location])
    } else {
      group.push(location)
    }
  }
  return [...byInvestigator.entries()].map(([investigator, group]) => ({
    investigator,
    locations: group,
  }))
}

function initials(name: string): string {
  const words = name
    .replace(/^det\.?\s+/i, '')
    .split(/\s+/)
    .filter(word => word.length > 0)
  const first = words[0]?.charAt(0) ?? ''
  const last = words.length > 1 ? (words.at(-1)?.charAt(0) ?? '') : ''
  return `${first}${last}`.toUpperCase() || '—'
}

function InvestigatorCard({ entry }: { entry: RosterEntry }) {
  const { t } = useTranslation()
  return (
    <article className="self-start rounded-md border border-hub-hairline bg-hub-panel p-4">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className="flex size-[34px] shrink-0 items-center justify-center rounded-full border border-hub-accent/40 bg-hub-accent/10 font-stmono text-xs text-hub-accent"
        >
          {initials(entry.investigator)}
        </span>
        <span className="min-w-0 truncate font-stmono text-[12.5px] uppercase tracking-[1px] text-hub-heading">
          {entry.investigator}
        </span>
        <span className="flex-1" />
        <span className="rounded-[3px] bg-hub-chip px-2 py-1 font-jbmono text-[11px] uppercase text-hub-muted">
          {t('canvass.dashboard.locCount', { count: entry.locations.length })}
        </span>
      </div>
      <div className="mt-2 flex flex-col">
        {entry.locations.map(location => (
          <RosterRow key={location.id} location={location} />
        ))}
      </div>
    </article>
  )
}

/**
 * Collapsed: dot · name + address · arrival · chevron. Expanded: the
 * detail block (DVR grid, notes, no-fix chip) — same content language
 * as LocationCard §4. Media thumbs mount here at M4 wiring (MediaThumb).
 */
function RosterRow({ location }: { location: CanvassLocation }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const dvr = location.dvr
  const dvrRows: { label: string; value: string }[] = dvr
    ? [
        { label: t('canvass.dvr.location'), value: dvr.dvrLocation ?? '' },
        { label: t('canvass.dvr.brand'), value: dvr.dvrTypeBrand ?? '' },
        { label: t('canvass.dvr.username'), value: dvr.dvrUsername ?? '' },
        { label: t('canvass.dvr.password'), value: dvr.dvrPassword ?? '' },
      ].filter(row => row.value !== '')
    : []
  const sparse = dvrRows.length === 0

  return (
    <div
      className={cn(
        'rounded border-b border-hub-row-divider',
        expanded && 'bg-hub-accent/5'
      )}
    >
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => {
          setExpanded(current => !current)
        }}
        className="flex w-full items-center gap-2.5 px-1 py-2 text-start transition-colors hover:bg-hub-accent/5"
      >
        <span
          aria-hidden
          className={cn(
            'size-[9px] shrink-0 rounded-full',
            STATUS_DOT[location.status]
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13.5px] text-hub-body">
            {location.name}
          </span>
          <span className="truncate text-[11.5px] text-hub-faint">
            {location.address}
          </span>
        </span>
        {location.arrivedAt !== null && (
          <span className="shrink-0 font-jbmono text-[10.5px] text-hub-faint">
            {formatClockTime(location.arrivedAt)}
          </span>
        )}
        <span
          aria-hidden
          className={cn(
            'flex size-5 shrink-0 items-center justify-center rounded border border-hub-hairline text-[9px] text-hub-muted transition-transform duration-200',
            expanded && 'rotate-180'
          )}
        >
          <ChevronDown className="size-3" />
        </span>
      </button>
      {expanded && (
        <div className="flex flex-col gap-3 px-2 pb-3.5 ps-7 pt-1">
          {location.coord === null && (
            <span className="inline-flex w-fit items-center gap-1 rounded-[3px] border border-hub-working/30 bg-hub-working/10 px-1.5 py-0.5 font-stmono text-[9px] uppercase tracking-[1px] text-hub-working">
              <MapPinOff className="size-3" aria-hidden />
              {t('canvass.card.noFix')}
            </span>
          )}
          {dvrRows.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="font-stmono text-[9.5px] uppercase tracking-[2px] text-hub-faint">
                {t('canvass.dvr.title')}
              </p>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                {dvrRows.map(row => (
                  <div
                    key={row.label}
                    className="flex min-w-0 items-baseline gap-2"
                  >
                    <dt className="w-[76px] shrink-0 font-stmono text-[9px] uppercase tracking-[1px] text-hub-ghost">
                      {row.label}
                    </dt>
                    <dd className="min-w-0 select-text truncate font-jbmono text-xs text-hub-body-2 [cursor:text]">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          )}
          {sparse && (
            <p className="font-stmono text-[10px] uppercase tracking-[1.5px] text-hub-ghost">
              {t('canvass.dashboard.rowSparse')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

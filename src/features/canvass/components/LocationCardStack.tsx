import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { useCanvassStore } from '../store/canvass-store'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { LocationCard } from './LocationCard'
import type { CanvassCase, CanvassLocation } from '../types'

/**
 * The case-grouped card stack (Phase 2.4B, floated over the map at
 * 3.4A): a case header card, then status-grouped location cards.
 * `floating` is the §4 overlay home (transparent column of glassy
 * cards — never an opaque full-height rail); the default is the M2
 * full-bleed `'case'` view. Empty states are designed states.
 *
 * D16 — single-select model: ONE `role="listbox"` owns every
 * `role="option"` card (status sections are `role="group"`); selection
 * is `aria-selected`, set-only, mirrored from the store.
 *
 * Attention-fresh cards sort to the top of their status group (#76):
 * freshness is stamp PRESENCE — the CanvassRoot sweep expires stamps on
 * the store, so presence ≡ within ATTENTION_TTL_MS (no per-second
 * re-render here).
 */

const STATUS_ORDER: CanvassLocation['status'][] = [
  'working',
  'started',
  'complete',
]

/** Fresh-attention first (newest stamp wins), original order otherwise
 * (Array.prototype.sort is stable). */
function attentionFirst(
  group: CanvassLocation[],
  attentionByLocation: Record<string, number>
): CanvassLocation[] {
  return [...group].sort((a, b) => {
    const stampA = attentionByLocation[a.id]
    const stampB = attentionByLocation[b.id]
    if (stampA === undefined && stampB === undefined) {
      return 0
    }
    if (stampA === undefined) {
      return 1
    }
    if (stampB === undefined) {
      return -1
    }
    return stampB - stampA
  })
}

export function LocationCardStack({
  floating = false,
}: {
  floating?: boolean
}) {
  const { t } = useTranslation()
  const caseId = useCanvassStore(state => state.selectedCaseId)
  const attentionByLocation = useCanvassStore(
    state => state.attentionByLocation
  )
  const { data: cases } = useCases()
  const { data: locations, isPending } = useCaseLocations(caseId)
  const selectedCase = cases?.find(c => c.id === caseId) ?? null

  if (caseId === null) {
    return (
      <EmptyState
        floating={floating}
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
        floating={floating}
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
    <div
      className={cn(
        'h-full overflow-y-auto',
        floating ? 'pe-1' : 'bg-hub-ground p-6'
      )}
    >
      <div
        className={cn('flex flex-col gap-5', !floating && 'mx-auto max-w-3xl')}
      >
        {selectedCase !== null && (
          <CaseHeaderCard canvassCase={selectedCase} locations={locations} />
        )}
        <div
          role="listbox"
          aria-label={t('canvass.stack.listLabel')}
          className="flex flex-col gap-8"
        >
          {STATUS_ORDER.map(status => {
            const group = locations.filter(
              location => location.status === status
            )
            if (group.length === 0) {
              return null
            }
            return (
              <StatusGroup
                key={status}
                label={`${t(`canvass.status.${status}`)} · ${String(group.length)}`}
                locations={attentionFirst(group, attentionByLocation)}
              />
            )
          })}
          {unmodeled.length > 0 && (
            <StatusGroup
              label={`${t('canvass.status.other')} · ${String(unmodeled.length)}`}
              locations={attentionFirst(unmodeled, attentionByLocation)}
            />
          )}
        </div>
      </div>
    </div>
  )
}

function StatusGroup({
  label,
  locations,
}: {
  label: string
  locations: CanvassLocation[]
}) {
  return (
    <section role="group" aria-label={label}>
      {/* The visual heading duplicates the group label — presentational
          to AT (a heading inside a listbox is invalid ARIA structure). */}
      <h2
        aria-hidden
        className="mb-3 font-stmono text-[11px] uppercase tracking-[2.5px] text-hub-muted"
      >
        {label}
      </h2>
      <div className="flex flex-col gap-2.5">
        {locations.map(location => (
          <LocationCard key={location.id} location={location} />
        ))}
      </div>
    </section>
  )
}

/** The §4 header card: case number/name, the status count trio, and the
 * no-fix chip (counts derived from the already-loaded locations — no
 * extra query). */
function CaseHeaderCard({
  canvassCase,
  locations,
}: {
  canvassCase: CanvassCase
  locations: CanvassLocation[]
}) {
  const { t } = useTranslation()
  const counts = { started: 0, working: 0, complete: 0 }
  let noFix = 0
  for (const location of locations) {
    if (location.status in counts) {
      counts[location.status] += 1
    }
    if (location.coord === null) {
      noFix += 1
    }
  }
  return (
    <header className="rounded-lg border border-hub-hairline bg-hub-overlay p-4 backdrop-blur-md">
      <p className="font-jbmono text-[12.5px] text-hub-working">
        {canvassCase.caseNumber}
      </p>
      <p className="mt-0.5 font-nacelle text-[17px] font-semibold leading-tight text-hub-heading [text-wrap:pretty]">
        {canvassCase.displayName ?? canvassCase.caseNumber}
      </p>
      <div className="mt-3 flex items-end gap-5">
        {STATUS_ORDER.map(status => (
          <span key={status} className="flex flex-col gap-0.5">
            <span
              className={cn(
                'font-jbmono text-xl leading-none',
                status === 'started' && 'text-hub-started',
                status === 'working' && 'text-hub-working',
                status === 'complete' && 'text-hub-complete'
              )}
            >
              {counts[status]}
            </span>
            <span className="font-stmono text-[9px] uppercase tracking-[1.5px] text-hub-faint">
              {t(`canvass.status.${status}`)}
            </span>
          </span>
        ))}
        <span className="flex-1" />
        {noFix > 0 && (
          <span className="rounded-[3px] border border-hub-working/30 bg-hub-working/10 px-1.5 py-0.5 font-stmono text-[9px] uppercase tracking-[1px] text-hub-working">
            {t('canvass.stack.noFixCount', { count: noFix })}
          </span>
        )}
      </div>
    </header>
  )
}

function EmptyState({
  title,
  description,
  floating,
}: {
  title: string
  description: string
  floating: boolean
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 p-8 text-center',
        floating
          ? 'rounded-lg border border-hub-hairline bg-hub-overlay backdrop-blur-md'
          : 'h-full bg-hub-ground'
      )}
    >
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

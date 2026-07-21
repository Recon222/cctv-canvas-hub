import { useTranslation } from 'react-i18next'
import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvassStore } from '../store/canvass-store'
import { formatClockTime } from '../services/format'
import type { CanvassLocation } from '../types'

/**
 * One location on the board (Phase 2.4B). Wall-legible, dark, CSS
 * logical properties. Content NEVER varies with session state — DVR
 * credentials are ordinary strings rendered plainly always (owner
 * directive; AD6: lock alters nothing).
 *
 * Case File restyle (design_handoff §4): overlay-grade panel, Nacelle
 * name, status chip in the trio colors, mono investigator/arrival line,
 * DVR block as a two-column mono grid with selectable values. The M4
 * media strip mounts under the meta row (agents wire `MediaThumb`s).
 */

const STATUS_CHIP_STYLES: Record<CanvassLocation['status'], string> = {
  started: 'border-hub-started/45 bg-hub-started/10 text-hub-started',
  working: 'border-hub-working/40 bg-hub-working/10 text-hub-working',
  complete: 'border-hub-complete/40 bg-hub-complete/10 text-hub-complete',
}

interface LocationCardProps {
  location: CanvassLocation
}

export function LocationCard({ location }: LocationCardProps) {
  const { t } = useTranslation()
  const selected = useCanvassStore(
    state => state.selectedLocationId === location.id
  )
  const attentionAt = useCanvassStore(
    state => state.attentionByLocation[location.id]
  )
  const dvr = location.dvr
  const dvrRows: { label: string; value: string }[] = dvr
    ? [
        { label: t('canvass.dvr.location'), value: dvr.dvrLocation ?? '' },
        { label: t('canvass.dvr.brand'), value: dvr.dvrTypeBrand ?? '' },
        { label: t('canvass.dvr.username'), value: dvr.dvrUsername ?? '' },
        { label: t('canvass.dvr.password'), value: dvr.dvrPassword ?? '' },
      ].filter(row => row.value !== '')
    : []

  // Selecting a location is the case view's primary interaction (and the
  // M3 fly-to trigger) — it must work from the keyboard and read as a
  // control to assistive tech. D16 (resolved 3.4A): the accurate model
  // is SINGLE-SELECT — the card is a `role="option"` with
  // `aria-selected`, owned by the stack's `role="listbox"` (one DOM
  // subtree owns the whole model). No aria-pressed: selection is
  // set-only, and a pressed state the card cannot un-press is a broken
  // promise to AT (review LOW).
  const select = () => {
    useCanvassStore.getState().selectLocation(location.id)
  }
  return (
    <article
      data-location-id={location.id}
      data-status={location.status}
      data-attention={attentionAt !== undefined || undefined}
      role="option"
      aria-selected={selected}
      tabIndex={0}
      onClick={select}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
        }
      }}
      className={cn(
        'hub-attention-flash cursor-pointer rounded-md border border-hub-hairline bg-hub-overlay p-4 text-start backdrop-blur-md transition-colors duration-200',
        'hover:border-hub-hairline-bright focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-accent',
        selected && 'border-hub-accent/75'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-nacelle text-[16.5px] font-semibold leading-tight text-hub-heading">
            {location.name}
          </h3>
          <p className="mt-0.5 text-[12.5px] text-hub-muted">
            {location.address}
          </p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-[3px] border px-2 pb-[3px] pt-1 font-stmono text-[10px] uppercase tracking-[1.5px]',
            STATUS_CHIP_STYLES[location.status]
          )}
        >
          {/* defaultValue: an unmodeled wire status renders itself, not
              a raw i18n key (drift posture — see LocationCardStack). */}
          {t(`canvass.status.${location.status}`, {
            defaultValue: location.status,
          })}
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
        <span className="font-stmono text-[10.5px] uppercase tracking-[1px] text-hub-accent">
          {location.investigator}
        </span>
        {location.arrivedAt !== null && (
          <span className="font-jbmono text-[10.5px] text-hub-faint">
            {t('canvass.card.arrived', {
              time: formatClockTime(location.arrivedAt),
            })}
          </span>
        )}
        <span className="flex-1" />
        {location.coord === null && (
          <span className="inline-flex items-center gap-1 rounded-[3px] border border-hub-working/30 bg-hub-working/10 px-1.5 py-0.5 font-stmono text-[9px] uppercase tracking-[1px] text-hub-working">
            <MapPinOff className="size-3" aria-hidden />
            {t('canvass.card.noFix')}
          </span>
        )}
      </div>
      {dvrRows.length > 0 && (
        <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-hub-row-divider pt-3">
          <dt className="col-span-2 mb-0.5 font-stmono text-[9.5px] uppercase tracking-[2px] text-hub-faint">
            {t('canvass.dvr.title')}
          </dt>
          {dvrRows.map(row => (
            <div key={row.label} className="contents">
              <dt className="font-stmono text-[9px] uppercase tracking-[1px] text-hub-ghost">
                {row.label}
              </dt>
              {/* Credentials are ordinary strings, selectable for
                  transcription — never masked (owner directive). */}
              <dd className="select-text font-jbmono text-xs text-hub-body-2 [cursor:text]">
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}

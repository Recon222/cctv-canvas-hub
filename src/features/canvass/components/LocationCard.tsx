import { useTranslation } from 'react-i18next'
import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvassStore } from '../store/canvass-store'
import type { CanvassLocation } from '../types'

/**
 * One location on the board (Phase 2.4B). Wall-legible, dark, CSS
 * logical properties. Content NEVER varies with session state — DVR
 * credentials are ordinary strings rendered plainly always (owner
 * directive; AD6: lock alters nothing).
 */

const STATUS_STYLES: Record<CanvassLocation['status'], string> = {
  started: 'bg-sky-500/15 text-sky-300',
  working: 'bg-amber-500/15 text-amber-300',
  complete: 'bg-emerald-500/15 text-emerald-300',
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

interface LocationCardProps {
  location: CanvassLocation
}

export function LocationCard({ location }: LocationCardProps) {
  const { t } = useTranslation()
  const selected = useCanvassStore(
    state => state.selectedLocationId === location.id
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
  // control to assistive tech. A native <button> can't wrap this block
  // content, so the article carries the button contract itself.
  const select = () => {
    useCanvassStore.getState().selectLocation(location.id)
  }
  return (
    <article
      data-status={location.status}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      onClick={select}
      onKeyDown={event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          select()
        }
      }}
      className={cn(
        'cursor-pointer rounded-xl border border-zinc-800 bg-zinc-900 p-5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400',
        selected && 'ring-2 ring-sky-400'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-xl font-semibold tracking-tight text-zinc-100">
          {location.name}
        </h3>
        <span
          className={cn(
            'rounded-full px-3 py-1 text-sm font-medium',
            STATUS_STYLES[location.status]
          )}
        >
          {t(`canvass.status.${location.status}`)}
        </span>
      </div>
      <p className="mt-1 text-base text-zinc-400">{location.address}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-base">
        <span className="text-zinc-200">{location.investigator}</span>
        {location.arrivedAt !== null && (
          <span className="text-zinc-400">
            {t('canvass.card.arrived', {
              time: formatTime(location.arrivedAt),
            })}
          </span>
        )}
        {location.coord === null && (
          <span className="inline-flex items-center gap-1 rounded-full bg-zinc-800 px-2.5 py-0.5 text-sm text-zinc-300">
            <MapPinOff className="size-3.5" aria-hidden />
            {t('canvass.card.noFix')}
          </span>
        )}
      </div>
      {dvrRows.length > 0 && (
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-lg bg-zinc-950/60 p-3 text-sm">
          <dt className="col-span-2 mb-1 font-medium uppercase tracking-wide text-zinc-500">
            {t('canvass.dvr.title')}
          </dt>
          {dvrRows.map(row => (
            <div key={row.label} className="contents">
              <dt className="text-zinc-500">{row.label}</dt>
              <dd className="text-zinc-200">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </article>
  )
}

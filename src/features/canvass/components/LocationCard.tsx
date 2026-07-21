import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { MapPinOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useCanvassStore } from '../store/canvass-store'
import { formatClockTime, formatBoardTimestamp } from '../services/format'
import {
  isInlineRenderable,
  openMediaExternally,
} from '../services/mediaService'
import { useCaseMedia } from '../hooks/useCaseMedia'
import { useSelfHealingSignedUrl, useSignedUrl } from '../hooks/useSignedUrl'
import { SignedMediaThumb, MediaCountBadge, MediaSummary } from './MediaThumb'
import { ImageViewer } from './ImageViewer'
import { VideoPlayer } from './VideoPlayer'
import type { CanvassLocation, CanvassMedia } from '../types'

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
      <MediaStrip location={location} />
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

/** Inline tiles per card row — beyond this, the "+N" badge closes the
 * strip (46px tiles inside a ~370px card). */
const MAX_STRIP_TILES = 4

type OpenMedia =
  | { kind: 'viewer'; index: number }
  | { kind: 'player'; media: CanvassMedia }

/**
 * The card's media strip (Phase 4.3B, spec §5 media-forward): image
 * thumbs inline (videos as play tiles), the "+N" overflow badge, and
 * the photo/video/audio count summary (#88). Thumb ⇒ ImageViewer at
 * that photo; video tile ⇒ on-demand VideoPlayer. Media comes from the
 * case-level query (one per case, AD3) filtered to this location.
 */
function MediaStrip({ location }: { location: CanvassLocation }) {
  const { data: media } = useCaseMedia(location.caseId)
  const [open, setOpen] = useState<OpenMedia | null>(null)

  const rows = (media ?? []).filter(row => row.locationId === location.id)
  if (rows.length === 0) {
    return null
  }
  const images = rows.filter(row => row.type === 'image')
  const videos = rows.filter(row => row.type === 'video')
  const audio = rows.filter(row => row.type === 'audio')
  // PR #7 M1 drift posture: unknown kinds stay VISIBLE (fallback tiles,
  // sign-on-demand open) — the mapper bucketed them; the strip must not
  // re-drop them from its fixed grouping.
  const unknownKinds = rows.filter(row => row.type === 'unknown')
  /** The viewer pages the location's inline-renderable photos only — a
   * HEIC thumb opens externally, never a broken viewer image. */
  const viewerPhotos = images.filter(row => isInlineRenderable(row.mime))
  // Videos FIRST (live-smoke F1): a location that has video always
  // exposes a playable affordance — images-first let 4 photos push the
  // .mp4 into the non-clickable +N badge on the realistic seeded shape
  // (spec §5: video on demand). Photos keep every remaining slot.
  const tiles = [...videos, ...images, ...unknownKinds]
  const visible = tiles.slice(0, MAX_STRIP_TILES)
  const overflow = tiles.length - visible.length
  const contextLabel = `${location.name} · ${location.address}`

  const openMedia = (row: CanvassMedia) => {
    if (row.type === 'video') {
      setOpen({ kind: 'player', media: row })
      return
    }
    const index = viewerPhotos.findIndex(photo => photo.id === row.id)
    if (index !== -1) {
      setOpen({ kind: 'viewer', index })
    }
  }

  // Poll refetches can shrink the photo set under an open viewer — an
  // out-of-range index simply closes it.
  const viewerPhoto =
    open?.kind === 'viewer' ? viewerPhotos[open.index] : undefined

  return (
    <div
      className="mt-3 flex flex-wrap items-center gap-1.5"
      // The strip lives inside the selectable card (role="option"):
      // media interactions must not double as selection/fly-to, and a
      // focused thumb's Enter must activate the thumb, not the card.
      onClick={event => {
        event.stopPropagation()
      }}
      onKeyDown={event => {
        event.stopPropagation()
      }}
    >
      {visible.map(row => (
        <SignedMediaThumb
          key={row.id}
          media={row}
          onOpen={() => {
            openMedia(row)
          }}
        />
      ))}
      {overflow > 0 && <MediaCountBadge count={overflow} />}
      <MediaSummary
        photos={images.length}
        videos={videos.length}
        audio={audio.length}
      />
      {open?.kind === 'viewer' &&
        viewerPhoto !== undefined &&
        createPortal(
          <ModalPropagationWall>
            <PhotoViewerHost
              // Keyed per photo: the self-heal ladder is per-instance
              // state — paging must reset it, not inherit a spent
              // auto-retry from the previous photo (PR #7 L2).
              key={viewerPhoto.id}
              photos={viewerPhotos}
              index={open.index}
              media={viewerPhoto}
              contextLabel={contextLabel}
              investigator={location.investigator}
              onClose={() => {
                setOpen(null)
              }}
              onNavigate={index => {
                setOpen({ kind: 'viewer', index })
              }}
            />
          </ModalPropagationWall>,
          document.body
        )}
      {open?.kind === 'player' &&
        createPortal(
          <ModalPropagationWall>
            <PlayerHost
              media={open.media}
              contextLabel={contextLabel}
              onClose={() => {
                setOpen(null)
              }}
            />
          </ModalPropagationWall>,
          document.body
        )}
    </div>
  )
}

/** React portals propagate events through the REACT tree, not the DOM —
 * without this wall every click inside a modal would bubble into the
 * card's onClick (re-select + fly-to on the map view). */
function ModalPropagationWall({ children }: { children: React.ReactNode }) {
  return (
    <div
      onClick={event => {
        event.stopPropagation()
      }}
      onKeyDown={event => {
        event.stopPropagation()
      }}
    >
      {children}
    </div>
  )
}

/** Signs the CURRENT photo and pre-formats the viewer's labels (the
 * poured viewer is dumb — hosts own AD8 fallbacks + rule-6 timestamps). */
function PhotoViewerHost({
  photos,
  index,
  media,
  contextLabel,
  investigator,
  onClose,
  onNavigate,
}: {
  photos: CanvassMedia[]
  index: number
  media: CanvassMedia
  contextLabel: string
  investigator: string
  onClose: () => void
  onNavigate: (index: number) => void
}) {
  const { t } = useTranslation()
  // PR #7 H1 + L2: the shared self-heal ladder — a failed sign query or
  // a broken <img> is an honest failed state with retry, never an
  // eternal "Loading photo…" or a raw broken-image glyph.
  const heal = useSelfHealingSignedUrl(media.bucket, media.path)
  return (
    <ImageViewer
      media={photos}
      index={index}
      signedUrl={heal.signedUrl}
      signFailed={heal.errored}
      onImageError={heal.onMediaError}
      onRetry={heal.onRetry}
      contextLabel={contextLabel}
      metaLabel={t('canvass.viewer.meta', {
        // Rule 6: absolute with seconds, explicit yyyy-mm-dd date.
        time: formatBoardTimestamp(media.createdAt),
        investigator,
      })}
      onClose={onClose}
      onNavigate={onNavigate}
    />
  )
}

/** Signs the video on open (the player itself preloads nothing). */
function PlayerHost({
  media,
  contextLabel,
  onClose,
}: {
  media: CanvassMedia
  contextLabel: string
  onClose: () => void
}) {
  const { t } = useTranslation()
  // PR #7 H1: without isError a failed sign query stranded the player
  // on "Preparing video…" with open-externally structurally unreachable
  // (it was gated on <video onError>, and the <video> never mounts).
  const { data: signedUrl, isError } = useSignedUrl(media.bucket, media.path)
  return (
    <VideoPlayer
      media={media}
      signedUrl={signedUrl ?? null}
      signFailed={isError}
      contextLabel={contextLabel}
      onClose={onClose}
      onOpenExternally={() => {
        void openMediaExternally(media.bucket, media.path).catch(() => {
          toast.error(t('canvass.media.openFailed'))
        })
      }}
    />
  )
}

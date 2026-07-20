import { useTranslation } from 'react-i18next'
import { Image as ImageIcon, Play, FileQuestion, RotateCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { CanvassMedia } from '../types'

/**
 * Media thumbnail tile (Phase 4.1C, design_handoff §4/§5): a 46px tile
 * that opens the viewer/player, plus the count badge and the
 * unrenderable-media fallback. Purely presentational — the host passes
 * the signed URL (useSignedUrl is M4 wiring) and the open callback.
 */

export interface MediaThumbProps {
  media: CanvassMedia
  /** Signed URL when resolved; null while loading/failed. */
  signedUrl: string | null
  /** Renderable inline? (host derives via mediaService.isInlineRenderable) */
  renderable: boolean
  /** Video duration label (e.g. "0:45") when known. */
  durationLabel?: string
  onOpen?: () => void
  /** Retry a failed signed-URL fetch (fallback tile action). */
  onRetry?: () => void
  /** Signed-URL fetch failed (shows the fallback + retry). */
  errored?: boolean
}

export function MediaThumb({
  media,
  signedUrl,
  renderable,
  durationLabel,
  onOpen,
  onRetry,
  errored = false,
}: MediaThumbProps) {
  const { t } = useTranslation()

  // Unrenderable (HEIC etc.) or failed: designed fallback, never a
  // broken <img> (plan 4.1 error handling).
  if (!renderable || errored) {
    return (
      <button
        type="button"
        onClick={errored ? onRetry : onOpen}
        title={
          errored
            ? t('canvass.media.retry')
            : t('canvass.media.openExternally', { filename: media.filename })
        }
        className="flex size-[46px] shrink-0 flex-col items-center justify-center gap-0.5 rounded border border-hub-hairline bg-hub-panel text-hub-ghost transition-colors hover:border-hub-hairline-bright hover:text-hub-accent"
      >
        {errored ? (
          <RotateCw className="size-4" aria-hidden />
        ) : (
          <FileQuestion className="size-4" aria-hidden />
        )}
        <span className="font-jbmono text-[7px] uppercase">
          {mediaExtension(media.filename)}
        </span>
      </button>
    )
  }

  const isVideo = media.type === 'video'
  return (
    <button
      type="button"
      onClick={onOpen}
      title={
        isVideo
          ? t('canvass.media.playVideo')
          : t('canvass.media.viewPhoto', { filename: media.filename })
      }
      className="relative flex size-[46px] shrink-0 items-center justify-center overflow-hidden rounded border border-hub-hairline bg-gradient-to-br from-[#0b1626] to-[#13233b] text-hub-faint transition-colors hover:border-hub-hairline-bright hover:text-hub-accent"
    >
      {signedUrl !== null && !isVideo ? (
        <img
          src={signedUrl}
          alt={media.filename}
          className="size-full object-cover"
          loading="lazy"
        />
      ) : isVideo ? (
        <span className="flex flex-col items-center gap-0.5">
          <Play
            className="size-3.5 fill-hub-accent text-hub-accent"
            aria-hidden
          />
          {durationLabel !== undefined && (
            <span className="font-jbmono text-[8px] text-hub-muted">
              {durationLabel}
            </span>
          )}
        </span>
      ) : (
        <ImageIcon className="size-4" aria-hidden />
      )}
    </button>
  )
}

/** "+N" overflow badge closing a thumb row. */
export function MediaCountBadge({ count }: { count: number }) {
  const { t } = useTranslation()
  return (
    <span
      title={t('canvass.media.moreCount', { count })}
      className="flex size-[46px] shrink-0 items-center justify-center rounded border border-hub-hairline bg-hub-chip font-jbmono text-xs text-hub-muted"
    >
      +{count}
    </span>
  )
}

/** Compact photo/video summary line (e.g. under a thumb row). */
export function MediaSummary({
  photos,
  videos,
}: {
  photos: number
  videos: number
}) {
  const { t } = useTranslation()
  const parts: string[] = []
  if (photos > 0) {
    parts.push(t('canvass.media.photoCount', { count: photos }))
  }
  if (videos > 0) {
    parts.push(t('canvass.media.videoCount', { count: videos }))
  }
  if (parts.length === 0) {
    return null
  }
  return (
    <span
      className={cn(
        'ms-1 font-stmono text-[9.5px] uppercase tracking-[1px] text-hub-faint'
      )}
    >
      {parts.join(' · ')}
    </span>
  )
}

function mediaExtension(filename: string): string {
  const dot = filename.lastIndexOf('.')
  return dot === -1 ? '?' : filename.slice(dot + 1).toUpperCase()
}

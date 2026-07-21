import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, TriangleAlert } from 'lucide-react'
import type { CanvassMedia } from '../types'

/**
 * Modal on-demand video player (Phase 4.3A, design_handoff §5):
 * `preload="none"`, NEVER autoplay (bandwidth honesty — pinned). Native
 * transport controls (investigators know them); Case File chrome around
 * them. `onError` swaps to the designed fallback panel — never a black
 * player.
 */
export interface VideoPlayerProps {
  media: CanvassMedia
  /** Signed URL; null while resolving. */
  signedUrl: string | null
  /** The host's sign query FAILED (PR #7 H1) — null signedUrl alone
   * means "still resolving"; this flag is what separates the honest
   * failed panel from the loading panel. */
  signFailed?: boolean
  /** Eyebrow, e.g. "QUICKMART · 09:10:00–09:55:00 · 24.1 MB". */
  contextLabel: string
  onClose: () => void
  /** Fallback-panel action (open externally via opener plugin — host wires). */
  onOpenExternally?: () => void
}

export function VideoPlayer({
  media,
  signedUrl,
  signFailed = false,
  contextLabel,
  onClose,
  onOpenExternally,
}: VideoPlayerProps) {
  const { t } = useTranslation()
  const [failed, setFailed] = useState(false)
  // Own the keyboard the moment the modal opens (M4 wiring): the Esc
  // handler lives on this div — without focus it never fires on a
  // mouse-driven wall board.
  const dialogRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])
  // F2 (live-smoke): focus inside the native <video> transport (shadow
  // DOM) keeps keydowns from ever reaching this dialog — Esc listens at
  // the document for the modal's lifetime instead. Capture phase on
  // purpose: it fires before any bubbling handler can stop propagation
  // (the host's portal wall guards the React tree; this bypasses it by
  // design).
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', closeOnEscape, true)
    return () => {
      document.removeEventListener('keydown', closeOnEscape, true)
    }
  }, [onClose])

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={media.filename}
      className="absolute inset-0 z-40 flex items-center justify-center bg-hub-ground/70 backdrop-blur"
      onClick={onClose}
      tabIndex={-1}
    >
      <div
        className="flex w-[760px] max-w-[92vw] flex-col overflow-hidden rounded-lg border border-hub-hairline bg-hub-chrome"
        onClick={event => {
          event.stopPropagation()
        }}
      >
        <div className="flex items-center gap-3 border-b border-hub-hairline px-4 py-3">
          <span className="font-jbmono text-[13px] text-hub-heading">
            {media.filename}
          </span>
          <span className="truncate font-stmono text-[10px] uppercase tracking-[1.5px] text-hub-faint">
            {contextLabel}
          </span>
          <span className="flex-1" />
          <button
            type="button"
            aria-label={t('canvass.player.close')}
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded border border-hub-hairline text-hub-muted transition-colors hover:text-hub-heading"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="flex min-h-[420px] items-center justify-center bg-gradient-to-br from-[#060d18] to-[#0b1626]">
          {failed || signFailed || signedUrl === null ? (
            <div className="flex flex-col items-center gap-3 p-10 text-center">
              <TriangleAlert
                className="size-9 text-hub-working"
                strokeWidth={1.5}
                aria-hidden
              />
              <p className="font-stmono text-[11px] uppercase tracking-[2px] text-hub-muted">
                {/* PR #7 H1: "loading" copy is reserved for genuinely
                    pending — a failed sign query says so honestly. */}
                {failed
                  ? t('canvass.player.unplayable')
                  : signFailed
                    ? t('canvass.player.signFailed')
                    : t('canvass.player.loading')}
              </p>
              {failed && (
                <p className="max-w-sm text-[13.5px] text-hub-faint [text-wrap:pretty]">
                  {t('canvass.player.unplayableDetail', {
                    mime: media.mime,
                  })}
                </p>
              )}
              {(failed || signFailed) && onOpenExternally !== undefined && (
                // Open-externally signs its own fresh URL on click —
                // also the recovery path when the sign query failed.
                <button
                  type="button"
                  onClick={onOpenExternally}
                  className="mt-1 rounded border border-hub-accent/40 bg-hub-accent/10 px-4 py-2 font-stmono text-[11px] uppercase tracking-[2px] text-hub-heading transition-colors hover:bg-hub-accent/20"
                >
                  {t('canvass.player.openExternally')}
                </button>
              )}
            </div>
          ) : (
            // Never autoplay; preload nothing until the operator presses
            // play (pinned behavior). CCTV evidence footage has no
            // caption track.
            <video
              controls
              preload="none"
              src={signedUrl}
              className="max-h-[62vh] w-full bg-black"
              onError={() => {
                setFailed(true)
              }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

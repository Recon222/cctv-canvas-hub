import { useTranslation } from 'react-i18next'
import { X, ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import type { CanvassMedia } from '../types'

/**
 * Modal photo viewer (design_handoff §5): filename + location eyebrow,
 * wrap-through ‹ › navigation, `PHOTO n OF N` counter, metadata footer.
 * Presentational — the host owns which media list/index is open and the
 * signed URL. Scrim click and ✕ both close.
 */
export interface ImageViewerProps {
  /** The photo set being paged (one location's photos). */
  media: CanvassMedia[]
  index: number
  /** Signed URL for media[index]; null while resolving. */
  signedUrl: string | null
  /** Eyebrow line, e.g. "QUICKMART CONVENIENCE · 481 YONGE ST". */
  contextLabel: string
  /** Metadata footer, e.g. "TAKEN 10:12:47 · DET. A. MORGAN · 2.1 MB". */
  metaLabel: string
  onClose: () => void
  onNavigate: (index: number) => void
}

export function ImageViewer({
  media,
  index,
  signedUrl,
  contextLabel,
  metaLabel,
  onClose,
  onNavigate,
}: ImageViewerProps) {
  const { t } = useTranslation()
  const current = media[index]
  if (current === undefined) {
    return null
  }
  const count = media.length
  const wrap = (next: number) => (next + count) % count

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={current.filename}
      className="absolute inset-0 z-40 flex items-center justify-center bg-hub-ground/70 backdrop-blur"
      onClick={onClose}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          onClose()
        } else if (event.key === 'ArrowLeft') {
          onNavigate(wrap(index - 1))
        } else if (event.key === 'ArrowRight') {
          onNavigate(wrap(index + 1))
        }
      }}
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
            {current.filename}
          </span>
          <span className="truncate font-stmono text-[10px] uppercase tracking-[1.5px] text-hub-faint">
            {contextLabel}
          </span>
          <span className="flex-1" />
          <span className="font-jbmono text-[11px] text-hub-muted">
            {t('canvass.viewer.counter', { n: index + 1, total: count })}
          </span>
          <button
            type="button"
            aria-label={t('canvass.viewer.close')}
            onClick={onClose}
            className="flex size-7 items-center justify-center rounded border border-hub-hairline text-hub-muted transition-colors hover:text-hub-heading"
          >
            <X className="size-3.5" aria-hidden />
          </button>
        </div>
        <div className="relative flex h-[460px] items-center justify-center bg-gradient-to-br from-[#060d18] to-[#0b1626]">
          {signedUrl !== null ? (
            <img
              src={signedUrl}
              alt={current.filename}
              className="max-h-full max-w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-hub-ghost">
              <ImageIcon className="size-16" strokeWidth={1.2} aria-hidden />
              <span className="font-stmono text-[10px] uppercase tracking-[2.5px]">
                {t('canvass.viewer.loading')}
              </span>
            </div>
          )}
          {count > 1 && (
            <>
              <button
                type="button"
                aria-label={t('canvass.viewer.previous')}
                onClick={() => {
                  onNavigate(wrap(index - 1))
                }}
                className="absolute start-3.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-hub-hairline bg-hub-overlay text-hub-body-2 transition-colors hover:border-hub-hairline-bright hover:text-hub-heading"
              >
                <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t('canvass.viewer.next')}
                onClick={() => {
                  onNavigate(wrap(index + 1))
                }}
                className="absolute end-3.5 top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-hub-hairline bg-hub-overlay text-hub-body-2 transition-colors hover:border-hub-hairline-bright hover:text-hub-heading"
              >
                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
              </button>
            </>
          )}
        </div>
        <div className="flex items-center px-4 py-3">
          <span className="font-jbmono text-[11px] text-hub-faint">
            {metaLabel}
          </span>
        </div>
      </div>
    </div>
  )
}

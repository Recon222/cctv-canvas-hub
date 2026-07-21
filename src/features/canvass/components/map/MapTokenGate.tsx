import { useTranslation } from 'react-i18next'

/**
 * Token-missing designed state (Phase 3.2B inner, design_handoff §4):
 * grid-paper ground + a calm explainer — the board still works via the
 * card stack; this is a configuration state, not an error.
 * `variant="rejected"` is the map-error toast posture (bad token);
 * `variant="styleError"` reuses the same banner posture for a terminal
 * style-load failure (PR #6 H1 — mapbox fetches the style document
 * once, no retry).
 */
export function MapTokenGate({
  variant = 'missing',
}: {
  variant?: 'missing' | 'rejected' | 'styleError'
}) {
  const { t } = useTranslation()
  if (variant === 'rejected' || variant === 'styleError') {
    return (
      <div className="absolute start-1/2 top-5 flex -translate-x-1/2 items-center gap-3 rounded-md border border-hub-danger/55 bg-hub-danger-panel px-5 py-3 rtl:translate-x-1/2">
        <p className="font-stmono text-xs uppercase tracking-[2px] text-hub-danger-text">
          {t(
            variant === 'rejected'
              ? 'canvass.map.tokenRejected'
              : 'canvass.map.styleError'
          )}
        </p>
      </div>
    )
  }
  return (
    <div className="hub-grid-paper absolute inset-0 flex items-center justify-center">
      <div className="flex w-[520px] max-w-[90%] flex-col gap-3.5 rounded-lg border border-hub-hairline bg-hub-panel p-9 backdrop-blur-md">
        <p className="font-stmono text-[11px] uppercase tracking-[3px] text-hub-working">
          {t('canvass.map.tokenMissing.eyebrow')}
        </p>
        <p className="font-nacelle text-2xl font-semibold text-hub-heading">
          {t('canvass.map.tokenMissing.title')}
        </p>
        <p className="text-[15px] leading-relaxed text-hub-muted [text-wrap:pretty]">
          {t('canvass.map.tokenMissing.description')}
        </p>
        <p className="rounded border border-hub-hairline bg-hub-input px-3.5 py-2.5 font-jbmono text-xs text-hub-faint">
          {t('canvass.map.tokenMissing.path')}
        </p>
      </div>
    </div>
  )
}

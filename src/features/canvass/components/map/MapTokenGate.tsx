import { useTranslation } from 'react-i18next'

/**
 * Token-missing designed state (Phase 3.2B inner, design_handoff §4):
 * grid-paper ground + a calm explainer — the board still works via the
 * card stack; this is a configuration state, not an error.
 * `variant="rejected"` is the map-error toast posture (bad token);
 * `variant="styleError"` reuses the same banner posture for a terminal
 * style-load failure (PR #6 H1 — mapbox fetches the style document
 * once, no retry); `variant="preferencesError"` is the same panel
 * posture as `missing` but tells the truth when the settings FILE
 * couldn't be read (PR #6 M2 — the token may be fine).
 */
export function MapTokenGate({
  variant = 'missing',
}: {
  variant?: 'missing' | 'rejected' | 'styleError' | 'preferencesError'
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
  const keys =
    variant === 'preferencesError'
      ? {
          eyebrow: 'canvass.map.preferencesError.eyebrow',
          title: 'canvass.map.preferencesError.title',
          description: 'canvass.map.preferencesError.description',
        }
      : {
          eyebrow: 'canvass.map.tokenMissing.eyebrow',
          title: 'canvass.map.tokenMissing.title',
          description: 'canvass.map.tokenMissing.description',
        }
  return (
    <div className="hub-grid-paper absolute inset-0 flex items-center justify-center">
      <div className="flex w-[520px] max-w-[90%] flex-col gap-3.5 rounded-lg border border-hub-hairline bg-hub-panel p-9 backdrop-blur-md">
        <p className="font-stmono text-[11px] uppercase tracking-[3px] text-hub-working">
          {t(keys.eyebrow)}
        </p>
        <p className="font-nacelle text-2xl font-semibold text-hub-heading">
          {t(keys.title)}
        </p>
        <p className="text-[15px] leading-relaxed text-hub-muted [text-wrap:pretty]">
          {t(keys.description)}
        </p>
        {variant === 'missing' && (
          <p className="rounded border border-hub-hairline bg-hub-input px-3.5 py-2.5 font-jbmono text-xs text-hub-faint">
            {t('canvass.map.tokenMissing.path')}
          </p>
        )}
      </div>
    </div>
  )
}

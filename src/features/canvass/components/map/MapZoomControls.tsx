import { useTranslation } from 'react-i18next'
import { Plus, Minus, Maximize } from 'lucide-react'

/**
 * Map zoom instruments (design_handoff §4): +, −, fit-all — 40px
 * blurred tiles, bottom-start. Presentational; the host wires the map
 * methods (zoomIn/zoomOut/fitBounds with the card-stack padding).
 */
export interface MapZoomControlsProps {
  onZoomIn: () => void
  onZoomOut: () => void
  onFitAll: () => void
}

export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onFitAll,
}: MapZoomControlsProps) {
  const { t } = useTranslation()
  const tile =
    'flex size-10 items-center justify-center rounded border border-hub-hairline bg-hub-overlay text-hub-body-2 backdrop-blur transition-colors hover:border-hub-hairline-bright hover:text-hub-heading'
  return (
    <div className="absolute bottom-8 start-4 flex flex-col gap-2">
      <button
        type="button"
        aria-label={t('canvass.map.zoomIn')}
        title={t('canvass.map.zoomIn')}
        onClick={onZoomIn}
        className={tile}
      >
        <Plus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t('canvass.map.zoomOut')}
        title={t('canvass.map.zoomOut')}
        onClick={onZoomOut}
        className={tile}
      >
        <Minus className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t('canvass.map.fitAll')}
        title={t('canvass.map.fitAll')}
        onClick={onFitAll}
        className={tile}
      >
        <Maximize className="size-4" aria-hidden />
      </button>
    </div>
  )
}

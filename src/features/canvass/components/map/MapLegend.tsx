import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * Map status legend (design_handoff §4): the trio swatches + incident,
 * floating top-start over the map on a blurred panel. Pure presentation.
 */
export function MapLegend() {
  const { t } = useTranslation()
  return (
    <div className="absolute start-4 top-4 flex items-center gap-3.5 rounded border border-hub-hairline bg-hub-overlay px-3.5 py-2 backdrop-blur-md">
      <LegendItem
        swatch={
          <span
            aria-hidden
            className="size-[11px] rounded-full border-[2.5px] border-hub-started"
          />
        }
        label={t('canvass.status.started')}
      />
      <LegendItem
        swatch={
          <span
            aria-hidden
            className="size-[11px] rounded-full bg-hub-working"
          />
        }
        label={t('canvass.status.working')}
      />
      <LegendItem
        swatch={
          <span
            aria-hidden
            className="size-[11px] rounded-full bg-hub-complete"
          />
        }
        label={t('canvass.status.complete')}
      />
      <LegendItem
        swatch={
          <span
            aria-hidden
            className="size-[11px] rounded-full border-2 border-hub-danger bg-hub-danger/25"
          />
        }
        label={t('canvass.map.legend.incident')}
      />
    </div>
  )
}

function LegendItem({ swatch, label }: { swatch: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      {swatch}
      <span className="font-stmono text-[10.5px] uppercase tracking-[1.5px] text-hub-muted">
        {label}
      </span>
    </span>
  )
}

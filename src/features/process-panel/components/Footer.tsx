/**
 * SYSTEM lane — Footer (4-cell stat strip; ported `processTerminal`
 * retained surface, plan 6.3A, with the pinned cut applied: the
 * `PipelineResult` token-count block is CUT, dropping
 * `formatTokenCount` with it — the agency-cloud lane has no
 * turns/tokens/cost; the cells carry hub diagnostics instead).
 *
 * Pure presentational — accepts data as props, subscribes to nothing.
 */

import { useTranslation } from 'react-i18next'
import type { HealthState } from '@/store/health-store'

export interface FooterProps {
  healthState: HealthState
  rowCount: number
  tailLineCount: number
  uptimeLabel: string
}

export function Footer({
  healthState,
  rowCount,
  tailLineCount,
  uptimeLabel,
}: FooterProps) {
  const { t } = useTranslation()
  const cells: [string, string][] = [
    [
      t('processPanel.stats.state'),
      t(`cloudSession.connection.state.${healthState}`),
    ],
    [t('processPanel.stats.rows'), String(rowCount).padStart(2, '0')],
    [t('processPanel.stats.tail'), String(tailLineCount).padStart(2, '0')],
    [t('processPanel.stats.uptime'), uptimeLabel],
  ]
  return (
    <div
      className="grid shrink-0 grid-cols-4 border-t border-hub-hairline font-jbmono"
      data-testid="process-monitor-footer"
    >
      {cells.map(([k, v]) => (
        <div
          key={k}
          className="flex flex-col gap-0 border-e border-hub-hairline px-2.5 py-1.5 last:border-e-0"
        >
          <span className="text-[9px] uppercase tracking-[0.1em] text-hub-faint">
            {k}
          </span>
          <span className="text-[12px] tabular-nums text-hub-body">{v}</span>
        </div>
      ))}
    </div>
  )
}

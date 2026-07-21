import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import type { HealthState } from '@/store/health-store'

/**
 * Process-panel shell (plan 6.3A/6.3C, design_handoff §6/§8): the
 * right-side overlay frame, the collapsed SYS edge tab, and the
 * ACTIVITY/SYSTEM lane toggle. The lanes' CONTENT arrives via slots —
 * `activitySlot` (ActivityFeed) and `systemSlot` (the terminal port,
 * shipping separately). The shell OVERLAYS the board (the map never
 * reflows); posture defaults are pinned in plan 6.3C — hosts own the
 * state, this owns the frame.
 */

export type PanelLane = 'activity' | 'system'

export interface PanelShellProps {
  expanded: boolean
  lane: PanelLane
  onToggleExpanded: () => void
  onLaneChange: (lane: PanelLane) => void
  activitySlot: ReactNode
  systemSlot: ReactNode
  /** Connection dot on the collapsed tab + footer. */
  healthState: HealthState
  /** Footer meta (version, schema) — host-supplied strings. */
  footerMeta?: string[]
}

const HEALTH_DOT: Record<HealthState, string> = {
  live: 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]',
  connecting: 'bg-hub-accent [box-shadow:var(--hub-glow-accent)]',
  reconnecting: 'bg-hub-working [box-shadow:var(--hub-glow-working)]',
  stale: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
  offline: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
}

export function PanelShell({
  expanded,
  lane,
  onToggleExpanded,
  onLaneChange,
  activitySlot,
  systemSlot,
  healthState,
  footerMeta = [],
}: PanelShellProps) {
  const { t } = useTranslation()

  if (!expanded) {
    return (
      <button
        type="button"
        aria-label={t('processPanel.open')}
        title={t('processPanel.open')}
        onClick={onToggleExpanded}
        className="absolute end-0 top-1/2 z-20 flex h-[104px] w-[22px] -translate-y-1/2 flex-col items-center justify-center gap-2 rounded-s-md border border-e-0 border-hub-hairline bg-hub-overlay p-0 text-hub-faint backdrop-blur transition-colors hover:border-hub-hairline-bright hover:text-hub-accent"
      >
        <span
          aria-hidden
          className={cn('size-[7px] rounded-full', HEALTH_DOT[healthState])}
        />
        <span className="font-stmono text-[8.5px] uppercase tracking-[2px] [writing-mode:vertical-rl]">
          {t('processPanel.tab')}
        </span>
      </button>
    )
  }

  return (
    <aside
      aria-label={t('processPanel.title')}
      className="absolute bottom-0 end-0 top-0 z-30 flex w-[396px] flex-col border-s border-hub-hairline bg-hub-ground/95 backdrop-blur-xl"
    >
      <div className="flex items-center gap-2.5 border-b border-hub-hairline px-4 py-3">
        <span
          aria-hidden
          className={cn('size-2 rounded-full', HEALTH_DOT[healthState])}
        />
        <span className="font-stmono text-[11.5px] uppercase tracking-[2.5px] text-hub-body-2">
          {t('processPanel.title')}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          aria-label={t('processPanel.close')}
          onClick={onToggleExpanded}
          className="flex size-[26px] items-center justify-center rounded border border-hub-hairline text-hub-muted transition-colors hover:text-hub-heading"
        >
          <X className="size-3" aria-hidden />
        </button>
      </div>
      <div
        role="tablist"
        aria-label={t('processPanel.lanes')}
        className="flex gap-1 border-b border-hub-hairline px-3 py-2"
      >
        {(['activity', 'system'] as const).map(laneId => (
          <button
            key={laneId}
            type="button"
            role="tab"
            aria-selected={lane === laneId}
            onClick={() => {
              onLaneChange(laneId)
            }}
            className={cn(
              'rounded px-3 py-1.5 font-stmono text-[10px] uppercase tracking-[2px] transition-colors',
              lane === laneId
                ? 'bg-hub-accent/10 text-hub-heading'
                : 'text-hub-faint hover:text-hub-body-2'
            )}
          >
            {t(`processPanel.lane.${laneId}`)}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {lane === 'activity' ? activitySlot : systemSlot}
      </div>
      <div className="flex gap-4 border-t border-hub-hairline px-4 py-2.5 font-jbmono text-[10px] uppercase text-hub-ghost">
        {footerMeta.map(item => (
          <span key={item}>{item}</span>
        ))}
        <span className="flex-1" />
        <span className={cn(HEALTH_DOT[healthState], 'sr-only')} />
        <span>{t(`cloudSession.connection.state.${healthState}`)}</span>
      </div>
    </aside>
  )
}

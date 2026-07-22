/**
 * SYSTEM lane — Header (ported `processTerminal` retained surface,
 * plan 6.3A, with the pinned cuts applied):
 *
 * - `ProcessTerminalBgMode`/`bgMode` + the toggle button are CUT — the
 *   adaptation hardcodes the CRT treatment (fix-delta 2).
 * - `mode: 'session' | 'empty'` is CUT with its only driver
 *   (`EmptyPanel` is in the discarded set) — the lane always has a
 *   session.
 * - The export dropdown (.txt/.html) is CUT (M6 live-smoke fix): the
 *   kiosk build strips the fs write commands (removeUnusedCommands),
 *   and granting fs-write to a wall board for an unplanned feature
 *   expands the wrong surface — the HTML-export path
 *   (`parseAnsiToHtml`) fell with it, its sole consumer.
 *
 * Status dot + micro-label + row count / uptime. Pure presentational —
 * accepts everything as props, subscribes to nothing.
 */

import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

export interface HeaderProps {
  isRunning: boolean
  rowCount: number
  uptimeLabel: string
}

export function Header({ isRunning, rowCount, uptimeLabel }: HeaderProps) {
  const { t } = useTranslation()
  return (
    <div className="flex h-8 shrink-0 items-center gap-2 border-b border-hub-hairline px-3">
      <span
        aria-hidden
        data-status={isRunning ? 'running' : 'idle'}
        className={cn(
          'size-[7px] shrink-0 rounded-full',
          isRunning
            ? 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]'
            : 'bg-hub-muted'
        )}
      />
      <span className="font-stmono text-[10px] uppercase tracking-[2px] text-hub-body-2">
        {t('processPanel.title')}
      </span>
      <span className="flex-1" />
      <span className="font-jbmono text-[10px] tabular-nums text-hub-faint">
        {t('processPanel.monitor.summary', {
          count: rowCount,
          uptime: uptimeLabel,
        })}
      </span>
    </div>
  )
}

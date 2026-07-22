/**
 * SYSTEM lane — Header (ported `processTerminal` retained surface,
 * plan 6.3A, with the pinned cuts applied):
 *
 * - `ProcessTerminalBgMode`/`bgMode` + the toggle button are CUT — the
 *   adaptation hardcodes the CRT treatment (fix-delta 2).
 * - `mode: 'session' | 'empty'` is CUT with its only driver
 *   (`EmptyPanel` is in the discarded set) — the lane always has a
 *   session; `onExportJsonl` is CUT with the discarded source wrappers
 *   that supplied it.
 *
 * Status dot + micro-label + row count / uptime + the export dropdown
 * (Text and HTML — both keyboard-accessible via Radix). Pure
 * presentational — accepts everything as props, subscribes to nothing.
 */

import { useTranslation } from 'react-i18next'
import { DownloadIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export interface HeaderProps {
  isRunning: boolean
  rowCount: number
  uptimeLabel: string
  /** Export the lane's output as plain text (`.txt`). */
  onExportTxt: () => void
  /** Export the lane's output as a self-contained HTML document. */
  onExportHtml: () => void
  canExport: boolean
}

export function Header({
  isRunning,
  rowCount,
  uptimeLabel,
  onExportTxt,
  onExportHtml,
  canExport,
}: HeaderProps) {
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={!canExport}
            title={t('processPanel.export.title')}
            data-testid="process-monitor-export-trigger"
            className="size-6 text-hub-faint hover:text-hub-body-2"
          >
            <DownloadIcon className="size-3" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={onExportTxt}
            data-testid="process-monitor-export-txt"
          >
            {t('processPanel.export.txt')}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={onExportHtml}
            data-testid="process-monitor-export-html"
          >
            {t('processPanel.export.html')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

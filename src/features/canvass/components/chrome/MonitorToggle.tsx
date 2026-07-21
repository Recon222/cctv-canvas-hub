import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

/**
 * Process-monitor toggle (header, design_handoff §1) — a terminal
 * glyph button whose active state mirrors the panel's expanded state.
 * Presentational; the host owns the panel state.
 */
export function MonitorToggle({
  active,
  onToggle,
}: {
  active: boolean
  onToggle: () => void
}) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      aria-label={t('processPanel.toggle')}
      title={t('processPanel.toggle')}
      aria-pressed={active}
      onClick={onToggle}
      className={cn(
        'flex size-9 items-center justify-center rounded border transition-colors',
        active
          ? 'border-hub-hairline-bright bg-hub-accent/10 text-hub-heading'
          : 'border-hub-hairline text-hub-muted hover:border-hub-hairline-bright hover:text-hub-heading'
      )}
    >
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="rtl:-scale-x-100"
      >
        <path d="m5 8 4 4-4 4" />
        <path d="M12 18h7" />
      </svg>
    </button>
  )
}

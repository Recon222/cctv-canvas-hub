import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import type { HealthState } from '@/store/health-store'

/**
 * Honest-liveness UI (Phase 5.2A, G4): the persistent header chip for
 * all five health states, plus the escalation banner for STALE/OFFLINE.
 * Purely presentational — agents feed `state` from the health store and
 * `lastConfirm` from its marks. The sub-label is ALWAYS the last
 * *confirmed* server contact, never an optimistic "live" (pinned).
 *
 * `formatClockTime` is deliberately local: cloud-session must not
 * deep-import canvass internals (gate rule 3).
 */

const pad = (n: number): string => String(n).padStart(2, '0')

function formatClockTime(at: number): string {
  const date = new Date(at)
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

interface StateStyle {
  dot: string
  chip: string
  label: string
  pulse: boolean
}

const STATE_STYLES: Record<HealthState, StateStyle> = {
  live: {
    dot: 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]',
    chip: 'border-hub-complete/35 bg-hub-complete/5',
    label: 'text-hub-complete',
    pulse: false,
  },
  connecting: {
    dot: 'bg-hub-accent [box-shadow:var(--hub-glow-accent)]',
    chip: 'border-hub-accent/30 bg-hub-accent/5',
    label: 'text-hub-accent',
    pulse: true,
  },
  reconnecting: {
    dot: 'bg-hub-working [box-shadow:var(--hub-glow-working)]',
    chip: 'border-hub-working/35 bg-hub-working/5',
    label: 'text-hub-working',
    pulse: true,
  },
  stale: {
    dot: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
    chip: 'border-hub-danger/50 bg-hub-danger/10',
    label: 'text-hub-danger',
    pulse: false,
  },
  offline: {
    dot: 'bg-hub-danger [box-shadow:var(--hub-glow-danger)]',
    chip: 'border-hub-danger/50 bg-hub-danger/10',
    label: 'text-hub-danger',
    pulse: false,
  },
}

export interface ConnectionIndicatorProps {
  state: HealthState
  /** Epoch ms of the last positive confirmation; null before the first. */
  lastConfirm: number | null
}

/** The persistent header chip. */
export function ConnectionIndicator({
  state,
  lastConfirm,
}: ConnectionIndicatorProps) {
  const { t } = useTranslation()
  const style = STATE_STYLES[state]
  const sub =
    lastConfirm === null
      ? t('cloudSession.connection.awaitingConfirm')
      : t(
          state === 'stale' || state === 'offline'
            ? 'cloudSession.connection.lastConfirmed'
            : 'cloudSession.connection.updated',
          { time: formatClockTime(lastConfirm) }
        )
  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded border px-3 py-1.5',
        style.chip
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-[9px] rounded-full',
          style.dot,
          style.pulse && 'animate-pulse'
        )}
      />
      <span
        className={cn(
          'font-stmono text-xs uppercase tracking-[2px]',
          style.label
        )}
      >
        {t(`cloudSession.connection.state.${state}`)}
      </span>
      <span aria-hidden className="h-3.5 w-px bg-hub-hairline" />
      <span className="font-jbmono text-[11.5px] text-hub-muted">{sub}</span>
    </div>
  )
}

/**
 * The unmissable full-width escalation banner — render directly under
 * the header whenever state is `stale` or `offline` (returns null
 * otherwise, so it can mount unconditionally).
 */
export function ConnectionBanner({
  state,
  lastConfirm,
}: ConnectionIndicatorProps) {
  const { t } = useTranslation()
  if (state !== 'stale' && state !== 'offline') {
    return null
  }
  const time = lastConfirm === null ? '—' : formatClockTime(lastConfirm)
  return (
    <div
      role="alert"
      className="flex items-center gap-4 border-b border-hub-danger/55 bg-hub-danger/15 px-5 py-3"
    >
      <span
        aria-hidden
        className="size-3 animate-pulse rounded-full bg-hub-danger [box-shadow:var(--hub-glow-danger)]"
      />
      <p className="font-stmono text-[15px] uppercase tracking-[2.5px] text-hub-danger-text">
        {t(`cloudSession.connection.banner.${state}.title`, { time })}
      </p>
      <span className="flex-1" />
      <p className="font-jbmono text-xs text-hub-danger-text/80">
        {t(`cloudSession.connection.banner.${state}.detail`, { time })}
      </p>
    </div>
  )
}

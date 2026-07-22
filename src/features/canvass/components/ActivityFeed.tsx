import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { ATTENTION_TTL_MS } from '../store/canvass-store'
import { formatClockTime } from '../services/format'
import type { ActivityEntry, ActivityKind } from '../types'

/**
 * The live activity lane (Phase 5.1A): newest-first, timestamped rows
 * with status-colored dots and the 12 s attention tint. Home-agnostic —
 * hosted by the ProcessPanel's ACTIVITY lane as of 6.3C
 * (PanelActivityLane composes it into the panel's activitySlot); the
 * host owns scrolling.
 *
 * Typed-props only: the host selects `activity` from the canvass store
 * (or filters it case-scoped) and passes it down.
 */

const KIND_DOT: Record<ActivityKind, string> = {
  'location-new': 'bg-hub-started [box-shadow:var(--hub-glow-started)]',
  'location-status': 'bg-hub-working [box-shadow:var(--hub-glow-working)]',
  'location-updated': 'bg-hub-accent [box-shadow:var(--hub-glow-accent)]',
  'media-new': 'bg-hub-accent [box-shadow:var(--hub-glow-accent)]',
  'case-updated': 'bg-hub-complete [box-shadow:var(--hub-glow-complete)]',
}

export interface ActivityFeedProps {
  entries: ActivityEntry[]
  /** The host's render-tick clock (e.g. `useNow`). The freshness tint
   * renders only when provided — a `Date.now()` default would be impure
   * during render (React Compiler purity rule); the tint window is
   * derived, never stored. */
  now?: number
}

export function ActivityFeed({ entries, now }: ActivityFeedProps) {
  const { t } = useTranslation()

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2.5 px-8 py-14 text-center">
        <p className="font-stmono text-[11px] uppercase tracking-[2px] text-hub-faint">
          {t('canvass.feed.empty.title')}
        </p>
        <p className="text-[13.5px] text-hub-ghost [text-wrap:pretty]">
          {t('canvass.feed.empty.description')}
        </p>
      </div>
    )
  }

  return (
    <ol className="flex flex-col py-1.5">
      {entries.map(entry => {
        const fresh = now !== undefined && now - entry.at < ATTENTION_TTL_MS
        return (
          <li
            key={entry.id}
            className={cn(
              'flex gap-3 px-4 py-2.5 transition-colors duration-500',
              fresh && 'bg-hub-working/5'
            )}
          >
            <span className="min-w-[60px] shrink-0 pt-0.5 font-jbmono text-[11px] text-hub-faint">
              {formatClockTime(entry.at)}
            </span>
            <span
              aria-hidden
              className={cn(
                'mt-[5px] size-2 shrink-0 rounded-full',
                KIND_DOT[entry.kind]
              )}
            />
            <p className="text-[13.5px] leading-[1.45] text-hub-body-2">
              {entry.summary}
            </p>
          </li>
        )
      })}
    </ol>
  )
}

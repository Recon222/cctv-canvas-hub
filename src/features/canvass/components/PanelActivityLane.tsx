import { useTranslation } from 'react-i18next'
import { useCanvassStore } from '../store/canvass-store'
import { useNow } from '../hooks/useNow'
import { ActivityFeed } from './ActivityFeed'

/**
 * The ProcessPanel's ACTIVITY lane content (Phase 6.3C): CanvassRoot
 * composes this into the panel's `activitySlot` — the sanctioned seam
 * (the panel imports NOTHING from canvass; the host injects the feed,
 * fix-delta 2). Relocated from the dashboard's M5-interim column.
 *
 * Owns the case scoping (#90) and the 1 s freshness tick, isolated
 * here so the tick re-renders this lane only — never the board.
 * With no case selected (the landing view) the lane shows the whole
 * agency ring: the panel exists on every view now, and the landing IS
 * the agency overview.
 */
export function PanelActivityLane() {
  const { t } = useTranslation()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const activity = useCanvassStore(state => state.activity)
  const now = useNow(1_000)
  const entries =
    selectedCaseId === null
      ? activity
      : activity.filter(entry => entry.caseId === selectedCaseId)

  return (
    <section aria-label={t('canvass.feed.title')}>
      <ActivityFeed entries={entries} now={now} />
    </section>
  )
}

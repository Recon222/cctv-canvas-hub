/**
 * ProcessPanel (plan 6.3A/6.3C, AD14 revised): the right-edge
 * collapsible panel — ACTIVITY ↔ SYSTEM over the poured PanelShell.
 *
 * Expanded/collapsed state IS `useUIStore.rightSidebarVisible` (the
 * template's Cmd/Ctrl+2 shortcut, both palette commands, and the
 * host's MonitorToggle all drive the same boolean — zero new
 * plumbing); only LANE selection is new panel-local state.
 *
 * The ACTIVITY lane renders the `activitySlot` the host supplies
 * (CanvassRoot fills it with `<ActivityFeed />` — composition at the
 * mount site; this feature imports NOTHING from canvass, AD11).
 */

import { useState, type ReactNode } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useHealthStore } from '@/store/health-store'
import { useCanvasHubSource } from '../sources/canvasHubSource'
import { PanelShell, type PanelLane } from './PanelShell'
import { SystemLane } from './SystemLane'

export interface ProcessPanelProps {
  /** The ACTIVITY lane's content — host-composed (no canvass import). */
  activitySlot: ReactNode
  /** Version/schema chips for the shell footer — host-supplied strings
   * (the schema constant lives in cloud-session; importing it here is
   * outside AD11's seam inventory). */
  footerMeta?: string[]
}

export function ProcessPanel({ activitySlot, footerMeta }: ProcessPanelProps) {
  const expanded = useUIStore(state => state.rightSidebarVisible)
  const [lane, setLane] = useState<PanelLane>('activity')
  const healthState = useHealthStore(state => state.state)
  // Poll discipline (6.3A): disk/IPC sources run only while the SYSTEM
  // lane is actually watched — expanded AND active. The health
  // subscription inside the source stays live regardless, so
  // transitions are not lost while collapsed.
  const rows = useCanvasHubSource(expanded && lane === 'system')

  return (
    <PanelShell
      expanded={expanded}
      lane={lane}
      onToggleExpanded={() => {
        useUIStore.getState().toggleRightSidebar()
      }}
      onLaneChange={setLane}
      activitySlot={activitySlot}
      systemSlot={<SystemLane rows={rows} healthState={healthState} />}
      healthState={healthState}
      footerMeta={footerMeta}
    />
  )
}

/**
 * Panel posture precedence (plan 6.3C, fix-delta 2 — two writers, one
 * boolean): the view-derived posture applies on FIRST entry to each
 * view per board session (`viewsSeen`); an explicit user toggle wins
 * thereafter — a manual expand on the map view survives
 * map → case → map (#125), and the shipped Cmd/Ctrl+2 shortcut never
 * reads as flaky.
 *
 * View-agnostic on purpose: the host (CanvassRoot) names its views and
 * their default posture; this feature knows nothing about canvass.
 * The `viewsSeen` ref lives with the caller — board unmount (session
 * exit) resets it, so "per session" comes free.
 */

import { useEffect, useRef } from 'react'
import { useUIStore } from '@/store/ui-store'

export function usePanelPosture(
  viewKey: string,
  expandedByDefault: boolean
): void {
  const viewsSeen = useRef(new Set<string>())
  useEffect(() => {
    if (viewsSeen.current.has(viewKey)) {
      return
    }
    viewsSeen.current.add(viewKey)
    useUIStore.getState().setRightSidebarVisible(expandedByDefault)
  }, [viewKey, expandedByDefault])
}

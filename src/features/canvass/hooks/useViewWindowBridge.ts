/**
 * Main-window bridge for the pop-out windows (Phase 7.3B): answers
 * `secondary-ready` with the view-context half of the handshake and
 * clears the rail's popped indicator on `view-window-closed`. Mounted
 * by CanvassRoot — a secondary can only be opened from the board, so
 * the bridge lives exactly as long as anything that can pop out.
 */

import { useEffect } from 'react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { logger } from '@/lib/logger'
import {
  onSecondaryReady,
  onViewWindowClosed,
} from '@/lib/services/sessionEvents'
import { clearViewWindow, replySecondaryReady } from '../services/viewWindows'

export function useViewWindowBridge(): void {
  useEffect(() => {
    let disposed = false
    const unlisteners: UnlistenFn[] = []

    const attach = async () => {
      const readyUnlisten = await onSecondaryReady(({ view }) => {
        replySecondaryReady(view)
      })
      const closedUnlisten = await onViewWindowClosed(view => {
        clearViewWindow(view)
      })
      if (disposed) {
        readyUnlisten()
        closedUnlisten()
        return
      }
      unlisteners.push(readyUnlisten, closedUnlisten)
    }

    attach().catch((cause: unknown) => {
      logger.error('Failed to attach the view-window bridge', { cause })
    })

    return () => {
      disposed = true
      for (const unlisten of unlisteners) {
        unlisten()
      }
    }
  }, [])
}

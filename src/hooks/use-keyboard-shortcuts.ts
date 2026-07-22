import { useEffect } from 'react'
import { useUIStore } from '@/store/ui-store'
import { useSessionStore } from '@/features/cloud-session'
import type { CommandContext } from '@/lib/commands/types'

/**
 * Handles global keyboard shortcuts for the application.
 *
 * Currently handles:
 * - Cmd/Ctrl+, : Open preferences
 * - Cmd/Ctrl+1 : Toggle left sidebar
 * - Cmd/Ctrl+2 : Toggle right sidebar
 */
export function useKeyboardShortcuts(commandContext: CommandContext) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 6.1 (AD6): a locked board is interaction-dead, global shortcuts
      // included — the overlay swallows pointer input, but document-level
      // key listeners need their own gate.
      if (useSessionStore.getState().state === 'locked') {
        return
      }
      if (e.metaKey || e.ctrlKey) {
        switch (e.key) {
          case ',': {
            e.preventDefault()
            commandContext.openPreferences()
            break
          }
          case '1': {
            e.preventDefault()
            const { leftSidebarVisible, setLeftSidebarVisible } =
              useUIStore.getState()
            setLeftSidebarVisible(!leftSidebarVisible)
            break
          }
          case '2': {
            e.preventDefault()
            const { rightSidebarVisible, setRightSidebarVisible } =
              useUIStore.getState()
            setRightSidebarVisible(!rightSidebarVisible)
            break
          }
        }
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [commandContext])
}

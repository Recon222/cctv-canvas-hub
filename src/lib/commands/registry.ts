import type { TFunction } from 'i18next'
import type { AppCommand, CommandContext } from './types'

const commandRegistry = new Map<string, AppCommand>()

/**
 * AD6 (Phase 6.1): a locked board is interaction-dead, and this
 * dispatcher is the choke point for the palette and titlebar paths —
 * every command is blocked while the session is `locked` EXCEPT
 * window management, which is OS chrome, not board interaction (the
 * native Hide/Quit menu items stay reachable for the same reason).
 * `session-sign-out` is deliberately NOT allow-listed: the LockOverlay
 * owns the locked-state escape.
 *
 * Entry paths that bypass this dispatcher carry their own one-line
 * gates: menu.ts (native menu actions/accelerators), the palette's
 * Ctrl+K opener, and use-keyboard-shortcuts.ts.
 */
const LOCKED_ALLOWED_COMMANDS = new Set([
  'window-close',
  'window-minimize',
  'window-toggle-maximize',
  'window-fullscreen',
  'window-exit-fullscreen',
])

export function registerCommands(commands: AppCommand[]): void {
  commands.forEach(cmd => commandRegistry.set(cmd.id, cmd))
}

export function getAllCommands(
  context: CommandContext,
  searchValue = '',
  t?: TFunction
): AppCommand[] {
  const allCommands = Array.from(commandRegistry.values()).filter(
    command => !command.isAvailable || command.isAvailable(context)
  )

  if (searchValue.trim() && t) {
    const search = searchValue.toLowerCase()
    return allCommands.filter(cmd => {
      const label = t(cmd.labelKey).toLowerCase()
      const description = cmd.descriptionKey
        ? t(cmd.descriptionKey).toLowerCase()
        : ''
      return label.includes(search) || description.includes(search)
    })
  }

  return allCommands
}
export async function executeCommand(
  commandId: string,
  context: CommandContext
): Promise<{ success: boolean; error?: string }> {
  try {
    if (!LOCKED_ALLOWED_COMMANDS.has(commandId)) {
      // Lazy import (template pattern): features stay out of the
      // registry's static module graph.
      const { useSessionStore } = await import('@/features/cloud-session')
      if (useSessionStore.getState().state === 'locked') {
        return {
          success: false,
          error: `Command '${commandId}' is blocked while the session is locked`,
        }
      }
    }

    const command = commandRegistry.get(commandId)

    if (!command) {
      return {
        success: false,
        error: `Command '${commandId}' not found`,
      }
    }

    if (command.isAvailable && !command.isAvailable(context)) {
      return {
        success: false,
        error: `Command '${commandId}' is not available`,
      }
    }

    await command.execute(context)

    return { success: true }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error'

    return {
      success: false,
      error: `Failed to execute command '${commandId}': ${errorMessage}`,
    }
  }
}

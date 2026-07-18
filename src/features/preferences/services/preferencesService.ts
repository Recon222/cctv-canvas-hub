/**
 * Preferences Service - Plain Exported Async Functions
 *
 * Owns ALL Tauri IPC calls for the preferences feature.
 * Components/hooks NEVER call Tauri commands directly.
 */

import { commands, type AppPreferences } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

export async function loadPreferences(): Promise<AppPreferences> {
  logger.debug('Loading preferences from backend')
  const result = await commands.loadPreferences()

  if (result.status === 'error') {
    // The backend returns Ok(defaults) for a missing file, so reaching here
    // means a genuine read/parse failure. Surface it (via the query's error
    // state) instead of masking it as defaults — otherwise a later save would
    // atomically overwrite the intact-but-unreadable file with those defaults.
    logger.error('Failed to load preferences', { error: result.error })
    throw new Error(result.error)
  }

  logger.info('Preferences loaded successfully', {
    preferences: result.data,
  })
  return result.data
}

export async function savePreferences(
  preferences: AppPreferences
): Promise<void> {
  logger.debug('Saving preferences to backend', { preferences })
  const result = await commands.savePreferences(preferences)

  if (result.status === 'error') {
    logger.error('Failed to save preferences', {
      error: result.error,
      preferences,
    })
    throw new Error(result.error)
  }

  logger.info('Preferences saved successfully')
}

export async function getDefaultQuickPaneShortcut(): Promise<string> {
  return await commands.getDefaultQuickPaneShortcut()
}

export async function updateQuickPaneShortcut(
  shortcut: string | null
): Promise<void> {
  const result = await commands.updateQuickPaneShortcut(shortcut)
  if (result.status === 'error') {
    throw new Error(result.error)
  }
}

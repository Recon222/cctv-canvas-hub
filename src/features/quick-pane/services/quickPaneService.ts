/**
 * Quick Pane Service - Plain Exported Async Functions
 *
 * Owns ALL Tauri IPC calls for the quick pane feature.
 */

import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

export async function dismissQuickPane(): Promise<void> {
  const result = await commands.dismissQuickPane()
  if (result.status === 'error') {
    logger.error('Failed to dismiss quick pane', { error: result.error })
  }
}

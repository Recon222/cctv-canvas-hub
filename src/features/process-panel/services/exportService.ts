/**
 * SYSTEM-lane exports (plan 6.3A — the retained Header's export
 * dropdown, wired to the OS save dialog). Services own the plugin IPC
 * (the discipline note carried over from the retired diagnostics
 * window, A2).
 */

import { save } from '@tauri-apps/plugin-dialog'
import { writeTextFile } from '@tauri-apps/plugin-fs'

/** Prompt for a path and write `content`; resolves false on cancel. */
export async function exportTextFile(
  defaultName: string,
  content: string
): Promise<boolean> {
  const path = await save({ defaultPath: defaultName })
  if (path === null) {
    return false
  }
  await writeTextFile(path, content)
  return true
}

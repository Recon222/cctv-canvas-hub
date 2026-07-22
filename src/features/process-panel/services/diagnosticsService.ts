/**
 * Diagnostics service (plan 6.3A): the panel's IPC seam — services own
 * the Tauri calls; the source adapter and components never touch
 * `commands.*` directly.
 */

import { commands, type VaultStatus } from '@/lib/tauri-bindings'

/** Lines requested per tail poll (the command clamps at 500). */
export const LOG_TAIL_LINES = 200

export async function readLogTail(
  lines: number = LOG_TAIL_LINES
): Promise<string> {
  const result = await commands.readLogTail(lines)
  if (result.status === 'error') {
    throw new Error(result.error)
  }
  return result.data
}

/**
 * Presence status only — the command never decrypts (`vault_get` is
 * the wrong tool for status). An error here is an ERROR to render,
 * never an all-false "no key present" (6.3B).
 */
export async function readVaultStatus(): Promise<VaultStatus> {
  const result = await commands.vaultStatus()
  if (result.status === 'error') {
    throw new Error(result.error)
  }
  return result.data
}

/**
 * supabase-js async storage adapter backed by the encrypted session vault
 * (Rust `cloud_session` feature over IPC).
 *
 * Sanctioned adapter: this file calls `commands.*` outside a feature
 * services/ dir because it IS the storage seam of the client singleton
 * (AD11). SECURITY (T3): never log values — only key NAMES.
 *
 * Single-key invariant: the vault holds ONE blob. supabase-js passes
 * exactly one storage key today (password grant, detectSessionInUrl:
 * false). The adapter records the first key it sees and fails loudly if a
 * different key ever arrives — a supabase-js upgrade that adds a second
 * key must fail visibly, not corrupt the session blob.
 */

import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

let boundKey: string | null = null

/**
 * Clear the recorded storage key. Called by `teardownSupabase()` so a
 * re-initialized client (e.g. re-enrollment into a different project,
 * whose storage key embeds the project ref) can bind fresh.
 */
export function resetVaultStorageBinding(): void {
  boundKey = null
}

function assertSingleKey(key: string): void {
  if (boundKey === null) {
    boundKey = key
    return
  }
  if (boundKey !== key) {
    // Loud failure path — key names only, never values.
    logger.error(
      'vaultStorage: second distinct storage key detected — the vault holds exactly one blob',
      { boundKey, offendingKey: key }
    )
    throw new Error(
      `vaultStorage supports exactly one storage key (bound "${boundKey}", got "${key}")`
    )
  }
}

export const vaultStorage: {
  getItem(key: string): Promise<string | null>
  setItem(key: string, value: string): Promise<void>
  removeItem(key: string): Promise<void>
} = {
  async getItem(key) {
    assertSingleKey(key)
    const result = await commands.vaultGet()
    if (result.status === 'error') {
      // A corrupt/unreadable vault degrades to "no session" → re-sign-in,
      // never a crash (the error string carries no secret material).
      logger.warn(
        'vaultStorage: vault read failed; treating session as absent',
        {
          error: result.error,
        }
      )
      return null
    }
    return result.data
  },

  async setItem(key, value) {
    assertSingleKey(key)
    const result = await commands.vaultSet(value)
    if (result.status === 'error') {
      throw new Error(result.error)
    }
  },

  async removeItem(key) {
    assertSingleKey(key)
    const result = await commands.vaultClear()
    if (result.status === 'error') {
      throw new Error(result.error)
    }
  },
}

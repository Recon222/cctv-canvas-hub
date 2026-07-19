/**
 * supabase-js async storage adapter backed by the encrypted session vault
 * (Rust `cloud_session` feature over IPC).
 *
 * Sanctioned adapter: this file calls `commands.*` outside a feature
 * services/ dir because it IS the storage seam of the client singleton
 * (AD11). SECURITY (T3): never log values — only key NAMES.
 *
 * Single-blob invariant: the vault holds ONE blob — the session. GoTrue
 * touches two storage keys in practice (live-verified): the session key
 * (`sb-{ref}-auth-token`) and the transient PKCE code-verifier key
 * (`sb-{ref}-auth-token-code-verifier`, cleaned up on init — it can
 * arrive FIRST). Verifier keys are backed in-memory and never reach the
 * vault. Among the remaining (session-class) keys, the adapter records
 * the first it sees and fails loudly if a different one is ever read or
 * written — a supabase-js upgrade that adds another persistent key must
 * fail visibly, not corrupt the session blob. Removal of an unbound
 * sibling key (sign-out removes `sb-{ref}-auth-token-user`) is the one
 * exception: removing what was never stored is a no-op.
 */

import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'

let boundKey: string | null = null

/**
 * Transient per-launch storage for GoTrue's PKCE code verifier. Only
 * meaningful within a single in-process auth flow — never persisted.
 */
const transientItems = new Map<string, string>()

function isTransientKey(key: string): boolean {
  return key.endsWith('-code-verifier')
}

/**
 * Clear the recorded storage key + transient items. Called by
 * `teardownSupabase()` so a re-initialized client (e.g. re-enrollment
 * into a different project, whose storage key embeds the project ref)
 * can bind fresh.
 */
export function resetVaultStorageBinding(): void {
  boundKey = null
  transientItems.clear()
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
    if (isTransientKey(key)) {
      return transientItems.get(key) ?? null
    }
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
    if (isTransientKey(key)) {
      transientItems.set(key, value)
      return
    }
    assertSingleKey(key)
    const result = await commands.vaultSet(value)
    if (result.status === 'error') {
      throw new Error(result.error)
    }
  },

  async removeItem(key) {
    if (isTransientKey(key)) {
      transientItems.delete(key)
      return
    }
    // Removal NEVER binds the storage key — only getItem/setItem do.
    // auth-js (2.110.7 `_removeSession`) removes sibling keys it never
    // stored here (e.g. `sb-{ref}-auth-token-user`, even with no
    // userStorage configured), and its internal removal ORDER is an
    // undocumented implementation detail: if an upgrade ever issued a
    // sibling removal before any session read/write, binding here would
    // let it `vaultClear()` the real session. Removing anything but the
    // bound key is a no-op (localStorage semantics); reads/writes of a
    // second session-class key still fail loudly via `assertSingleKey`.
    if (key !== boundKey) {
      return
    }
    const result = await commands.vaultClear()
    if (result.status === 'error') {
      throw new Error(result.error)
    }
  },
}

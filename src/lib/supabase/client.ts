/**
 * Supabase client singleton for the agency cloud.
 *
 * Auth persistence goes through the encrypted session vault (vault-storage
 * adapter → Rust IPC). Every supabase-js consumer reaches the cloud through
 * `getSupabase()` — the single seam tests mock (`vi.mock('@/lib/supabase/client')`).
 *
 * `createProbeClient` is the one deliberate exception to the singleton: the
 * enrollment probe (Flow A step 2) runs BEFORE `initSupabase`, so it uses a
 * transient client that never touches the vault.
 */

import { createClient } from '@supabase/supabase-js'
import type { CloudConfig } from '@/lib/tauri-bindings'
import { resetVaultStorageBinding, vaultStorage } from './vault-storage'

/**
 * The concrete client type `createClient` returns (untyped Database
 * generics until a schema type exists). Using the inferred type keeps
 * every assignment/return exact — annotating with bare `SupabaseClient`
 * re-parameterizes the generics and trips no-unsafe-assignment.
 */
export type SupabaseClient = ReturnType<typeof createClient>

export class SupabaseNotInitializedError extends Error {
  constructor() {
    super(
      'Supabase client is not initialized — call initSupabase(config) first'
    )
    this.name = 'SupabaseNotInitializedError'
  }
}

let client: SupabaseClient | null = null

export function initSupabase(config: CloudConfig): SupabaseClient {
  client = createClient(config.url, config.publishable_key, {
    auth: {
      storage: vaultStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new SupabaseNotInitializedError()
  }
  return client
}

export async function teardownSupabase(): Promise<void> {
  if (!client) {
    return
  }
  const closing = client
  client = null
  resetVaultStorageBinding()
  await closing.removeAllChannels()
  await closing.realtime.disconnect()
}

/**
 * Transient client for the pre-init enrollment probe — no session
 * persistence, no refresh loop, never the vault.
 */
export function createProbeClient(url: string, key: string): SupabaseClient {
  return createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

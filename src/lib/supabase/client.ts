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
import type { Database } from './database-types'
import { resetVaultStorageBinding, vaultStorage } from './vault-storage'

/**
 * The concrete client type `createClient<Database>` returns — typed rows
 * from the hand-written contract in `database-types.ts` (doc 01 §5.1).
 * Using the inferred type keeps every assignment/return exact —
 * annotating with bare `SupabaseClient` re-parameterizes the generics
 * and trips no-unsafe-assignment.
 */
export type SupabaseClient = ReturnType<typeof createClient<Database>>

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
  client = createClient<Database>(config.url, config.publishable_key, {
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
  // Stop the refresh ticker: an abandoned client's interval could later
  // re-bind the vault adapter's storage key and trip the single-key fail.
  await closing.auth.stopAutoRefresh()
  await closing.removeAllChannels()
  await closing.realtime.disconnect()
}

/**
 * Refresh only this close to (or past) expiry on a wake path —
 * `autoRefreshToken` owns ROUTINE rotation, and racing its ticker can
 * submit an already-rotated refresh token (Flow E3, Phase 6.2).
 */
export const SESSION_EXPIRY_MARGIN_MS = 60_000

export type SessionFreshness = 'fresh' | 'refreshed' | 'failed'

/**
 * Wake-time session check (Flow E3): `fresh` = token comfortably valid,
 * nothing done; `refreshed` = rotated near/after expiry AND the realtime
 * socket re-authed with the new token (refresh-then-setAuth order);
 * `failed` = no session, or the refresh was refused — the session is
 * genuinely dead and the caller must exit honestly (#106).
 *
 * Takes the client as an argument so the caller resolves `getSupabase()`
 * synchronously (a context with no client has nothing to refresh).
 */
export async function ensureFreshSession(
  supabase: SupabaseClient
): Promise<SessionFreshness> {
  const { data, error } = await supabase.auth.getSession()
  if (error !== null || data.session === null) {
    return 'failed'
  }
  const expiresAtMs = (data.session.expires_at ?? 0) * 1000
  if (expiresAtMs - Date.now() > SESSION_EXPIRY_MARGIN_MS) {
    return 'fresh'
  }
  const refreshed = await supabase.auth.refreshSession()
  if (refreshed.error !== null || refreshed.data.session === null) {
    return 'failed'
  }
  // The realtime socket authenticates separately — hand it the rotated
  // token BEFORE the catch-up refetch re-subscribes anything.
  await supabase.realtime.setAuth()
  return 'refreshed'
}

/**
 * Transient client for the pre-init enrollment probe — no session
 * persistence, no refresh loop, never the vault.
 */
export function createProbeClient(url: string, key: string): SupabaseClient {
  return createClient<Database>(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}

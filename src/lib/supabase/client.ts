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
import { logger } from '@/lib/logger'
import {
  emitSessionToken,
  onSecondaryReady,
} from '@/lib/services/sessionEvents'
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
/** The config behind the current MAIN-window client — the url/key half
 * of every session-token push (designed-public values, T4). */
let currentConfig: CloudConfig | null = null
/** The secondary-ready reply listener attaches once per JS context. */
let secondaryReadyReplyAttached = false

export function initSupabase(config: CloudConfig): SupabaseClient {
  currentConfig = config
  const created = createClient<Database>(config.url, config.publishable_key, {
    auth: {
      storage: vaultStorage,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  client = created
  // 7.2C (AD13): main is the sole auth owner — every session ROTATION
  // is pushed to the pop-out windows. The full rotation class (PR #10
  // H1): TOKEN_REFRESHED (routine refresh), SIGNED_IN (the M6 unlock
  // re-auth is a full signInWithPassword minting a NEW session — the
  // old one is orphaned and never refreshed again; initial sign-in is
  // harmless, no secondaries exist yet), USER_UPDATED. Deliberately NO
  // eager revocation detection here (ledger D19: accepted V1 posture —
  // SIGNED_OUT pushes nothing; session-ended is authService's emit).
  created.auth.onAuthStateChange((event, session) => {
    const token = session?.access_token
    if (
      (event === 'TOKEN_REFRESHED' ||
        event === 'SIGNED_IN' ||
        event === 'USER_UPDATED') &&
      token !== undefined
    ) {
      pushSessionToken(token)
    }
  })
  attachSecondaryReadyReply()
  return created
}

/** Fire-and-forget push to every secondary (a failed emit must never
 * break main's own auth flow). */
function pushSessionToken(token: string): void {
  const config = currentConfig
  if (config === null) {
    return
  }
  emitSessionToken({
    url: config.url,
    key: config.publishable_key,
    token,
  }).catch((cause: unknown) => {
    logger.warn('Failed to push the session token to view windows', { cause })
  })
}

/**
 * The token half of the handshake reply (7.2B): a secondary announced
 * itself — reply with the CURRENT access token. A signed-out main
 * replies nothing, so the secondary hits its boot timeout honestly
 * instead of receiving a dead token. (The view-context half of the
 * reply is the canvass bridge's — it owns the per-view case registry.)
 */
function attachSecondaryReadyReply(): void {
  if (secondaryReadyReplyAttached) {
    return
  }
  secondaryReadyReplyAttached = true
  onSecondaryReady(() => {
    void replyWithCurrentToken()
  }).catch((cause: unknown) => {
    secondaryReadyReplyAttached = false
    logger.error('Failed to attach the secondary-ready reply listener', {
      cause,
    })
  })
}

async function replyWithCurrentToken(): Promise<void> {
  const holder = client
  if (holder === null || currentConfig === null) {
    return
  }
  try {
    const { data, error } = await holder.auth.getSession()
    const token = data.session?.access_token
    if (error !== null || token === undefined) {
      return
    }
    pushSessionToken(token)
  } catch (cause) {
    logger.warn('secondary-ready reply failed', { cause })
  }
}

export function getSupabase(): SupabaseClient {
  if (!client) {
    throw new SupabaseNotInitializedError()
  }
  return client
}

/**
 * Internal seam (7.2A): a SECONDARY context claims the `getSupabase()`
 * holder with its accessToken-callback client so every reused
 * service/view resolves this context's client unchanged. Only
 * `secondary-client.ts` calls this — never main-window code (main's
 * holder is owned by `initSupabase`/`teardownSupabase`).
 */
export function setSupabaseClientHolder(next: SupabaseClient | null): void {
  client = next
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
 * `autoRefreshToken` owns ROUTINE rotation (and installed gotrue's
 * `getSession()` itself auto-refreshes within its ~90 s margin,
 * single-flighted — the explicit branch below is the near-expiry
 * fallback, not the common path).
 */
export const SESSION_EXPIRY_MARGIN_MS = 60_000

export type SessionFreshness = 'fresh' | 'refreshed' | 'deferred' | 'failed'

/**
 * Auth-error classifier shared by the wake path (PR #9 M2) and
 * `reauthenticate` (D3). GoTrue surfaces fetch-level failures as
 * `AuthRetryableFetchError` with `status` 0/undefined; a 5xx or a 429
 * rate-limit is equally "not a refusal" — only a definite 4xx answer
 * reads as the server rejecting the credential/token. Lives here (not
 * authService) because client.ts must not import a feature barrel that
 * imports client.ts back.
 */
export function isNetworkAuthError(error: { status?: number }): boolean {
  return (
    error.status === undefined ||
    error.status === 0 ||
    error.status === 429 ||
    error.status >= 500
  )
}

/**
 * Wake-time session check (Flow E3): `fresh` = token comfortably valid,
 * nothing done; `refreshed` = rotated near/after expiry AND the realtime
 * socket re-authed (refresh-then-setAuth order); `deferred` = the
 * refresh could not be ATTEMPTED to completion — a network-shaped
 * failure (offline wake, 5xx) while the refresh token may be perfectly
 * valid; the caller stays put and the next wake/tick retries (PR #9
 * M2: a kiosk waking before wifi reconnects must NOT be signed out);
 * `failed` = no session, or the refresh was REFUSED (definite 4xx
 * invalid_grant) — genuinely dead, the caller exits honestly (#106).
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
  if (refreshed.error !== null) {
    return isNetworkAuthError(refreshed.error) ? 'deferred' : 'failed'
  }
  if (refreshed.data.session === null) {
    return 'failed'
  }
  // The realtime socket authenticates separately — hand it the rotated
  // token BEFORE the catch-up refetch re-subscribes anything. A hiccup
  // here is NOT a dead session (PR #9 L2): the refresh succeeded, and
  // the client's own auth listener re-auths the socket on rotation.
  try {
    await supabase.realtime.setAuth()
  } catch {
    // Still 'refreshed' — sign-out must key off the session, not the
    // socket handshake.
  }
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

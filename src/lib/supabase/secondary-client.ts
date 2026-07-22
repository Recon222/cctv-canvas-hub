/**
 * Secondary-context Supabase client (Phase 7.2A, AD13/T9).
 *
 * A pop-out window is a separate JS context whose ONLY credential is the
 * access token the main window pushes over Tauri events — never the
 * vault, never the keyring, never a refresh ticker (main is the sole
 * auth owner). The client is created with the `accessToken` callback
 * option, source-verified against installed supabase-js 2.110.7
 * (`SupabaseClient.ts`):
 *
 *  (a) the callback feeds the user bearer to PostgREST, storage, AND
 *      realtime (`fetchWithAuth` ← `_getSessionToken`; the constructor
 *      also calls `realtime.setAuth(token)` immediately) — so reused
 *      services authenticate correctly, not as anon;
 *  (b) `supabase.auth.*` is a THROWING PROXY — secondary code must never
 *      call getSession/refreshSession (the wake-refresh health path is
 *      never mounted in this context);
 *  (c) no `onAuthStateChange` fires here — rotation arrives only via
 *      `updateSecondaryToken`, and because the constructor's explicit
 *      `setAuth(token)` sets realtime-js's `_manuallySetToken` flag
 *      (gating off every callback-driven refresh path), the explicit
 *      `realtime.setAuth(token)` below is the ONLY way joined channels
 *      learn a rotated token (realtime-js 2.110.7 `_performAuth`).
 */

import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import type { Database } from './database-types'
import { setSupabaseClientHolder, type SupabaseClient } from './client'

let currentToken: string | null = null
let secondaryClient: SupabaseClient | null = null

/**
 * Creates this context's client from the handshake payload and claims
 * the `getSupabase()` holder — the seam that lets every reused
 * service/view work unchanged. `vaultStorage` is never referenced in a
 * secondary context (T9, test #115).
 */
export function initSecondaryClient(
  url: string,
  key: string,
  initialToken: string
): SupabaseClient {
  currentToken = initialToken
  secondaryClient = createClient<Database>(url, key, {
    // Closure over the module token: `updateSecondaryToken` swaps it
    // in place and every subsequent REST/storage request picks it up.
    accessToken: () => Promise.resolve(currentToken),
  })
  setSupabaseClientHolder(secondaryClient)
  return secondaryClient
}

/**
 * Ongoing `session-token` pushes (every TOKEN_REFRESHED in main): swap
 * the closure token AND explicitly re-auth realtime — the push
 * propagates in place to joined channels. First subscribe happens only
 * AFTER the initial token is installed (setAuth-before-subscribe:
 * SecondaryRoot mounts the board — and with it the subscription — only
 * once `initSecondaryClient` has run).
 */
export function updateSecondaryToken(token: string): void {
  currentToken = token
  if (secondaryClient === null) {
    return
  }
  secondaryClient.realtime.setAuth(token).catch((cause: unknown) => {
    logger.warn('secondary: realtime.setAuth failed on token push', { cause })
  })
}

/**
 * `session-ended` teardown (sign-out only): remove channels, disconnect
 * realtime, discard the in-memory token, release the holder — and never
 * touch `auth.*` (the throwing proxy). Runs BEFORE the terminal ended
 * screen renders so no broadcast is delivered after the event (#117).
 */
export async function teardownSecondaryClient(): Promise<void> {
  const closing = secondaryClient
  secondaryClient = null
  currentToken = null
  setSupabaseClientHolder(null)
  if (closing === null) {
    return
  }
  try {
    await closing.removeAllChannels()
  } catch (cause) {
    logger.warn('secondary: channel teardown failed; continuing', { cause })
  }
  try {
    await closing.realtime.disconnect()
  } catch (cause) {
    logger.warn('secondary: realtime disconnect failed', { cause })
  }
}

/**
 * Phase 7.2A (tests #114–116): the secondary-context client is the
 * ACCESS-TOKEN-ONLY path (AD13/T9) — exercised against REAL supabase-js
 * with a stubbed global fetch, because the three load-bearing behaviors
 * were verified in the installed source (2.110.7, `SupabaseClient.ts`)
 * and must stay pinned against upgrades:
 *
 *  (a) the `accessToken` option feeds the user bearer to PostgREST and
 *      storage AND realtime (`fetchWithAuth` ← `_getSessionToken` ← the
 *      callback) — `realtime.setAuth` alone would leave REST/storage
 *      authenticating as anon → RLS-empty board, 403 signing;
 *  (b) with `accessToken` set, `supabase.auth.*` is a THROWING PROXY —
 *      no GoTrue client and no refresh ticker exist in this context;
 *  (c) no `onAuthStateChange` fires (`_listenForAuthEvents` is gated on
 *      `!settings.accessToken`) — token rotation reaches this context
 *      only through `updateSecondaryToken`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands } from '@/lib/tauri-bindings'
import { getSupabase, SupabaseNotInitializedError } from './client'
import {
  initSecondaryClient,
  updateSecondaryToken,
  teardownSecondaryClient,
} from './secondary-client'

const CLOUD_URL = 'https://testref.supabase.co'
const PUBLISHABLE_KEY = 'sb_publishable_test'
const INITIAL_TOKEN = 'user-jwt-initial'

const okJson = () =>
  new Response('[]', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

let fetchSpy: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.clearAllMocks()
  fetchSpy = vi.fn(() => Promise.resolve(okJson()))
  vi.stubGlobal('fetch', fetchSpy)
})

afterEach(async () => {
  await teardownSecondaryClient()
  vi.unstubAllGlobals()
})

/** Headers of the most recent stubbed request. */
function lastRequestHeaders(): Headers {
  const call = fetchSpy.mock.calls.at(-1) as
    | [RequestInfo, RequestInit | undefined]
    | undefined
  if (call === undefined) {
    throw new Error('no request was issued')
  }
  return new Headers(call[1]?.headers)
}

describe('secondary client (Phase 7.2A, AD13/T9)', () => {
  // Test #114
  it('authenticates REST with the pushed user token, never the publishable key', async () => {
    const client = initSecondaryClient(
      CLOUD_URL,
      PUBLISHABLE_KEY,
      INITIAL_TOKEN
    )

    await client.from('cloud_cases').select('*')

    const headers = lastRequestHeaders()
    // Anon REST = RLS-empty board: the bearer must be the USER token.
    expect(headers.get('Authorization')).toBe(`Bearer ${INITIAL_TOKEN}`)
    expect(headers.get('apikey')).toBe(PUBLISHABLE_KEY)
    // (b) auth.* is the throwing proxy — no getSession, no refresh
    // ticker, no wake-refresh path exists in a secondary context.
    expect(
      () => (client as unknown as { auth: { getSession: unknown } }).auth
    ).not.toThrow() // the property itself is the proxy…
    expect(
      () =>
        (client as unknown as { auth: { getSession: unknown } }).auth.getSession
    ).toThrow(/accessToken option/)
    // The claimed getSupabase() seam: reused services/views resolve THIS
    // client in this context, unchanged.
    expect(getSupabase()).toBe(client)
  })

  // Test #115
  it('never touches the vault from a secondary context (T9)', async () => {
    const client = initSecondaryClient(
      CLOUD_URL,
      PUBLISHABLE_KEY,
      INITIAL_TOKEN
    )

    await client.from('cloud_locations').select('*')
    updateSecondaryToken('user-jwt-rotated')
    await client.from('cloud_locations').select('*')

    expect(commands.vaultGet).not.toHaveBeenCalled()
    expect(commands.vaultSet).not.toHaveBeenCalled()
    expect(commands.vaultClear).not.toHaveBeenCalled()
  })

  // Test #116
  it('updateSecondaryToken swaps the closure token AND re-auths realtime', async () => {
    const client = initSecondaryClient(
      CLOUD_URL,
      PUBLISHABLE_KEY,
      INITIAL_TOKEN
    )
    const setAuthSpy = vi
      .spyOn(client.realtime, 'setAuth')
      .mockResolvedValue(undefined)

    updateSecondaryToken('user-jwt-rotated')

    // Installed-source pin (realtime-js 2.110.7 `_performAuth`): with the
    // accessToken option the CONSTRUCTOR's explicit setAuth(token) sets
    // `_manuallySetToken`, which gates OFF every callback-driven refresh
    // path (`_setAuthSafely`, post-subscribe refresh) — this explicit
    // push is the ONLY way joined channels learn the rotated token.
    expect(setAuthSpy).toHaveBeenCalledWith('user-jwt-rotated')

    // The closure swap is real: the next REST request carries the new
    // bearer (no onAuthStateChange exists in a secondary — (c)).
    await client.from('cloud_cases').select('*')
    expect(lastRequestHeaders().get('Authorization')).toBe(
      'Bearer user-jwt-rotated'
    )
  })

  // Unnumbered rider on #117 (the client half of teardown; the
  // SecondaryRoot orchestration half lives in secondaryWindows.test.tsx):
  // teardown removes channels, disconnects realtime, discards the token,
  // and releases the getSupabase() holder — WITHOUT touching auth.*
  // (the throwing proxy would make any auth call a crash).
  it('teardown releases channels, realtime, token, and the client holder (rides #117)', async () => {
    const client = initSecondaryClient(
      CLOUD_URL,
      PUBLISHABLE_KEY,
      INITIAL_TOKEN
    )
    const removeAllSpy = vi
      .spyOn(client, 'removeAllChannels')
      .mockResolvedValue([])
    const disconnectSpy = vi
      .spyOn(client.realtime, 'disconnect')
      .mockResolvedValue('ok')

    await teardownSecondaryClient()

    expect(removeAllSpy).toHaveBeenCalled()
    expect(disconnectSpy).toHaveBeenCalled()
    expect(() => getSupabase()).toThrow(SupabaseNotInitializedError)
    // A late token push after teardown must be a no-op, never a crash.
    expect(() => {
      updateSecondaryToken('too-late')
    }).not.toThrow()
  })
})

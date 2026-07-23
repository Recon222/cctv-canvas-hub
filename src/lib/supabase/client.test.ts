/**
 * Lifecycle tests for the REAL client singleton — this file deliberately
 * does NOT `vi.mock('@/lib/supabase/client')`. Tauri IPC is mocked
 * globally (setup.ts), so the vault adapter resolves "no session"
 * everywhere and no network is touched.
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import {
  emitSessionToken,
  onSecondaryReady,
} from '@/lib/services/sessionEvents'
import {
  initSupabase,
  getSupabase,
  teardownSupabase,
  SupabaseNotInitializedError,
  ensureFreshSession,
} from './client'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resetVaultStorageBinding } from './vault-storage'

vi.mock('@/lib/services/sessionEvents', () => ({
  emitSessionToken: vi.fn(() => Promise.resolve()),
  onSecondaryReady: vi.fn(() =>
    Promise.resolve(() => {
      // mock unlisten
    })
  ),
}))

const CONFIG = {
  url: 'https://testref.supabase.co',
  publishable_key: 'sb_publishable_test',
  locked: false,
  signed_in_email: null,
}

afterEach(async () => {
  await teardownSupabase()
  resetVaultStorageBinding()
})

describe('supabase client lifecycle', () => {
  it('teardown nulls the singleton — getSupabase() then throws', async () => {
    initSupabase(CONFIG)
    expect(getSupabase()).toBeDefined()

    await teardownSupabase()

    expect(() => getSupabase()).toThrow(SupabaseNotInitializedError)
  })

  it('sign-out keeps the client usable — sign-out → sign-in needs no re-init', async () => {
    const client = initSupabase(CONFIG)

    // GoTrue clears its (absent) session; the singleton must survive so
    // the sign-in screen's submit can reach getSupabase() without a
    // full app restart.
    await client.auth.signOut()

    expect(getSupabase()).toBe(client)
  })

  it('teardown stops the abandoned client auto-refresh ticker', async () => {
    const client = initSupabase(CONFIG)
    const stopSpy = vi.spyOn(client.auth, 'stopAutoRefresh')

    await teardownSupabase()

    expect(stopSpy).toHaveBeenCalled()
  })
})

/** GoTrue's private notifier — drives the REAL onAuthStateChange
 * registration initSupabase wires (broadcast=false fires immediately). */
interface NotifyCapable {
  _notifyAllSubscribers(
    event: string,
    session: unknown,
    broadcast: boolean
  ): Promise<void>
}

describe('main-side session propagation (Phase 7.2C, R8 #138–139)', () => {
  beforeEach(() => {
    vi.mocked(emitSessionToken).mockClear()
  })

  // Test #138 — FLIPPED by the PR #10 review (H1): the original pin
  // ("SIGNED_IN pushes nothing") was a false-confidence pin locking in
  // the unlock-orphan defect. The push gate is the full session-rotation
  // class: TOKEN_REFRESHED (routine refresh), SIGNED_IN (the M6 unlock
  // re-auth mints a NEW session via signInWithPassword), USER_UPDATED.
  it('pushes session-token on the full rotation class (TOKEN_REFRESHED, SIGNED_IN, USER_UPDATED) — never on SIGNED_OUT', async () => {
    const client = initSupabase(CONFIG)
    const notify = client.auth as unknown as NotifyCapable

    for (const [event, token] of [
      ['TOKEN_REFRESHED', 'refreshed-jwt'],
      ['SIGNED_IN', 'post-unlock-jwt'],
      ['USER_UPDATED', 'updated-user-jwt'],
    ] as const) {
      vi.mocked(emitSessionToken).mockClear()
      await notify._notifyAllSubscribers(event, { access_token: token }, false)
      await vi.waitFor(() => {
        expect(emitSessionToken).toHaveBeenCalledWith({
          url: CONFIG.url,
          key: CONFIG.publishable_key,
          token,
        })
      })
    }

    // SIGNED_OUT still pushes nothing — and no eager revocation
    // detection is wired here (ledger D19: accepted posture; the honest
    // signed-out path is unchanged; session-ended is authService's).
    vi.mocked(emitSessionToken).mockClear()
    await notify._notifyAllSubscribers('SIGNED_OUT', null, false)
    expect(emitSessionToken).not.toHaveBeenCalled()
  })

  // Test #139
  it('replies to secondary-ready with the CURRENT token; a signed-out main stays silent', async () => {
    const client = initSupabase(CONFIG)

    // The reply listener is attached (once) by initSupabase.
    expect(onSecondaryReady).toHaveBeenCalled()
    const handler = vi.mocked(onSecondaryReady).mock.calls.at(-1)?.[0]
    if (handler === undefined) {
      throw new Error('no secondary-ready handler captured')
    }

    // Signed out (vault empty): NO reply — the secondary hits its boot
    // timeout honestly instead of receiving a dead token.
    handler({ view: 'map' })
    await new Promise(resolve => setTimeout(resolve, 0))
    expect(emitSessionToken).not.toHaveBeenCalled()

    // Signed in: the reply carries the current access token.
    vi.spyOn(client.auth, 'getSession').mockResolvedValue({
      data: { session: { access_token: 'live-jwt' } },
      error: null,
    } as unknown as Awaited<ReturnType<typeof client.auth.getSession>>)
    handler({ view: 'map' })
    await vi.waitFor(() => {
      expect(emitSessionToken).toHaveBeenCalledWith({
        url: CONFIG.url,
        key: CONFIG.publishable_key,
        token: 'live-jwt',
      })
    })
  })

  // Supporting arm on #138 (PR #10 H1 — the actual defect path): the
  // unlock flow is LockOverlay → reauthenticate → signInWithPassword —
  // a REAL GoTrue password grant (not a notifier shortcut) must result
  // in a session-token push carrying the NEWLY minted token, or every
  // open pop-out rides the orphaned old session to expiry.
  it('pushes the newly minted token when a real signInWithPassword re-auth lands (unlock path)', async () => {
    const client = initSupabase(CONFIG)
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              access_token: 'unlock-minted-jwt',
              token_type: 'bearer',
              expires_in: 3600,
              refresh_token: 'unlock-refresh',
              user: { id: 'uid-1', aud: 'authenticated', email: 'c@x.test' },
            }),
            { status: 200, headers: { 'content-type': 'application/json' } }
          )
        )
      )
    )
    try {
      // The same call reauthenticate() makes on unlock (authService).
      await client.auth.signInWithPassword({
        email: 'c@x.test',
        password: 'pw',
      })
      await vi.waitFor(() => {
        expect(emitSessionToken).toHaveBeenCalledWith({
          url: CONFIG.url,
          key: CONFIG.publishable_key,
          token: 'unlock-minted-jwt',
        })
      })
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('ensureFreshSession — wake-time freshness classification', () => {
  function fakeClient(getSession: () => Promise<unknown>): SupabaseClient {
    return {
      auth: {
        getSession,
        refreshSession: vi.fn(),
      },
      realtime: { setAuth: vi.fn() },
    } as unknown as SupabaseClient
  }

  // v1-final-sweep HIGH: a fully-expired token means getSession() itself
  // does the refresh internally and can return { session: null, error }.
  // A RETRYABLE (network/5xx/0/429) error there must NOT sign out — the
  // refresh token is still valid; recovery is the next wake/tick.
  it('defers on a retryable getSession error (expired token, network down)', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: { session: null }, error: { status: 0 } })
    )
    await expect(ensureFreshSession(client)).resolves.toBe('deferred')
    // Never reaches the explicit refresh — the getSession call already
    // attempted (and deferred) it.
    expect(client.auth.refreshSession).not.toHaveBeenCalled()
  })

  // A DEFINITE 4xx refusal at getSession is a genuinely dead session —
  // the honest signed-out path is correct here.
  it('fails on a definite non-retryable getSession error (dead session)', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: { session: null }, error: { status: 400 } })
    )
    await expect(ensureFreshSession(client)).resolves.toBe('failed')
  })

  // No error, no session (never signed in on this context) stays failed.
  it('fails when there is simply no session and no error', async () => {
    const client = fakeClient(() =>
      Promise.resolve({ data: { session: null }, error: null })
    )
    await expect(ensureFreshSession(client)).resolves.toBe('failed')
  })
})

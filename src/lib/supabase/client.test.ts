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
} from './client'
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

  // Test #138
  it('pushes session-token (url+key+token) on TOKEN_REFRESHED — and on nothing else', async () => {
    const client = initSupabase(CONFIG)
    const notify = client.auth as unknown as NotifyCapable

    await notify._notifyAllSubscribers(
      'TOKEN_REFRESHED',
      { access_token: 'rotated-jwt' },
      false
    )
    await vi.waitFor(() => {
      expect(emitSessionToken).toHaveBeenCalledWith({
        url: CONFIG.url,
        key: CONFIG.publishable_key,
        token: 'rotated-jwt',
      })
    })

    // TOKEN_REFRESHED ONLY — no other auth event pushes, and no eager
    // revocation detection is wired here (ledger D19: accepted posture;
    // the honest signed-out path is unchanged).
    vi.mocked(emitSessionToken).mockClear()
    await notify._notifyAllSubscribers(
      'SIGNED_IN',
      { access_token: 'fresh-sign-in' },
      false
    )
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
})

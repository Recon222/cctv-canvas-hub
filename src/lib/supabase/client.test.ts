/**
 * Lifecycle tests for the REAL client singleton — this file deliberately
 * does NOT `vi.mock('@/lib/supabase/client')`. Tauri IPC is mocked
 * globally (setup.ts), so the vault adapter resolves "no session"
 * everywhere and no network is touched.
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  initSupabase,
  getSupabase,
  teardownSupabase,
  SupabaseNotInitializedError,
} from './client'
import { resetVaultStorageBinding } from './vault-storage'

const CONFIG = {
  url: 'https://testref.supabase.co',
  publishable_key: 'sb_publishable_test',
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

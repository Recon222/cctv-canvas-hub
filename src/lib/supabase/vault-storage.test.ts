import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import { vaultStorage, resetVaultStorageBinding } from './vault-storage'

const mockCommands = vi.mocked(commands)

// The single storage key supabase-js uses today (password grant,
// detectSessionInUrl: false): `sb-{projectRef}-auth-token`.
const AUTH_KEY = 'sb-testref-auth-token'

beforeEach(() => {
  vi.clearAllMocks()
  resetVaultStorageBinding()
})

describe('vaultStorage', () => {
  // Test #12
  it('reads the vault through the storage adapter', async () => {
    mockCommands.vaultGet.mockResolvedValue({
      status: 'ok',
      data: '{"access_token":"decrypted-session"}',
    })

    const value = await vaultStorage.getItem(AUTH_KEY)

    expect(value).toBe('{"access_token":"decrypted-session"}')
    expect(mockCommands.vaultGet).toHaveBeenCalledTimes(1)
  })

  // Test #13 — write path + the single-key invariant
  it('writes the vault through the storage adapter (single-key invariant)', async () => {
    mockCommands.vaultSet.mockResolvedValue({ status: 'ok', data: null })
    const errorSpy = vi.spyOn(logger, 'error')

    // Live-verified GoTrue behavior: the transient PKCE code-verifier key
    // is touched FIRST (cleanup on init) — it must neither bind the vault
    // nor ever reach it. In-memory backing only.
    const VERIFIER_KEY = `${AUTH_KEY}-code-verifier`
    await expect(vaultStorage.getItem(VERIFIER_KEY)).resolves.toBeNull()
    await vaultStorage.setItem(VERIFIER_KEY, 'transient-verifier')
    await expect(vaultStorage.getItem(VERIFIER_KEY)).resolves.toBe(
      'transient-verifier'
    )
    await vaultStorage.removeItem(VERIFIER_KEY)
    await expect(vaultStorage.getItem(VERIFIER_KEY)).resolves.toBeNull()
    expect(mockCommands.vaultSet).not.toHaveBeenCalled()
    expect(mockCommands.vaultGet).not.toHaveBeenCalled()
    expect(mockCommands.vaultClear).not.toHaveBeenCalled()

    // The session key still binds and persists normally afterwards.
    await vaultStorage.setItem(AUTH_KEY, 'session-blob')
    expect(mockCommands.vaultSet).toHaveBeenCalledWith('session-blob')

    // A second distinct storage key must fail loudly (key name only —
    // never the value) instead of silently overwriting the single blob.
    await expect(
      vaultStorage.setItem('sb-testref-other-key', 'second-value')
    ).rejects.toThrow(/storage key/)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = JSON.stringify(errorSpy.mock.calls[0])
    expect(logged).toContain('sb-testref-other-key')
    expect(logged).not.toContain('second-value')

    // The offending value never reached the vault.
    expect(mockCommands.vaultSet).toHaveBeenCalledTimes(1)
  })

  // Test #14
  it('treats vault command failure as absent session, not a crash', async () => {
    mockCommands.vaultGet.mockResolvedValue({
      status: 'error',
      error: 'Failed to open session vault: vault authentication failed',
    })

    await expect(vaultStorage.getItem(AUTH_KEY)).resolves.toBeNull()
  })
})

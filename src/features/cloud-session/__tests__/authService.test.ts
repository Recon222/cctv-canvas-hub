import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commands } from '@/lib/tauri-bindings'
import { getSupabase, teardownSupabase } from '@/lib/supabase/client'
import { vaultStorage } from '@/lib/supabase/vault-storage'
import { emitSessionEnded } from '@/lib/services/sessionEvents'
import {
  signIn,
  signOut,
  restoreSession,
  checkSchemaGate,
} from '../services/authService'

// The single supabase-js seam.
vi.mock('@/lib/supabase/client')
vi.mock('@/lib/services/sessionEvents', () => ({
  emitSessionEnded: vi.fn(() => Promise.resolve()),
}))

const mockCommands = vi.mocked(commands)
const mockGetSupabase = vi.mocked(getSupabase)
const mockTeardownSupabase = vi.mocked(teardownSupabase)

const AUTH_KEY = 'sb-testref-auth-token'
const SESSION_JSON = JSON.stringify({
  access_token: 'jwt',
  refresh_token: 'refresh',
  user: { email: 'coord@example.test' },
})

/**
 * Minimal fake covering only the touched surfaces. Its
 * `signInWithPassword` mimics GoTrue's persistSession contract: on
 * success the session JSON goes through the storage adapter (the REAL
 * vault-storage module — so #15 proves the session lands in the vault).
 */
function fakeSupabase(overrides?: {
  signInError?: { message: string }
  session?: object | null
  appMetaRow?: { value: unknown } | null
  appMetaError?: { message: string }
}) {
  const fake = {
    auth: {
      signInWithPassword: vi.fn(async () => {
        if (overrides?.signInError) {
          return { data: { session: null }, error: overrides.signInError }
        }
        await vaultStorage.setItem(AUTH_KEY, SESSION_JSON)
        return { data: { session: { access_token: 'jwt' } }, error: null }
      }),
      getSession: vi.fn(() =>
        Promise.resolve({
          data: { session: overrides?.session ?? null },
          error: null,
        })
      ),
      signOut: vi.fn(() => Promise.resolve({ error: null })),
    },
    realtime: { setAuth: vi.fn(() => Promise.resolve()) },
    removeAllChannels: vi.fn(() => Promise.resolve([])),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() =>
            Promise.resolve({
              data: overrides?.appMetaRow ?? null,
              error: overrides?.appMetaError ?? null,
            })
          ),
        })),
      })),
    })),
  }
  return fake as unknown as ReturnType<typeof getSupabase>
}

beforeEach(() => {
  vi.clearAllMocks()
  mockCommands.vaultSet.mockResolvedValue({ status: 'ok', data: null })
  mockCommands.vaultClear.mockResolvedValue({ status: 'ok', data: null })
  mockCommands.loadCloudConfig.mockResolvedValue({ status: 'ok', data: null })
})

describe('authService', () => {
  // Test #15
  it('signs in and persists the session via the adapter', async () => {
    const fake = fakeSupabase()
    mockGetSupabase.mockReturnValue(fake)

    await signIn('coord@example.test', 'pw')

    expect(fake.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'coord@example.test',
      password: 'pw',
    })
    // The session JSON reached the vault through the storage adapter.
    expect(mockCommands.vaultSet).toHaveBeenCalledWith(SESSION_JSON)
  })

  // Test #16
  it('surfaces bad credentials as a typed sign-in failure', async () => {
    mockGetSupabase.mockReturnValue(
      fakeSupabase({ signInError: { message: 'Invalid login credentials' } })
    )

    await expect(signIn('coord@example.test', 'wrong')).rejects.toThrow(
      'Invalid login credentials'
    )
    // No session stored.
    expect(mockCommands.vaultSet).not.toHaveBeenCalled()
  })

  // Test #17
  it('passes the schema gate when schema_version == 1', async () => {
    mockGetSupabase.mockReturnValue(
      fakeSupabase({ appMetaRow: { value: { version: 1 } } })
    )

    await expect(checkSchemaGate()).resolves.toBe('ok')
  })

  // Test #18
  it('fails the schema gate on any other version', async () => {
    mockGetSupabase.mockReturnValue(
      fakeSupabase({ appMetaRow: { value: { version: 2 } } })
    )
    await expect(checkSchemaGate()).resolves.toBe('mismatch')

    // Missing row fails closed too.
    mockGetSupabase.mockReturnValue(fakeSupabase({ appMetaRow: null }))
    await expect(checkSchemaGate()).resolves.toBe('mismatch')
  })

  // Test #19
  it('clears the vault on sign-out but keeps the client singleton', async () => {
    const fake = fakeSupabase()
    mockGetSupabase.mockReturnValue(fake)

    await signOut()

    expect(fake.auth.signOut).toHaveBeenCalled()
    expect(mockCommands.vaultClear).toHaveBeenCalled()
    // D12: no realtime channel may linger on a revoked token.
    expect(fake.removeAllChannels).toHaveBeenCalled()
    // The singleton must survive sign-out so the next in-process sign-in
    // can reach getSupabase() — teardown is reserved for re-enrollment.
    expect(mockTeardownSupabase).not.toHaveBeenCalled()
  })

  // Test #140 (R8, sign-out half — the lock half lives in
  // session-store.test.ts): sign-out, and ONLY sign-out, terminates
  // every pop-out window (7.2B: `session-ended` never fires for a lock).
  it('emits session-ended exactly once on sign-out (R8 #140)', async () => {
    const fake = fakeSupabase()
    mockGetSupabase.mockReturnValue(fake)

    await signOut()

    expect(emitSessionEnded).toHaveBeenCalledTimes(1)
  })

  it('continues sign-out when channel teardown and cloud sign-out both fail', async () => {
    // Adversarial: the continue-on-failure contract is security-adjacent
    // — if the try/catch were tightened away, a network failure would
    // abort sign-out BEFORE the credential clear (review MEDIUM test
    // gap #5).
    const fake = fakeSupabase()
    const raw = fake as unknown as {
      removeAllChannels: () => Promise<unknown>
      auth: { signOut: () => Promise<unknown> }
    }
    raw.removeAllChannels = vi.fn(() =>
      Promise.reject(new Error('socket already gone'))
    )
    raw.auth.signOut = vi.fn(() => Promise.reject(new Error('network down')))
    mockGetSupabase.mockReturnValue(fake)

    await expect(signOut()).resolves.toBeUndefined()
    // The vault is cleared no matter what the cloud said.
    expect(mockCommands.vaultClear).toHaveBeenCalled()
  })

  it('reports whether a session is restorable', async () => {
    mockGetSupabase.mockReturnValue(
      fakeSupabase({ session: { access_token: 'jwt' } })
    )
    await expect(restoreSession()).resolves.toBe(true)

    mockGetSupabase.mockReturnValue(fakeSupabase({ session: null }))
    await expect(restoreSession()).resolves.toBe(false)
  })
})

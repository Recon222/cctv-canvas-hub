import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commands } from '@/lib/tauri-bindings'
import { createProbeClient } from '@/lib/supabase/client'
import {
  loadConfig,
  saveConfig,
  parseEnrollmentPayload,
  probeProject,
  EnrollmentPayloadError,
  ProbeRejectedError,
  ProbeUnreachableError,
} from '../services/configService'

// The single supabase-js seam (test-spec framing): the probe runs BEFORE
// initSupabase, so it goes through createProbeClient, not getSupabase().
vi.mock('@/lib/supabase/client')

const mockCommands = vi.mocked(commands)
const mockCreateProbeClient = vi.mocked(createProbeClient)

/** Minimal fake covering only the touched surface: from().select().limit() */
function fakeProbeClient(outcome: {
  resolves?: { error: { message: string; code: string } | null; status: number }
  rejects?: Error
}) {
  const limit = vi.fn(() =>
    outcome.rejects
      ? Promise.reject(outcome.rejects)
      : Promise.resolve({ data: [], ...outcome.resolves })
  )
  return {
    from: vi.fn(() => ({ select: vi.fn(() => ({ limit })) })),
  } as unknown as ReturnType<typeof createProbeClient>
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('configService', () => {
  // Test #7
  it('returns null config when the backend has none', async () => {
    mockCommands.loadCloudConfig.mockResolvedValue({
      status: 'ok',
      data: null,
    })

    await expect(loadConfig()).resolves.toBeNull()
  })

  // Test #8
  it('round-trips save → load of a CloudConfig', async () => {
    const config = {
      url: 'https://testref.supabase.co',
      publishable_key: 'sb_publishable_test',
      locked: false,
      signed_in_email: 'coord@example.test',
    }
    mockCommands.saveCloudConfig.mockResolvedValue({
      status: 'ok',
      data: null,
    })
    mockCommands.loadCloudConfig.mockResolvedValue({
      status: 'ok',
      data: config,
    })

    await saveConfig(config)
    expect(mockCommands.saveCloudConfig).toHaveBeenCalledWith(config)

    await expect(loadConfig()).resolves.toEqual(config)
  })

  // Test #9
  it('parses a valid v1 enrollment payload', () => {
    const raw = JSON.stringify({
      v: 1,
      url: 'https://testref.supabase.co',
      key: 'sb_publishable_test',
    })

    expect(parseEnrollmentPayload(raw)).toEqual({
      url: 'https://testref.supabase.co',
      key: 'sb_publishable_test',
    })
  })

  // Test #10
  it('rejects malformed enrollment payloads', () => {
    // bad JSON
    expect(() => parseEnrollmentPayload('not json {')).toThrow(
      EnrollmentPayloadError
    )
    // wrong shape
    expect(() => parseEnrollmentPayload('{}')).toThrow(EnrollmentPayloadError)
    expect(() => parseEnrollmentPayload('"just a string"')).toThrow(
      EnrollmentPayloadError
    )
    expect(() =>
      parseEnrollmentPayload(
        JSON.stringify({ v: 1, url: 'not-https', key: 'k' })
      )
    ).toThrow(EnrollmentPayloadError)
    expect(() =>
      parseEnrollmentPayload(
        JSON.stringify({ v: 1, url: 'https://x.supabase.co' })
      )
    ).toThrow(EnrollmentPayloadError)
    // v ≠ 1
    expect(() =>
      parseEnrollmentPayload(
        JSON.stringify({ v: 2, url: 'https://x.supabase.co', key: 'k' })
      )
    ).toThrow(EnrollmentPayloadError)
  })

  // Test #11
  it('surfaces probe rejection distinctly from unreachable', async () => {
    // PostgREST error (HTTP reached the project, key refused) ⇒ rejected
    mockCreateProbeClient.mockReturnValue(
      fakeProbeClient({
        resolves: {
          error: { message: 'Invalid API key', code: 'PGRST301' },
          status: 401,
        },
      })
    )
    await expect(
      probeProject('https://x.supabase.co', 'bad-key')
    ).rejects.toBeInstanceOf(ProbeRejectedError)
    expect(mockCreateProbeClient).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'bad-key'
    )

    // Resolved { error, status: 0 } ⇒ unreachable — the shape installed
    // postgrest-js actually produces on network failure (it resolves fetch
    // failures rather than rejecting), so this is the path real users hit.
    mockCreateProbeClient.mockReturnValue(
      fakeProbeClient({
        resolves: {
          error: { message: 'TypeError: Failed to fetch', code: '' },
          status: 0,
        },
      })
    )
    await expect(
      probeProject('https://down.supabase.co', 'key')
    ).rejects.toBeInstanceOf(ProbeUnreachableError)

    // Network throw (query machinery itself rejects) ⇒ unreachable too
    mockCreateProbeClient.mockReturnValue(
      fakeProbeClient({ rejects: new TypeError('fetch failed') })
    )
    await expect(
      probeProject('https://down.supabase.co', 'key')
    ).rejects.toBeInstanceOf(ProbeUnreachableError)

    // Success = "no error" — RLS filters the anonymous read to EMPTY
    mockCreateProbeClient.mockReturnValue(
      fakeProbeClient({ resolves: { error: null, status: 200 } })
    )
    await expect(
      probeProject('https://x.supabase.co', 'good-key')
    ).resolves.toBeUndefined()
  })
})

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSupabase } from '@/lib/supabase/client'
import { SIGNED_URL_KEY_PREFIX } from '@/store/health-store'
import {
  createSignedUrl,
  isInlineRenderable,
  SIGNED_URL_TTL_S,
  SIGNED_URL_REFRESH_MS,
} from '../services/mediaService'
import { useSignedUrl } from '../hooks/useSignedUrl'

// The single supabase-js seam (test spec preamble) — the fake covers
// `storage.from().createSignedUrl`.
vi.mock('@/lib/supabase/client')

const mockGetSupabase = vi.mocked(getSupabase)

interface SignResult {
  data: { signedUrl: string } | null
  error: { message: string } | null
}

function installStorage(result: SignResult) {
  const sign = vi.fn().mockResolvedValue(result)
  const from = vi.fn(() => ({ createSignedUrl: sign }))
  mockGetSupabase.mockReturnValue({
    storage: { from },
  } as unknown as ReturnType<typeof getSupabase>)
  return { from, sign }
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(
      QueryClientProvider,
      { client: queryClient },
      children
    )
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('mediaService', () => {
  // Test #77
  it('creates a signed URL for a bucket/path with the pinned TTL', async () => {
    const { from, sign } = installStorage({
      data: { signedUrl: 'https://cloud.example/sign/abc' },
      error: null,
    })

    const url = await createSignedUrl('images', 'u1/c1/l1/camera-01.jpg')

    expect(from).toHaveBeenCalledWith('images')
    expect(sign).toHaveBeenCalledWith(
      'u1/c1/l1/camera-01.jpg',
      SIGNED_URL_TTL_S
    )
    expect(url).toBe('https://cloud.example/sign/abc')
  })

  it('throws on a signing failure without leaking a URL', async () => {
    installStorage({ data: null, error: { message: 'object not found' } })

    await expect(createSignedUrl('images', 'u1/c1/l1/x.jpg')).rejects.toThrow(
      'object not found'
    )
  })

  // Test #79
  it('classifies renderable vs non-renderable mimes', () => {
    // The §5.5.5 inline set, exactly.
    expect(isInlineRenderable('image/jpeg')).toBe(true)
    expect(isInlineRenderable('image/png')).toBe(true)
    expect(isInlineRenderable('image/webp')).toBe(true)
    expect(isInlineRenderable('video/mp4')).toBe(true)
    // HEIC / QuickTime ⇒ placeholder + open-externally (spec §3/§5).
    expect(isInlineRenderable('image/heic')).toBe(false)
    expect(isInlineRenderable('video/quicktime')).toBe(false)
    expect(isInlineRenderable('')).toBe(false)
  })
})

describe('useSignedUrl', () => {
  // Test #78
  it('proactively re-signs a continuously-mounted thumbnail before TTL', async () => {
    vi.useFakeTimers()
    const { sign } = installStorage({
      data: { signedUrl: 'https://cloud.example/sign/first' },
      error: null,
    })
    const queryClient = makeQueryClient()

    const first = renderHook(() => useSignedUrl('images', 'u1/c1/l1/a.jpg'), {
      wrapper: wrapperFor(queryClient),
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(sign).toHaveBeenCalledTimes(1)
    expect(first.result.current.data).toBe('https://cloud.example/sign/first')
    // The key is built from the health-store prefix — deliberately NOT a
    // CASE_DATA_KEY_FAMILIES member, so reconnect catch-up skips it (AD11).
    expect(
      queryClient.getQueryData([
        SIGNED_URL_KEY_PREFIX,
        'images',
        'u1/c1/l1/a.jpg',
      ])
    ).toBe('https://cloud.example/sign/first')

    // A second render within staleTime hits the cache — no extra signing.
    const second = renderHook(() => useSignedUrl('images', 'u1/c1/l1/a.jpg'), {
      wrapper: wrapperFor(queryClient),
    })
    expect(second.result.current.data).toBe('https://cloud.example/sign/first')
    expect(sign).toHaveBeenCalledTimes(1)

    // Proves the interval alone re-signs — no focus event, no reconnect
    // involved. (PR #7 L3: jsdom is always VISIBLE, so this cannot
    // distinguish focus-independent from pauses-when-hidden — v5 gates
    // intervals on visibility; the hidden-past-TTL edge is backstopped
    // by the onError re-sign and can't arise on a wall deployment.)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(SIGNED_URL_REFRESH_MS + 1_000)
    })
    expect(sign.mock.calls.length).toBeGreaterThanOrEqual(2)

    // Tripwire: the refresh interval must stay inside the URL's lifetime.
    expect(SIGNED_URL_REFRESH_MS).toBeLessThan(SIGNED_URL_TTL_S * 1_000)
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSupabase } from '@/lib/supabase/client'
import {
  createSignedUrl,
  isInlineRenderable,
  SIGNED_URL_TTL_S,
} from '../services/mediaService'

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

beforeEach(() => {
  vi.clearAllMocks()
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

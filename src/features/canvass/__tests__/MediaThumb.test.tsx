import { screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { createSignedUrl, openMediaExternally } from '../services/mediaService'
import { SignedMediaThumb } from '../components/MediaThumb'
import { toCanvassMedia } from '../services/mappers'
import type { CanvassMedia, MediaRow } from '../types'
import { mediaRow } from './fixtures'

// Component tests mock the service layer (testing.md convention) — spy
// mode so `isInlineRenderable` stays REAL: deriving `renderable` from
// the mime is exactly the host behavior under test; the two IO calls
// get per-test mock implementations.
vi.mock('../services/mediaService', { spy: true })
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

function media(overrides: Partial<MediaRow> = {}): CanvassMedia {
  const mapped = toCanvassMedia(mediaRow(overrides))
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('SignedMediaThumb', () => {
  // Test #80
  it('renders an image thumb with the signed URL for renderable images', async () => {
    vi.mocked(createSignedUrl).mockResolvedValue('https://signed.example/a')

    renderWithFeatureProviders(<SignedMediaThumb media={media()} />)

    const img = await screen.findByRole('img', { name: 'camera-01.jpg' })
    expect(img).toHaveAttribute('src', 'https://signed.example/a')
    expect(createSignedUrl).toHaveBeenCalledWith(
      'images',
      media().path // {userId}/{caseId}/{locationId}/{filename}
    )
  })

  // Test #81
  it('renders the fallback tile for HEIC — never a broken img', async () => {
    const user = userEvent.setup()
    vi.mocked(openMediaExternally).mockResolvedValue(undefined)
    const heic = media({ filename: 'photo.heic', mime_type: 'image/heic' })

    renderWithFeatureProviders(<SignedMediaThumb media={heic} />)

    // Designed placeholder, not an <img> pointed at undisplayable bytes.
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    const tile = screen.getByTitle('Open photo.heic externally')
    expect(tile).toHaveTextContent('HEIC')
    // No display query for a non-renderable row — signing happens on
    // demand when the operator opens it externally.
    expect(createSignedUrl).not.toHaveBeenCalled()

    await user.click(tile)
    expect(openMediaExternally).toHaveBeenCalledWith('images', heic.path)
  })

  it('toasts when open-externally fails, and never renders a dead end', async () => {
    const user = userEvent.setup()
    vi.mocked(openMediaExternally).mockRejectedValue(new Error('no handler'))
    const heic = media({ filename: 'photo.heic', mime_type: 'image/heic' })

    renderWithFeatureProviders(<SignedMediaThumb media={heic} />)

    await user.click(screen.getByTitle('Open photo.heic externally'))
    await waitFor(() => {
      expect(vi.mocked(toast.error)).toHaveBeenCalledWith(
        'Could not open the file externally'
      )
    })
    // The tile stays interactive for another attempt.
    expect(screen.getByTitle('Open photo.heic externally')).toBeEnabled()
  })

  // 4.1 error-handling pin (unnumbered regression arm): one automatic
  // re-sign on <img> error, then the fallback tile with manual retry.
  it('self-heals an expired URL once, then falls back with manual retry', async () => {
    const user = userEvent.setup()
    vi.mocked(createSignedUrl)
      .mockResolvedValueOnce('https://signed.example/expired')
      .mockResolvedValueOnce('https://signed.example/fresh')
      .mockResolvedValue('https://signed.example/manual')

    renderWithFeatureProviders(<SignedMediaThumb media={media()} />)
    const img = await screen.findByRole('img')
    expect(img).toHaveAttribute('src', 'https://signed.example/expired')

    // First error: ONE automatic invalidation re-signs the specific query.
    fireEvent.error(img)
    const healed = await screen.findByRole('img')
    await waitFor(() => {
      expect(healed).toHaveAttribute('src', 'https://signed.example/fresh')
    })
    expect(createSignedUrl).toHaveBeenCalledTimes(2)

    // Second error: no more auto re-signs — the designed fallback tile.
    fireEvent.error(healed)
    const retryTile = await screen.findByTitle('Retry loading this file')
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
    expect(createSignedUrl).toHaveBeenCalledTimes(2)

    // Manual retry re-signs and restores the thumb.
    await user.click(retryTile)
    const restored = await screen.findByRole('img')
    await waitFor(() => {
      expect(restored).toHaveAttribute('src', 'https://signed.example/manual')
    })
    expect(createSignedUrl).toHaveBeenCalledTimes(3)
  })

  it('shows the fallback with retry when signing itself fails', async () => {
    vi.mocked(createSignedUrl).mockRejectedValue(new Error('storage down'))

    renderWithFeatureProviders(<SignedMediaThumb media={media()} />)

    expect(
      await screen.findByTitle('Retry loading this file')
    ).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})

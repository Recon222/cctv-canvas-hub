import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { VideoPlayer } from '../components/VideoPlayer'
import { toCanvassMedia } from '../services/mappers'
import type { CanvassMedia } from '../types'
import { mediaRow } from './fixtures'

function videoMedia(): CanvassMedia {
  const mapped = toCanvassMedia(
    mediaRow({
      id: 'm-video',
      type: 'video',
      filename: 'dvr-export.mp4',
      mime_type: 'video/mp4',
      storage_bucket: 'video',
    })
  )
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
}

describe('VideoPlayer', () => {
  // Test #86
  it('renders video on demand with no preload and no autoplay', () => {
    renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl="https://signed.example/v.mp4"
        contextLabel="QUICKMART CONVENIENCE · 17600 YONGE ST"
        onClose={vi.fn()}
      />
    )

    const video = document.querySelector('video')
    expect(video).not.toBeNull()
    // Bandwidth honesty, pinned: nothing loads until the operator
    // presses play, and playback NEVER starts itself.
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).not.toHaveAttribute('autoplay')
    expect(video).toHaveAttribute('controls')
    expect(video).toHaveAttribute('src', 'https://signed.example/v.mp4')
    expect(screen.getByText('dvr-export.mp4')).toBeInTheDocument()
  })

  // Test #87
  it('swaps to the fallback panel on player error — never a black player', async () => {
    const user = userEvent.setup()
    const onOpenExternally = vi.fn()
    renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl="https://signed.example/v.mp4"
        contextLabel="QUICKMART"
        onClose={vi.fn()}
        onOpenExternally={onOpenExternally}
      />
    )

    const video = document.querySelector('video')
    if (video === null) {
      throw new Error('video element missing')
    }
    fireEvent.error(video)

    // The designed fallback panel, player unmounted.
    expect(screen.getByText("This video can't play here")).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
    await user.click(screen.getByText('Open externally'))
    expect(onOpenExternally).toHaveBeenCalledTimes(1)
  })

  // PR #7 H1: a failed SIGNING query must not read as loading forever —
  // the escape hatch has to be reachable without a <video> ever mounting.
  it('surfaces a sign failure honestly with the open-externally escape hatch', async () => {
    const user = userEvent.setup()
    const onOpenExternally = vi.fn()
    renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl={null}
        signFailed
        contextLabel="QUICKMART"
        onClose={vi.fn()}
        onOpenExternally={onOpenExternally}
      />
    )

    // Honest failure copy — never the "Preparing video…" lie.
    expect(
      screen.getByText('The video could not be loaded from the cloud')
    ).toBeInTheDocument()
    expect(screen.queryByText('Preparing video…')).not.toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
    // Open-externally signs its own fresh URL on click — the recovery path.
    await user.click(screen.getByText('Open externally'))
    expect(onOpenExternally).toHaveBeenCalledTimes(1)
  })

  it('shows the loading panel while the URL resolves, not a black player', () => {
    renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl={null}
        contextLabel="QUICKMART"
        onClose={vi.fn()}
      />
    )

    expect(screen.getByText('Preparing video…')).toBeInTheDocument()
    expect(document.querySelector('video')).toBeNull()
  })

  // M4 live-smoke F2: focus inside the native <video> transport (shadow
  // DOM) stops keydowns from reaching the dialog's handler — Esc must
  // close from ANYWHERE while the modal lives, and stop the moment it
  // unmounts.
  it('closes on Escape even when focus is outside the dialog', () => {
    const onClose = vi.fn()
    const { unmount } = renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl="https://signed.example/v.mp4"
        contextLabel="QUICKMART"
        onClose={onClose}
      />
    )

    // Focus anywhere but the dialog — the live repro's shape.
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    // Listener lives and dies with the modal.
    unmount()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('takes focus on mount so Escape closes without a prior click', () => {
    const onClose = vi.fn()
    renderWithFeatureProviders(
      <VideoPlayer
        media={videoMedia()}
        signedUrl="https://signed.example/v.mp4"
        contextLabel="QUICKMART"
        onClose={onClose}
      />
    )

    const dialog = screen.getByRole('dialog')
    // A modal on a wall board must own the keyboard the moment it opens.
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

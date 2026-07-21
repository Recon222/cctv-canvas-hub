import { useState } from 'react'
import { screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { ImageViewer } from '../components/ImageViewer'
import { toCanvassMedia } from '../services/mappers'
import type { CanvassMedia } from '../types'
import { mediaRow } from './fixtures'

function photo(id: string, filename: string): CanvassMedia {
  const mapped = toCanvassMedia(mediaRow({ id, filename }))
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
}

const PHOTOS = [
  photo('m-1', 'front-door.jpg'),
  photo('m-2', 'register.jpg'),
  photo('m-3', 'parking-lot.jpg'),
]

/** Controlled host mirroring the real wiring: the viewer is dumb, the
 * host owns index state and answers onNavigate. */
function ViewerHost({ onClose = vi.fn() }: { onClose?: () => void }) {
  const [index, setIndex] = useState(0)
  return (
    <ImageViewer
      media={PHOTOS}
      index={index}
      signedUrl={`https://signed.example/${PHOTOS[index]?.id ?? ''}`}
      contextLabel="QUICKMART CONVENIENCE · 17600 YONGE ST"
      metaLabel="Taken 2026-07-17 14:00:00 · Det. A. Morgan"
      onClose={onClose}
      onNavigate={setIndex}
    />
  )
}

describe('ImageViewer', () => {
  // Test #126
  it("wraps through a location's photos with ‹ › and the n-of-N counter", async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(<ViewerHost />)

    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    expect(screen.getByRole('img')).toHaveAttribute(
      'src',
      'https://signed.example/m-1'
    )

    // ‹ from photo 1 lands on photo N…
    await user.click(screen.getByRole('button', { name: 'Previous photo' }))
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    expect(screen.getByText('parking-lot.jpg')).toBeInTheDocument()

    // …and › from N lands back on 1 (wrap-through, both directions).
    await user.click(screen.getByRole('button', { name: 'Next photo' }))
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
    expect(screen.getByText('front-door.jpg')).toBeInTheDocument()

    // Arrow keys drive the same wrap math.
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowLeft' })
    expect(screen.getByText('Photo 3 of 3')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowRight' })
    expect(screen.getByText('Photo 1 of 3')).toBeInTheDocument()
  })

  it('hides the ‹ › navigation for a single photo', () => {
    renderWithFeatureProviders(
      <ImageViewer
        media={[photo('m-1', 'front-door.jpg')]}
        index={0}
        signedUrl="https://signed.example/m-1"
        contextLabel="QUICKMART"
        metaLabel="Taken 2026-07-17 14:00:00 · Det. A. Morgan"
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />
    )

    expect(screen.getByText('Photo 1 of 1')).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Previous photo' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Next photo' })
    ).not.toBeInTheDocument()
  })

  // M4 live-smoke F2 parity: the viewer's Esc also lived only on the
  // dialog div — same vulnerability once focus leaves the dialog.
  it('closes on Escape even when focus is outside the dialog', () => {
    const onClose = vi.fn()
    const { unmount } = renderWithFeatureProviders(
      <ViewerHost onClose={onClose} />
    )

    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)

    unmount()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('takes focus on mount so Esc and arrows work without a prior click', () => {
    const onClose = vi.fn()
    renderWithFeatureProviders(<ViewerHost onClose={onClose} />)

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveFocus()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

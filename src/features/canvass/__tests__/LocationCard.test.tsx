import {
  render,
  screen,
  act,
  within,
  fireEvent,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import i18n from '@/i18n/config'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { useSessionStore } from '@/features/cloud-session'
import { LocationCard } from '../components/LocationCard'
import { LocationCardStack } from '../components/LocationCardStack'
import { fetchLocations, fetchMedia } from '../services/canvassService'
import { createSignedUrl } from '../services/mediaService'
import { toCanvassLocation, toCanvassMedia } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type {
  CanvassLocation,
  CanvassMedia,
  LocationRow,
  MediaRow,
} from '../types'
import { locationRow, mediaRow, SEED_CASE_ID } from './fixtures'

// Component tests mock the service layer (testing.md convention).
vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(() => Promise.resolve([])),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchLocationCounts: vi.fn(() => Promise.resolve({})),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
// Spy mode keeps `isInlineRenderable` real (the strip derives
// renderability from the mime); signing gets per-test implementations.
vi.mock('../services/mediaService', { spy: true })
// The realtime seam under CanvassRoot consumers never runs here, but the
// client module must not be touched by accident either.
vi.mock('@/lib/supabase/client')

function mapped(row: LocationRow): CanvassLocation {
  const location = toCanvassLocation(row)
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

function mappedMedia(row: MediaRow): CanvassMedia {
  const media = toCanvassMedia(row)
  if (media === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return media
}

beforeEach(() => {
  resetCanvassStore()
  useSessionStore.setState({ state: 'active' })
})

describe('LocationCard', () => {
  // Test #57
  it('renders card fields from the view-model', () => {
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    expect(screen.getAllByText('QuickMart Convenience').length).toBeGreaterThan(
      0
    )
    expect(
      screen.getByText('17600 Yonge St, Newmarket, ON')
    ).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Det. A. Morgan')).toBeInTheDocument()
    expect(screen.getByText(/Arrived/)).toBeInTheDocument()
    // A row without GPS shows its designed chip instead of a marker.
    renderWithFeatureProviders(
      <LocationCard
        location={mapped(locationRow({ id: 'l-nofix', location: null }))}
      />
    )
    expect(screen.getByText('No GPS fix')).toBeInTheDocument()
  })

  // Test #58
  it('renders DVR credentials plainly, always — in every session state', () => {
    const { container, rerender } = renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('QuickM@rt2024')).toBeInTheDocument()
    const unlockedText = container.textContent

    // Locking the session alters NOTHING on the card (AD6 + owner
    // directive: credentials are ordinary strings; lock changes no content).
    act(() => {
      useSessionStore.setState({ state: 'locked' })
    })
    rerender(<LocationCard location={mapped(locationRow())} />)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('QuickM@rt2024')).toBeInTheDocument()
    expect(container.textContent).toBe(unlockedText)
  })

  it('is selectable from the keyboard and visible to assistive tech', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    // The card is a reachable, labelled control — not a mouse-only
    // <article> (review MEDIUM: primary interaction was keyboard-dead).
    // D16 (resolved 3.4A): the accurate model is single-select —
    // role="option" + aria-selected under the stack's listbox; still no
    // aria-pressed (selection is set-only, fix-delta review LOW).
    const card = screen.getByRole('option', {
      name: /QuickMart Convenience/,
    })
    expect(card).not.toHaveAttribute('aria-pressed')
    expect(card).toHaveAttribute('aria-selected', 'false')

    await user.tab()
    expect(card).toHaveFocus()
    await user.keyboard('{Enter}')
    expect(useCanvassStore.getState().selectedLocationId).toBe(locationRow().id)
    expect(card).toHaveAttribute('aria-selected', 'true')

    act(() => {
      useCanvassStore.getState().selectLocation(null)
    })
    expect(useCanvassStore.getState().selectedLocationId).toBeNull()
    await user.keyboard(' ')
    expect(useCanvassStore.getState().selectedLocationId).toBe(locationRow().id)
  })

  // Test #59
  it('reflects status with distinct styling per state', () => {
    renderWithFeatureProviders(
      <div>
        <LocationCard
          location={mapped(locationRow({ id: 'l-s', status: 'started' }))}
        />
        <LocationCard
          location={mapped(locationRow({ id: 'l-w', status: 'working' }))}
        />
        <LocationCard
          location={mapped(locationRow({ id: 'l-c', status: 'complete' }))}
        />
      </div>
    )

    const started = screen.getByText('Started').className
    const working = screen.getByText('Working').className
    const complete = screen.getByText('Complete').className
    expect(started).not.toBe(working)
    expect(working).not.toBe(complete)
    expect(started).not.toBe(complete)
  })

  // Test #60
  it('renders designed empty states, never a blank screen', async () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })

    renderWithFeatureProviders(<LocationCardStack />)

    expect(await screen.findByText('No locations yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Locations appear as investigators add them to this case.'
      )
    ).toBeInTheDocument()
  })

  it('renders an unmodeled status in a visible catch-all group, never dropped', async () => {
    // Drift posture: the union is closed, but a wire status it doesn't
    // model must not silently vanish from the fixed group order
    // (fix-delta review LOW: STATUS_ORDER rendered it nowhere).
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })
    const drifted = {
      ...mapped(locationRow({ id: 'l-drift', location_name: 'Drifted spot' })),
      status: 'cancelled' as CanvassLocation['status'],
    }
    vi.mocked(fetchLocations).mockResolvedValue([
      mapped(locationRow()),
      drifted,
    ])

    renderWithFeatureProviders(<LocationCardStack />)

    // The known group still renders; the drifted card lands under the
    // catch-all heading with its raw status, not an i18n key.
    expect(await screen.findByText(/Other/)).toBeInTheDocument()
    expect(screen.getByText('Drifted spot')).toBeInTheDocument()
    expect(screen.getByText('cancelled')).toBeInTheDocument()
    expect(screen.queryByText(/canvass\.status\./)).not.toBeInTheDocument()
    expect(screen.getAllByText('QuickMart Convenience').length).toBeGreaterThan(
      0
    )
  })

  it('keeps rendering cached cards when a background reconcile fails', async () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })
    vi.mocked(fetchLocations).mockResolvedValue([mapped(locationRow())])

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <LocationCardStack />
        </I18nextProvider>
      </QueryClientProvider>
    )
    expect(
      (await screen.findAllByText('QuickMart Convenience')).length
    ).toBeGreaterThan(0)

    vi.mocked(fetchLocations).mockRejectedValue(new Error('reconcile failed'))
    await act(async () => {
      await queryClient.refetchQueries()
    })

    // Stale-visible beats blank: one transient failure must not blank an
    // otherwise-working wall board (review product call).
    expect(screen.getAllByText('QuickMart Convenience').length).toBeGreaterThan(
      0
    )
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('LocationCard media strip (4.3B)', () => {
  // Distinct storage paths per row — the signed-url query is keyed on
  // [prefix, bucket, path], and the real rows never share a path.
  const path = (filename: string) =>
    `u1/${SEED_CASE_ID}/${locationRow().id}/${filename}`
  const stripMedia = () => [
    mappedMedia(
      mediaRow({
        id: 'p1',
        filename: 'front-door.jpg',
        storage_path: path('front-door.jpg'),
      })
    ),
    mappedMedia(
      mediaRow({
        id: 'p2',
        filename: 'register.png',
        mime_type: 'image/png',
        storage_path: path('register.png'),
      })
    ),
    mappedMedia(
      mediaRow({
        id: 'v1',
        type: 'video',
        filename: 'clip.mp4',
        mime_type: 'video/mp4',
        storage_bucket: 'video',
        storage_path: path('clip.mp4'),
      })
    ),
    mappedMedia(
      mediaRow({
        id: 'a1',
        type: 'audio',
        filename: 'note.m4a',
        mime_type: 'audio/mp4',
        storage_bucket: 'audio',
        storage_path: path('note.m4a'),
      })
    ),
    // Another location's row must never surface on this card.
    mappedMedia(
      mediaRow({
        id: 'other-loc',
        filename: 'elsewhere.jpg',
        location_id: 'someone-elses-location',
      })
    ),
  ]

  beforeEach(() => {
    vi.mocked(fetchMedia).mockResolvedValue(stripMedia())
    vi.mocked(createSignedUrl).mockResolvedValue('https://signed.example/t')
  })

  // Test #88
  it('shows media count badges on the card — image/video/audio per location', async () => {
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    expect(
      await screen.findByText('2 photos · 1 video · 1 audio file')
    ).toBeInTheDocument()
    // Scoped to THIS location — the stray row renders nowhere.
    expect(screen.queryByTitle('View elsewhere.jpg')).not.toBeInTheDocument()
    // Image thumbs inline + the video tile.
    expect(await screen.findByTitle('View front-door.jpg')).toBeInTheDocument()
    expect(screen.getByTitle('View register.png')).toBeInTheDocument()
    expect(screen.getByTitle('Play video (on demand)')).toBeInTheDocument()
  })

  it('expands a photo thumb into the ImageViewer at that photo, without selecting the card', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    await user.click(await screen.findByTitle('View register.png'))

    const dialog = await screen.findByRole('dialog')
    // Opened AT the clicked photo — second of the two renderable photos.
    expect(within(dialog).getByText('Photo 2 of 2')).toBeInTheDocument()
    expect(within(dialog).getByText('register.png')).toBeInTheDocument()
    // Host-formatted labels: eyebrow context + rule-6 meta (absolute
    // timestamp with seconds + explicit date, AD8 investigator).
    expect(
      within(dialog).getByText(/QuickMart Convenience · 17600 Yonge St/)
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(
        /Taken 2026-07-17 \d{2}:\d{2}:\d{2} · Det\. A\. Morgan/
      )
    ).toBeInTheDocument()
    // Media interactions never double as card selection (fly-to).
    expect(useCanvassStore.getState().selectedLocationId).toBeNull()

    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('expands the video tile into the on-demand VideoPlayer', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    await user.click(await screen.findByTitle('Play video (on demand)'))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('clip.mp4')).toBeInTheDocument()
    // The player host signs the video object on demand.
    await waitFor(() => {
      expect(dialog.querySelector('video')).not.toBeNull()
    })
    const video = dialog.querySelector('video')
    if (video === null) {
      throw new Error('video element missing')
    }
    expect(video).toHaveAttribute('preload', 'none')
    expect(video).toHaveAttribute('src', 'https://signed.example/t')
    expect(createSignedUrl).toHaveBeenCalledWith('video', stripMedia()[2]?.path)
    expect(useCanvassStore.getState().selectedLocationId).toBeNull()
  })

  // PR #7 H1: both modal hosts must surface a failed sign query — a
  // storage blip on modal open previously stranded the player on
  // "Preparing video…" with the escape hatch structurally unreachable.
  it('shows the honest failed panel when the player sign query fails', async () => {
    const user = userEvent.setup()
    // The video tile renders without a URL, so the player is reachable
    // even while signing is down — exactly the stranding scenario.
    vi.mocked(createSignedUrl).mockRejectedValue(new Error('storage 503'))

    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    await user.click(await screen.findByTitle('Play video (on demand)'))
    const dialog = await screen.findByRole('dialog')
    expect(
      await within(dialog).findByText(
        'The video could not be loaded from the cloud'
      )
    ).toBeInTheDocument()
    expect(
      within(dialog).queryByText('Preparing video…')
    ).not.toBeInTheDocument()
    // The escape hatch is reachable with no <video> ever mounted.
    expect(within(dialog).getByText('Open externally')).toBeInTheDocument()
    expect(dialog.querySelector('video')).toBeNull()
  })

  it('shows the honest failed state when paging to a photo whose signing fails', async () => {
    const user = userEvent.setup()
    // First photo signs fine (its thumb is clickable); the second
    // photo's object fails to sign once the viewer pages to it.
    vi.mocked(createSignedUrl).mockImplementation((_bucket, path) =>
      path.includes('register.png')
        ? Promise.reject(new Error('storage 503'))
        : Promise.resolve('https://signed.example/ok')
    )

    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    await user.click(await screen.findByTitle('View front-door.jpg'))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Photo 1 of 2')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Next photo' }))
    expect(
      await within(dialog).findByText('The photo could not be loaded')
    ).toBeInTheDocument()
    expect(within(dialog).queryByText('Loading photo…')).not.toBeInTheDocument()
  })

  // M4 live-smoke F1: 4 photos + 1 video is the REALISTIC seeded shape —
  // images must never push the video into the non-clickable overflow
  // badge (spec §5: video on demand means a reachable play affordance).
  it('keeps video reachable when images fill every tile slot', async () => {
    const user = userEvent.setup()
    vi.mocked(fetchMedia).mockResolvedValue([
      ...['q1', 'q2', 'q3', 'q4'].map(id =>
        mappedMedia(mediaRow({ id, filename: `${id}.jpg` }))
      ),
      mappedMedia(
        mediaRow({
          id: 'v-crowded',
          type: 'video',
          filename: 'dvr.mp4',
          mime_type: 'video/mp4',
          storage_bucket: 'video',
        })
      ),
    ])

    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    // A location that has video always exposes a playable affordance.
    const play = await screen.findByTitle('Play video (on demand)')
    await user.click(play)
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('dvr.mp4')).toBeInTheDocument()
  })

  it('caps inline tiles and closes the row with an overflow badge', async () => {
    vi.mocked(fetchMedia).mockResolvedValue([
      ...['x1', 'x2', 'x3', 'x4', 'x5'].map(id =>
        mappedMedia(mediaRow({ id, filename: `${id}.jpg` }))
      ),
      mappedMedia(
        mediaRow({
          id: 'v9',
          type: 'video',
          filename: 'v9.mp4',
          mime_type: 'video/mp4',
          storage_bucket: 'video',
        })
      ),
    ])

    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    // 6 tiles → 4 inline + "+2".
    expect(await screen.findByTitle('2 more')).toBeInTheDocument()
    expect(screen.getByTitle('2 more')).toHaveTextContent('+2')
  })
})

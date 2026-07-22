import { screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { CaseDashboard } from '../components/CaseDashboard'
import { PanelActivityLane } from '../components/PanelActivityLane'
import {
  fetchCases,
  fetchLocations,
  fetchLocationCounts,
  fetchMedia,
} from '../services/canvassService'
import { createSignedUrl } from '../services/mediaService'
import {
  toCanvassCase,
  toCanvassLocation,
  toCanvassMedia,
} from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type { CanvassLocation, CanvassMedia, LocationRow } from '../types'
import {
  caseRow,
  locationRow,
  mediaRow,
  SEED_CASE_ID,
  SEED_LOCATION_ID,
} from './fixtures'

/**
 * Phase 5.3A (tests #96–98 + #90): the case view's real dashboard —
 * the poured DashboardView wired by the CaseDashboard host. 6.3C
 * landed: the M5-interim feed column is gone (the feed lives in the
 * ProcessPanel's ACTIVITY lane via PanelActivityLane) — #98 is amended
 * in place to pin the recomposition (doc 03's sanctioned exception),
 * and #90's scoping arm retargets PanelActivityLane, the code that
 * owns the case filter now.
 */

vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(() => Promise.resolve([])),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchLocationCounts: vi.fn(() => Promise.resolve({})),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
vi.mock('../services/mediaService', { spy: true })
vi.mock('@/lib/supabase/client')

function mapped(row: LocationRow): CanvassLocation {
  const location = toCanvassLocation(row)
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

const LOCATIONS: CanvassLocation[] = [
  mapped(
    locationRow({
      id: SEED_LOCATION_ID,
      location_name: 'QuickMart Convenience',
      status: 'complete',
      requester_name: 'Det. A. Morgan',
    })
  ),
  mapped(
    locationRow({
      id: 'l-morgan-2',
      location_name: 'Golden Dragon Restaurant',
      status: 'complete',
      requester_name: 'Det. A. Morgan',
      // No DVR block and no media — the designed sparse row.
      form_data: {},
    })
  ),
  mapped(
    locationRow({
      id: 'l-chen-1',
      location_name: 'Rexall Pharmacy',
      status: 'working',
      requester_name: 'Det. L. Chen',
    })
  ),
  mapped(
    locationRow({
      id: 'l-chen-2',
      location_name: 'TD Canada Trust',
      status: 'started',
      requester_name: 'Det. L. Chen',
      location: null, // exercises the no-fix sub-label
    })
  ),
]

const MEDIA: CanvassMedia[] = [
  toCanvassMedia(mediaRow()),
  toCanvassMedia(
    mediaRow({
      id: 'm-2',
      type: 'video',
      filename: 'dvr-export.mp4',
      mime_type: 'video/mp4',
      storage_bucket: 'video',
      created_at: '2026-07-17T15:30:00+00:00',
    })
  ),
].filter((m): m is CanvassMedia => m !== null)

function pushEntry(caseId: string, summary: string) {
  useCanvassStore.getState().pushActivity({
    id: `e-${summary}`,
    at: Date.now(),
    caseId,
    kind: 'location-updated',
    summary,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvassStore()
  useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })
  vi.mocked(fetchCases).mockResolvedValue(
    [
      toCanvassCase(
        caseRow({
          metadata: { oicName: 'D/Sgt. R. Vance', oicBadgeNumber: '2201' },
        })
      ),
    ].filter(c => c !== null)
  )
  vi.mocked(fetchLocations).mockResolvedValue(LOCATIONS)
  vi.mocked(fetchMedia).mockResolvedValue(MEDIA)
  vi.mocked(createSignedUrl).mockResolvedValue('https://signed.example/x.jpg')
})

/** StatTile splits value/label into sibling spans — read the value
 * through the label (casesView precedent). */
function tileValue(label: string): string | null | undefined {
  return screen.getByText(label).previousElementSibling?.textContent
}

describe('CaseDashboard (Phase 5.3A)', () => {
  // Test #96
  it('shows status counts for the selected case from the loaded locations', async () => {
    renderWithFeatureProviders(<CaseDashboard />)

    expect(await screen.findByText('Locations')).toBeInTheDocument()
    expect(tileValue('Locations')).toBe('4')
    expect(tileValue('Started')).toBe('1')
    expect(tileValue('Working')).toBe('1')
    expect(tileValue('Complete')).toBe('2')
    // One no-fix row surfaces in the locations tile's sub-label.
    expect(screen.getByText('1 no GPS fix')).toBeInTheDocument()
    // Counts derive from the loaded location rows — never the landing
    // counts query (that family belongs to the cases view).
    expect(fetchLocationCounts).not.toHaveBeenCalled()
    // The OIC line comes from case metadata (name · badge).
    expect(screen.getByText('OIC D/Sgt. R. Vance · 2201')).toBeInTheDocument()
  })

  // Test #97
  it('derives the roster from location rows (AD8), grouped per investigator', async () => {
    renderWithFeatureProviders(<CaseDashboard />)

    const morgan = (await screen.findByText('Det. A. Morgan')).closest(
      'article'
    )
    const chen = screen.getByText('Det. L. Chen').closest('article')
    if (morgan === null || chen === null) {
      throw new Error('investigator cards did not render')
    }

    // Each investigator's locations sit inside their card.
    expect(
      within(morgan).getByText('QuickMart Convenience')
    ).toBeInTheDocument()
    expect(
      within(morgan).getByText('Golden Dragon Restaurant')
    ).toBeInTheDocument()
    expect(within(chen).getByText('Rexall Pharmacy')).toBeInTheDocument()
    expect(within(chen).getByText('TD Canada Trust')).toBeInTheDocument()
    expect(within(morgan).getByText('2 loc')).toBeInTheDocument()
    expect(within(chen).getByText('2 loc')).toBeInTheDocument()
  })

  // Test #98 — AMENDED IN PLACE at 6.3C (the doc-03 sanctioned
  // exception): the dashboard is recomposed — the feed column is GONE
  // (relocated to the ProcessPanel's ACTIVITY lane) and the view is
  // the dashboard alone, roster owning the freed width.
  it('renders the recomposed dashboard — no feed column (6.3C)', async () => {
    renderWithFeatureProviders(<CaseDashboard />)
    await screen.findByText('Locations')

    // The interim feed column and its header are absent from the view.
    expect(screen.queryByText('Live activity')).not.toBeInTheDocument()
    act(() => {
      pushEntry(SEED_CASE_ID, 'QuickMart Convenience — status → COMPLETE')
    })
    // Activity entries no longer render inside the dashboard view —
    // #122 pins their new home (the panel's ACTIVITY lane).
    expect(
      screen.queryByText('QuickMart Convenience — status → COMPLETE')
    ).not.toBeInTheDocument()
    // The dashboard itself (roster included) still renders in full.
    expect(screen.getByText('Det. A. Morgan')).toBeInTheDocument()
  })

  // Test #90 — retargeted at 6.3C with the feed relocation: the case
  // scoping now lives in PanelActivityLane (the activitySlot content
  // CanvassRoot composes into the panel).
  it('scopes the feed to the selected case', () => {
    act(() => {
      pushEntry(SEED_CASE_ID, 'Selected-case entry')
      pushEntry('other-case-id', 'Other-case entry')
    })
    renderWithFeatureProviders(<PanelActivityLane />)

    expect(screen.getByText('Selected-case entry')).toBeInTheDocument()
    expect(screen.queryByText('Other-case entry')).not.toBeInTheDocument()
  })

  // The landing posture (no selection): the panel exists on every view
  // as of 6.3C, and with no case selected the lane shows the whole
  // agency ring (unnumbered arm — the null branch of #90's filter).
  it('shows the whole agency ring when no case is selected', () => {
    act(() => {
      pushEntry(SEED_CASE_ID, 'Selected-case entry')
      pushEntry('other-case-id', 'Other-case entry')
      useCanvassStore.setState({ selectedCaseId: null })
    })
    renderWithFeatureProviders(<PanelActivityLane />)

    expect(screen.getByText('Selected-case entry')).toBeInTheDocument()
    expect(screen.getByText('Other-case entry')).toBeInTheDocument()
  })

  // 5.3A media wiring arm: expanded roster rows carry the M4 media
  // strip (thumbs → viewer/player), and rows with neither DVR nor
  // media keep the designed sparse copy.
  it('mounts media thumbs in the expanded roster row', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(<CaseDashboard />)

    // The incident panel carries the same business name — target the
    // roster row's expand button specifically.
    const row = await screen.findByRole('button', {
      name: /QuickMart Convenience/,
    })
    await user.click(row)

    // The strip's photo tile (signed) + the video play tile.
    expect(await screen.findByAltText('camera-01.jpg')).toBeInTheDocument()
    expect(screen.getByTitle('Play video (on demand)')).toBeInTheDocument()
    // DVR block present ⇒ no sparse copy on this row.
    expect(
      screen.queryByText('No details yet — investigator on scene')
    ).not.toBeInTheDocument()

    // A row with neither DVR nor media keeps the sparse copy.
    await user.click(
      screen.getByRole('button', { name: /Golden Dragon Restaurant/ })
    )
    expect(
      screen.getByText('No details yet — investigator on scene')
    ).toBeInTheDocument()
  })

  // Designed empty state, never blank (plan 5.3 error handling).
  it('renders the designed empty state for a case with no locations', async () => {
    vi.mocked(fetchLocations).mockResolvedValue([])
    vi.mocked(fetchMedia).mockResolvedValue([])
    renderWithFeatureProviders(<CaseDashboard />)

    expect(await screen.findByText('Awaiting first data')).toBeInTheDocument()
  })
})

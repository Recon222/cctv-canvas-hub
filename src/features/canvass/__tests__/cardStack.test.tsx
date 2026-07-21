import { screen, within, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { LocationCardStack } from '../components/LocationCardStack'
import { fetchCases, fetchLocations } from '../services/canvassService'
import { toCanvassCase, toCanvassLocation } from '../services/mappers'
import { resetCanvassStore, useCanvassStore } from '../store/canvass-store'
import type { CanvassLocation, LocationRow } from '../types'
import { caseRow, locationRow, SEED_CASE_ID } from './fixtures'

/**
 * Phase 3.4 (tests #75–76) + ledger D16: the floating stack is
 * case-grouped under its case header card, carries the single-select
 * listbox/option model in ONE DOM subtree, and sorts attention-fresh
 * cards to the top of their status group.
 */

vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(() => Promise.resolve([])),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchLocationCounts: vi.fn(() => Promise.resolve({})),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/supabase/client')

function mapped(row: LocationRow): CanvassLocation {
  const location = toCanvassLocation(row)
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

const LOCATIONS = [
  mapped(
    locationRow({
      id: 'l-complete-a',
      location_name: 'Alpha Convenience',
      status: 'complete',
    })
  ),
  mapped(
    locationRow({
      id: 'l-complete-b',
      location_name: 'Bravo Pharmacy',
      status: 'complete',
    })
  ),
  mapped(
    locationRow({
      id: 'l-working',
      location_name: 'Charlie Petro',
      status: 'working',
      location: null, // exercises the header's no-fix count
    })
  ),
]

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvassStore()
  useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'map' })
  vi.mocked(fetchCases).mockResolvedValue(
    [toCanvassCase(caseRow())].filter(c => c !== null)
  )
  vi.mocked(fetchLocations).mockResolvedValue(LOCATIONS)
})

describe('floating card stack (Phase 3.4)', () => {
  // Test #75
  it('groups cards under their case header', async () => {
    renderWithFeatureProviders(<LocationCardStack floating />)

    // The case header card: number, name, and the no-fix chip.
    const header = await screen.findByText('24-CANVASS-0417')
    expect(
      screen.getByText('QuickMart Robbery — Yonge St Canvass')
    ).toBeInTheDocument()
    expect(screen.getByText('1 no GPS fix')).toBeInTheDocument()

    // One listbox owns every option (D16 — a single DOM subtree).
    const listbox = screen.getByRole('listbox')
    const options = within(listbox).getAllByRole('option')
    expect(options).toHaveLength(3)

    // Every card sits under (after) the case header — case-grouped.
    for (const option of options) {
      expect(
        header.compareDocumentPosition(option) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy()
    }

    // Selection is exposed as single-select state on the options.
    expect(
      options.every(option => option.getAttribute('aria-selected') === 'false')
    ).toBe(true)
    act(() => {
      useCanvassStore.getState().selectLocation('l-working')
    })
    expect(
      screen
        .getAllByRole('option')
        .filter(option => option.getAttribute('aria-selected') === 'true')
    ).toHaveLength(1)
  })

  // Test #76
  it('sorts attention-fresh cards to the top of their group', async () => {
    renderWithFeatureProviders(<LocationCardStack floating />)
    await screen.findByText('Alpha Convenience')

    // Fetch order inside the COMPLETE group: Alpha before Bravo.
    const names = () =>
      screen
        .getAllByRole('option')
        .map(option => within(option).getByRole('heading').textContent)
    expect(names().indexOf('Alpha Convenience')).toBeLessThan(
      names().indexOf('Bravo Pharmacy')
    )

    // A live update stamps Bravo — it must surface to its group's top.
    act(() => {
      useCanvassStore.getState().pushActivity({
        id: 'a-1',
        at: Date.now(),
        caseId: SEED_CASE_ID,
        kind: 'location-updated',
        locationId: 'l-complete-b',
        summary: 'Bravo Pharmacy',
      })
    })

    expect(names().indexOf('Bravo Pharmacy')).toBeLessThan(
      names().indexOf('Alpha Convenience')
    )
    // The other group is untouched by the sort.
    expect(screen.getByText('Charlie Petro')).toBeInTheDocument()
  })
})

import { screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { CasesView } from '../components/CasesView'
import { NavRail } from '../components/NavRail'
import { fetchCases, fetchLocations } from '../services/canvassService'
import { toCanvassCase, toCanvassLocation } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { caseRow, locationRow, SEED_CASE_ID } from './fixtures'

vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(),
  fetchLocations: vi.fn(),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/supabase/client')

const seededCase = toCanvassCase(caseRow())
const seededLocations = [
  toCanvassLocation(locationRow({ id: 'l-1', status: 'complete' })),
  toCanvassLocation(locationRow({ id: 'l-2', status: 'working' })),
  toCanvassLocation(locationRow({ id: 'l-3', status: 'started' })),
  toCanvassLocation(locationRow({ id: 'l-4', status: 'started' })),
].flatMap(location => (location === null ? [] : [location]))

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvassStore()
  vi.mocked(fetchCases).mockResolvedValue(
    seededCase === null ? [] : [seededCase]
  )
  vi.mocked(fetchLocations).mockResolvedValue(seededLocations)
})

describe('CasesView (A1)', () => {
  // Test #110
  it('renders the Cases landing view with one card per active case', async () => {
    renderWithFeatureProviders(<CasesView />)

    expect(await screen.findByText('24-CANVASS-0417')).toBeInTheDocument()
    expect(
      screen.getByText('QuickMart Robbery — Yonge St Canvass')
    ).toBeInTheDocument()
    expect(
      screen.getByText('17600 Yonge St, Newmarket, ON')
    ).toBeInTheDocument()
    // Status counts derived from the case's locations.
    expect(await screen.findByText('2 Started')).toBeInTheDocument()
    expect(screen.getByText('1 Working')).toBeInTheDocument()
    expect(screen.getByText('1 Complete')).toBeInTheDocument()
    // Last activity from the case row.
    expect(screen.getByText(/Last activity/)).toBeInTheDocument()
  })

  // Test #111
  it('navigates from a case card to the case dashboard', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(
      <div>
        <NavRail />
        <CasesView />
      </div>
    )

    // With no selected case, the case/map rail entries are disabled (AD12).
    expect(
      screen.getByRole('button', { name: 'Case dashboard' })
    ).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Map' })).toBeDisabled()

    await user.click(await screen.findByText('24-CANVASS-0417'))

    expect(useCanvassStore.getState().selectedCaseId).toBe(SEED_CASE_ID)
    expect(useCanvassStore.getState().view).toBe('case')
    // Selection unlocks the case-bound rail entries.
    expect(screen.getByRole('button', { name: 'Case dashboard' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Map' })).toBeEnabled()

    // The rail navigates between views once a case is selected.
    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(useCanvassStore.getState().view).toBe('map')
    act(() => {
      useCanvassStore.getState().setView('cases')
    })
    expect(useCanvassStore.getState().view).toBe('cases')
  })
})

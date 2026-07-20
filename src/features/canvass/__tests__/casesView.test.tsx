import React from 'react'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { I18nextProvider } from 'react-i18next'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import i18n from '@/i18n/config'
import { getSupabase } from '@/lib/supabase/client'
import {
  CASE_DATA_KEY_FAMILIES,
  resetHealthStore,
  useHealthStore,
} from '@/store/health-store'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { CanvassRoot } from '../components/CanvassRoot'
import { CasesView } from '../components/CasesView'
import { NavRail } from '../components/NavRail'
import { fetchCases, fetchLocationCounts } from '../services/canvassService'
import { toCanvassCase } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { caseRow, SEED_CASE_ID } from './fixtures'

vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchLocationCounts: vi.fn(),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
vi.mock('@/lib/supabase/client')

const seededCase = toCanvassCase(caseRow())

/** Like renderWithFeatureProviders, but exposes the QueryClient. */
function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>
    </QueryClientProvider>
  )
  return { queryClient, ...rendered }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Round-2 fix-delta: the boundary-reset test flaked 3/90 with the
  // mutation's signature — health marks leaking between tests. Every
  // test in this file starts from a pristine health store.
  resetHealthStore()
  resetCanvassStore()
  vi.mocked(fetchCases).mockResolvedValue(
    seededCase === null ? [] : [seededCase]
  )
  vi.mocked(fetchLocationCounts).mockResolvedValue({
    [SEED_CASE_ID]: { started: 2, working: 1, complete: 1 },
  })
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
    // Status counts come from the ONE agency-wide counts query — never a
    // per-card location fetch (review HIGH: landing N+1).
    expect(await screen.findByText('2 Started')).toBeInTheDocument()
    expect(screen.getByText('1 Working')).toBeInTheDocument()
    expect(screen.getByText('1 Complete')).toBeInTheDocument()
    expect(vi.mocked(fetchLocationCounts)).toHaveBeenCalledTimes(1)
    expect(vi.mocked(fetchLocationCounts)).toHaveBeenCalledWith([SEED_CASE_ID])
    // Last activity from the case row.
    expect(screen.getByText(/Last activity/)).toBeInTheDocument()
  })

  it('renders "—" for counts it does not have, never a fabricated zero', async () => {
    // The counts query failing must not render "0 · 0 · 0" — that reads
    // as "nobody has worked this case" on a wall display (review HIGH).
    vi.mocked(fetchLocationCounts).mockRejectedValue(
      new Error('connection refused')
    )
    renderWithFeatureProviders(<CasesView />)

    expect(await screen.findByText('24-CANVASS-0417')).toBeInTheDocument()
    expect(await screen.findByText('— Started')).toBeInTheDocument()
    expect(screen.getByText('— Working')).toBeInTheDocument()
    expect(screen.getByText('— Complete')).toBeInTheDocument()
    expect(screen.queryByText('0 Started')).not.toBeInTheDocument()
  })

  it('renders real zeros for a case absent from a successful counts fetch', async () => {
    vi.mocked(fetchLocationCounts).mockResolvedValue({})
    renderWithFeatureProviders(<CasesView />)

    expect(await screen.findByText('0 Started')).toBeInTheDocument()
    expect(screen.getByText('0 Working')).toBeInTheDocument()
    expect(screen.getByText('0 Complete')).toBeInTheDocument()
  })

  it('renders the designed empty state for an agency with no cases', async () => {
    vi.mocked(fetchCases).mockResolvedValue([])
    renderWithFeatureProviders(<CasesView />)

    expect(await screen.findByText('No active cases')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Cases appear here as soon as investigators sync them from the field.'
      )
    ).toBeInTheDocument()
    // No cases ⇒ no counts round trip.
    expect(vi.mocked(fetchLocationCounts)).not.toHaveBeenCalled()
  })

  it('renders the error alert when the first cases fetch fails', async () => {
    vi.mocked(fetchCases).mockRejectedValue(new Error('offline'))
    renderWithFeatureProviders(<CasesView />)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not load cases from the agency cloud'
    )
  })

  it('keeps rendering cached cases when a background reconcile fails', async () => {
    const { queryClient } = renderWithClient(<CasesView />)
    expect(await screen.findByText('24-CANVASS-0417')).toBeInTheDocument()
    // The counts query is `enabled` only once cases resolve — its first
    // fetch races the case-number await above. Both loads must land
    // BEFORE the mocks swap to rejection, or the counts' first fetch
    // rejects and this test proves nothing about stale-visibility
    // (fix-delta review MEDIUM: measured 13% flake in scoped runs).
    expect(await screen.findByText('2 Started')).toBeInTheDocument()

    vi.mocked(fetchCases).mockRejectedValue(new Error('reconcile failed'))
    vi.mocked(fetchLocationCounts).mockRejectedValue(
      new Error('reconcile failed')
    )
    await act(async () => {
      await queryClient.refetchQueries()
    })

    // Stale-visible beats blank: the wall keeps its last-known truth.
    expect(screen.getByText('24-CANVASS-0417')).toBeInTheDocument()
    expect(screen.getByText('2 Started')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('resets board, health, and case-data cache when the session unmounts the board', () => {
    // CanvassRoot mounts realtime, so the auto-mocked client needs a
    // minimal channel surface.
    const channel = { on: vi.fn(), subscribe: vi.fn() }
    channel.on.mockReturnValue(channel)
    vi.mocked(getSupabase).mockReturnValue({
      channel: vi.fn(() => channel),
      removeChannel: vi.fn(() => Promise.resolve('ok')),
    } as unknown as ReturnType<typeof getSupabase>)

    const { queryClient, unmount } = renderWithClient(<CanvassRoot />)
    act(() => {
      const store = useCanvassStore.getState()
      store.selectCase(SEED_CASE_ID)
      store.setView('case')
      // Operator A's session artifacts: liveness marks and cached case
      // data inside staleTime, plus a non-case family as control.
      useHealthStore.getState().channelStatus('subscribed')
      useHealthStore.getState().recordFetchOk()
      queryClient.setQueryData(['locations', SEED_CASE_ID], [])
      queryClient.setQueryData(['location-counts', [SEED_CASE_ID]], {})
      queryClient.setQueryData(['media', SEED_CASE_ID], [])
      queryClient.setQueryData(['preferences'], { theme: 'dark' })
    })
    expect(useCanvassStore.getState().selectedCaseId).toBe(SEED_CASE_ID)
    expect(useHealthStore.getState().state).toBe('live')

    // Unmount IS the session exit (active/locked → anything else): the
    // next operator must inherit neither the case selection, operator
    // A's liveness marks (a dead-socket 'subscribed' carcass skips the
    // resubscribe catch-up), nor a cached case list that would suppress
    // the sign-in refetch (review MEDIUM + fix-delta MEDIUM: only the
    // canvass store reset at this boundary).
    unmount()
    expect(useCanvassStore.getState().selectedCaseId).toBeNull()
    expect(useCanvassStore.getState().selectedLocationId).toBeNull()
    expect(useCanvassStore.getState().view).toBe('cases')
    expect(useCanvassStore.getState().activity).toHaveLength(0)
    expect(useHealthStore.getState().state).toBe('connecting')
    expect(useHealthStore.getState().marks.channel).toBeNull()
    expect(useHealthStore.getState().marks.lastFetchOkAt).toBeNull()
    for (const family of CASE_DATA_KEY_FAMILIES) {
      expect(
        queryClient.getQueryCache().findAll({ queryKey: [family] })
      ).toHaveLength(0)
    }
    // Non-case families survive the boundary untouched.
    expect(queryClient.getQueryData(['preferences'])).toEqual({
      theme: 'dark',
    })
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

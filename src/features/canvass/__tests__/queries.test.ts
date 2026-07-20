import React from 'react'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getSupabase } from '@/lib/supabase/client'
import {
  useHealthStore,
  resetHealthStore,
  RECONCILE_MS,
} from '@/store/health-store'
import { fetchCases, fetchLocationCounts } from '../services/canvassService'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useCaseMedia } from '../hooks/useCaseMedia'
import type { CanvassCase, CanvassLocation, CanvassMedia } from '../types'
import { caseRow, locationRow, mediaRow, SEED_CASE_ID } from './fixtures'

// The single supabase-js seam (test spec preamble).
vi.mock('@/lib/supabase/client')

const mockGetSupabase = vi.mocked(getSupabase)

interface QueryResult {
  data: unknown
  error: { message: string } | null
}

/** Chainable thenable that records the PostgREST builder calls. */
function fakeQuery(result: QueryResult) {
  const chain = {
    select: vi.fn(),
    is: vi.fn(),
    neq: vi.fn(),
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
    then: (resolve: (value: QueryResult) => unknown) =>
      Promise.resolve(result).then(resolve),
  }
  chain.select.mockReturnValue(chain)
  chain.is.mockReturnValue(chain)
  chain.neq.mockReturnValue(chain)
  chain.eq.mockReturnValue(chain)
  chain.in.mockReturnValue(chain)
  chain.order.mockReturnValue(chain)
  chain.limit.mockReturnValue(chain)
  return chain
}

function installClient(chain: ReturnType<typeof fakeQuery>) {
  const from = vi.fn(() => chain)
  mockGetSupabase.mockReturnValue({ from } as unknown as ReturnType<
    typeof getSupabase
  >)
  return from
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
  resetHealthStore()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('canvass queries', () => {
  // Test #41
  it('fetches cases with pinned server-side predicates', async () => {
    const chain = fakeQuery({
      data: [
        caseRow(),
        caseRow({ id: 'c-deleted', deleted_at: '2026-07-18T00:00:00Z' }),
      ],
      error: null,
    })
    const from = installClient(chain)

    const cases = await fetchCases()

    expect(from).toHaveBeenCalledWith('cloud_cases')
    expect(chain.select).toHaveBeenCalledWith('*')
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(chain.neq).toHaveBeenCalledWith('status', 'archived')
    expect(chain.order).toHaveBeenCalledWith('updated_at', {
      ascending: false,
    })
    expect(chain.limit).toHaveBeenCalledWith(50)
    // Mapped at the boundary — and the mapper still drops soft-deleted
    // rows even if the server predicate were lost.
    expect(cases).toHaveLength(1)
    expect(cases[0]?.caseNumber).toBe('24-CANVASS-0417')
  })

  // Test #42
  it('fetches locations keyed by case', async () => {
    const chain = fakeQuery({
      data: [locationRow(), locationRow({ id: 'l2', case_id: SEED_CASE_ID })],
      error: null,
    })
    const from = installClient(chain)
    const queryClient = makeQueryClient()

    const { result } = renderHook(() => useCaseLocations(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(from).toHaveBeenCalledWith('cloud_locations')
    expect(chain.eq).toHaveBeenCalledWith('case_id', SEED_CASE_ID)
    // The case-partitioned cache key (G6).
    const cached = queryClient.getQueryData<CanvassLocation[]>([
      'locations',
      SEED_CASE_ID,
    ])
    expect(cached).toHaveLength(2)
    // No raw rows in the cache: the view-model has coord, not WKB hex.
    expect(cached?.[0]?.coord?.lat).toBeCloseTo(44.0501, 6)
    // A null case id never fetches.
    const idle = renderHook(() => useCaseLocations(null), {
      wrapper: wrapperFor(queryClient),
    })
    expect(idle.result.current.fetchStatus).toBe('idle')
  })

  // Test #43
  it('fetches media keyed by case, mapped at the boundary', async () => {
    const chain = fakeQuery({
      data: [
        mediaRow(),
        mediaRow({ id: 'm-deleted', deleted_at: '2026-07-18T00:00:00Z' }),
      ],
      error: null,
    })
    const from = installClient(chain)
    const queryClient = makeQueryClient()

    const { result } = renderHook(() => useCaseMedia(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(from).toHaveBeenCalledWith('cloud_media_files')
    expect(chain.eq).toHaveBeenCalledWith('case_id', SEED_CASE_ID)
    const cached = queryClient.getQueryData<CanvassMedia[]>([
      'media',
      SEED_CASE_ID,
    ])
    // Soft-deleted excluded; rows are CanvassMedia view-models.
    expect(cached).toHaveLength(1)
    expect(cached?.[0]?.mime).toBe('image/jpeg')
    expect(cached?.[0]?.bucket).toBe('images')
    expect(cached?.[0]?.path).toContain(SEED_CASE_ID)
  })

  it('aggregates landing counts with one two-column query', async () => {
    const chain = fakeQuery({
      data: [
        { case_id: 'c1', status: 'started' },
        { case_id: 'c1', status: 'started' },
        { case_id: 'c1', status: 'complete' },
        { case_id: 'c2', status: 'working' },
      ],
      error: null,
    })
    const from = installClient(chain)

    const counts = await fetchLocationCounts(['c1', 'c2'])

    // ONE round trip, two columns, tombstones excluded server-side —
    // never a per-card select('*') (review HIGH: landing N+1).
    expect(from).toHaveBeenCalledTimes(1)
    expect(from).toHaveBeenCalledWith('cloud_locations')
    expect(chain.select).toHaveBeenCalledWith('case_id,status')
    expect(chain.in).toHaveBeenCalledWith('case_id', ['c1', 'c2'])
    expect(chain.is).toHaveBeenCalledWith('deleted_at', null)
    expect(counts).toEqual({
      c1: { started: 2, working: 0, complete: 1 },
      c2: { started: 0, working: 1, complete: 0 },
    })

    // No cases ⇒ no query at all.
    from.mockClear()
    await expect(fetchLocationCounts([])).resolves.toEqual({})
    expect(from).not.toHaveBeenCalled()
  })

  // Test #44
  it('excludes soft-deleted rows end-to-end', async () => {
    // The real seeded soft-deleted location rides along with a live one.
    const chain = fakeQuery({
      data: [
        locationRow(),
        locationRow({
          id: 'ba3f2935-3ad7-42ef-bebc-59dac7ac2764',
          location_name: 'DUPLICATE — wrong address',
          deleted_at: '2026-07-17T18:00:00+00:00',
        }),
      ],
      error: null,
    })
    installClient(chain)
    const queryClient = makeQueryClient()

    const { result } = renderHook(() => useCaseLocations(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
    expect(result.current.data).toHaveLength(1)
    expect(
      result.current.data?.some(l => l.name === 'DUPLICATE — wrong address')
    ).toBe(false)
    // Success recorded to health (the `live` predicate needs positives).
    expect(useHealthStore.getState().marks.lastFetchOkAt).not.toBeNull()
  })

  // Test #45
  it('reports query failure to health', async () => {
    const chain = fakeQuery({
      data: null,
      error: { message: 'connection refused' },
    })
    installClient(chain)
    const queryClient = makeQueryClient()

    const { result } = renderHook(() => useCases(), {
      wrapper: wrapperFor(queryClient),
    })

    await waitFor(() => {
      expect(result.current.isError).toBe(true)
    })
    expect(result.current.error?.message).toBe('connection refused')
    expect(useHealthStore.getState().marks.lastFetchErrorAt).not.toBeNull()
    expect(useHealthStore.getState().marks.lastFetchOkAt).toBeNull()
  })

  // Test #107
  it('reconciles case-data queries on a slow interval as a broadcast safety net', async () => {
    vi.useFakeTimers()
    const freshChain = fakeQuery({
      data: [caseRow({ display_name: 'reconciled name' })],
      error: null,
    })
    const staleChain = fakeQuery({ data: [caseRow()], error: null })
    let fetches = 0
    const from = vi.fn(() => {
      fetches += 1
      return fetches === 1 ? staleChain : freshChain
    })
    mockGetSupabase.mockReturnValue({ from } as unknown as ReturnType<
      typeof getSupabase
    >)
    const queryClient = makeQueryClient()

    renderHook(() => useCases(), { wrapper: wrapperFor(queryClient) })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(
      queryClient.getQueryData<CanvassCase[]>(['cases'])?.[0]?.displayName
    ).toBe('QuickMart Robbery — Yonge St Canvass')

    // Just short of the interval: no second fetch (no refetch-spam).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(RECONCILE_MS - 1_000)
    })
    expect(fetches).toBe(1)

    // One full cycle: the stale cache converges with no realtime event.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000)
    })
    expect(fetches).toBe(2)
    expect(
      queryClient.getQueryData<CanvassCase[]>(['cases'])?.[0]?.displayName
    ).toBe('reconciled name')
  })
})

import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSupabase } from '@/lib/supabase/client'
import { useHealthStore, resetHealthStore } from '@/store/health-store'
import { subscribeToCaseActivity } from '../services/realtimeService'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { toCanvassLocation } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type { CanvassLocation, LocationRow } from '../types'
import { locationRow, SEED_CASE_ID, SEED_LOCATION_ID } from './fixtures'

// The single supabase-js seam.
vi.mock('@/lib/supabase/client')

const mockGetSupabase = vi.mocked(getSupabase)

/**
 * Broadcast envelope pinned to a LIVE capture from canvas-hub-dev
 * (2026-07-20): signed in as det.morgan, subscribed to the private
 * `agency:activity` channel, updated an owned location, and recorded
 * exactly what the handler received:
 *
 *   { type: 'broadcast', event: 'UPDATE',
 *     payload: { id, table, record, schema, operation, old_record },
 *     meta: { id } }
 *
 * (Matches doc 01 §5.2's documented payload, plus the payload-level `id`
 * and top-level `meta` the docs don't mention.)
 */
function broadcastMessage(
  operation: 'INSERT' | 'UPDATE' | 'DELETE',
  record: Record<string, unknown> | null,
  oldRecord: Record<string, unknown> | null,
  table = 'cloud_locations'
) {
  return {
    type: 'broadcast',
    event: operation,
    payload: {
      id: '9106dcec-1147-4170-89d1-95c726d5c5b9',
      table,
      record,
      schema: 'public',
      operation,
      old_record: oldRecord,
    },
    meta: { id: '363a9bb9-8261-4d1e-8cb2-1955178a5474' },
  }
}

function fakeRealtime() {
  const broadcastHandlers = new Map<string, (message: unknown) => void>()
  let statusCallback: ((status: string) => void) | undefined
  const channel: {
    on: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  } = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(
    (
      _type: string,
      filter: { event: string },
      callback: (message: unknown) => void
    ) => {
      broadcastHandlers.set(filter.event, callback)
      return channel
    }
  )
  channel.subscribe.mockImplementation(
    (callback?: (status: string) => void) => {
      statusCallback = callback
      return channel
    }
  )
  const supabase = {
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
    from: vi.fn(),
  }
  mockGetSupabase.mockReturnValue(
    supabase as unknown as ReturnType<typeof getSupabase>
  )
  return {
    supabase,
    channel,
    fire: (event: string, message: unknown) => {
      broadcastHandlers.get(event)?.(message)
    },
    fireStatus: (status: string) => {
      statusCallback?.(status)
    },
  }
}

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
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

function mappedLocation(row: LocationRow): CanvassLocation {
  const mapped = toCanvassLocation(row)
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
}

beforeEach(() => {
  vi.clearAllMocks()
  resetHealthStore()
  resetCanvassStore()
})

describe('realtimeService', () => {
  // Test #46
  it('subscribes to agency:activity as a private channel', () => {
    const rt = fakeRealtime()
    const onStatus = vi.fn()

    const unsubscribe = subscribeToCaseActivity(SEED_CASE_ID, vi.fn(), onStatus)

    expect(rt.supabase.channel).toHaveBeenCalledWith('agency:activity', {
      config: { private: true },
    })
    expect(rt.channel.subscribe).toHaveBeenCalled()
    // supabase-js subscribe states map to the canonical ChannelStatus union.
    rt.fireStatus('SUBSCRIBED')
    rt.fireStatus('CHANNEL_ERROR')
    rt.fireStatus('TIMED_OUT')
    rt.fireStatus('CLOSED')
    expect(onStatus.mock.calls.map(call => call[0])).toEqual([
      'subscribed',
      'error',
      'timed-out',
      'closed',
    ])
    // Teardown removes the channel (D12 hangs off this path via unmount).
    unsubscribe()
    expect(rt.supabase.removeChannel).toHaveBeenCalledWith(rt.channel)
  })

  // Test #47
  it('decodes the broadcast_changes payload shape (pinned to the live capture)', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn()
    subscribeToCaseActivity(SEED_CASE_ID, onEvent, vi.fn())

    const oldRow = locationRow({ location_contact: '' })
    const newRow = locationRow({
      location_contact: 'Shift supervisor (capture probe)',
    })
    rt.fire(
      'UPDATE',
      broadcastMessage(
        'UPDATE',
        newRow as unknown as Record<string, unknown>,
        oldRow as unknown as Record<string, unknown>
      )
    )

    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith({
      table: 'cloud_locations',
      op: 'UPDATE',
      row: newRow,
      old: oldRow,
    })
  })

  // Test #48
  it('dispatches only events matching the subscribed case_id', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn()
    subscribeToCaseActivity(SEED_CASE_ID, onEvent, vi.fn())

    // A location from another case never reaches the handler (G6).
    const foreign = locationRow({ id: 'l-x', case_id: 'some-other-case' })
    rt.fire(
      'UPDATE',
      broadcastMessage(
        'UPDATE',
        foreign as unknown as Record<string, unknown>,
        null
      )
    )
    expect(onEvent).not.toHaveBeenCalled()

    // A case row is matched on its own id, not case_id.
    rt.fire(
      'UPDATE',
      broadcastMessage(
        'UPDATE',
        { id: 'some-other-case', deleted_at: null },
        null,
        'cloud_cases'
      )
    )
    expect(onEvent).not.toHaveBeenCalled()
    rt.fire(
      'UPDATE',
      broadcastMessage(
        'UPDATE',
        { id: SEED_CASE_ID, deleted_at: null },
        null,
        'cloud_cases'
      )
    )
    expect(onEvent).toHaveBeenCalledTimes(1)
  })
})

describe('useCaseRealtime', () => {
  // Test #49
  it('patches an UPDATE into the locations cache by id, mapped', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [mappedLocation(locationRow())]
    )
    queryClient.setQueryData(['media', SEED_CASE_ID], [])

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    const oldRow = locationRow()
    const newRow = locationRow({ status: 'working' })
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          newRow as unknown as Record<string, unknown>,
          oldRow as unknown as Record<string, unknown>
        )
      )
    })

    const cached = queryClient.getQueryData<CanvassLocation[]>([
      'locations',
      SEED_CASE_ID,
    ])
    expect(cached).toHaveLength(1)
    // The patched row went through the SAME mapper choke point as a
    // fetch: it is a CanvassLocation with a parsed coord, not a raw row.
    expect(cached?.[0]?.status).toBe('working')
    expect(cached?.[0]?.coord?.lat).toBeCloseTo(44.0501, 6)
    expect(cached?.[0]).not.toHaveProperty('location')
    expect(cached?.[0]).not.toHaveProperty('form_data')
    // No refetch was issued — the payload carried the full row (Flow C4).
    expect(rt.supabase.from).not.toHaveBeenCalled()
    // Activity entry + attention stamp + health confirmation.
    const activity = useCanvassStore.getState().activity
    expect(activity[0]?.kind).toBe('location-status')
    expect(activity[0]?.locationId).toBe(SEED_LOCATION_ID)
    expect(
      useCanvassStore.getState().attentionByLocation[SEED_LOCATION_ID]
    ).toBeDefined()
    expect(useHealthStore.getState().marks.lastEventAt).not.toBeNull()
    // That location's media was invalidated (Flow D3).
    expect(
      queryClient.getQueryState(['media', SEED_CASE_ID])?.isInvalidated
    ).toBe(true)
  })

  // Test #50
  it('upserts INSERTs by id and drops soft-deleted rows from cache', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [mappedLocation(locationRow())]
    )

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    const inserted = locationRow({ id: 'l-new', location_name: 'New spot' })
    const insertMessage = broadcastMessage(
      'INSERT',
      inserted as unknown as Record<string, unknown>,
      null
    )
    act(() => {
      // Broadcast redelivery: the same INSERT arrives twice.
      rt.fire('INSERT', insertMessage)
      rt.fire('INSERT', insertMessage)
    })

    let cached = queryClient.getQueryData<CanvassLocation[]>([
      'locations',
      SEED_CASE_ID,
    ])
    // Exactly one row per id — replaced, never duplicated.
    expect(cached?.filter(l => l.id === 'l-new')).toHaveLength(1)
    expect(cached).toHaveLength(2)

    // A soft-delete arrives as an UPDATE with deleted_at set ⇒ removed.
    const softDeleted = locationRow({
      id: 'l-new',
      deleted_at: '2026-07-20T12:00:00Z',
    })
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          softDeleted as unknown as Record<string, unknown>,
          inserted as unknown as Record<string, unknown>
        )
      )
    })
    cached = queryClient.getQueryData<CanvassLocation[]>([
      'locations',
      SEED_CASE_ID,
    ])
    expect(cached).toHaveLength(1)
    expect(cached?.some(l => l.id === 'l-new')).toBe(false)
  })

  // Test #51
  it('ignores unknown tables and ops without throwing', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    const seeded = [mappedLocation(locationRow())]
    queryClient.setQueryData(['locations', SEED_CASE_ID], seeded)

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    act(() => {
      // Forward-compat: V2 puts cloud_media_files on the substrate.
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          { id: 'm-1', case_id: SEED_CASE_ID },
          null,
          'cloud_media_files'
        )
      )
      // Unknown operation inside a known event name.
      const weird = broadcastMessage(
        'UPDATE',
        locationRow() as unknown as Record<string, unknown>,
        null
      )
      weird.payload.operation = 'TRUNCATE' as never
      rt.fire('UPDATE', weird)
      // Garbage envelopes.
      rt.fire('UPDATE', { type: 'broadcast', event: 'UPDATE' })
      rt.fire('UPDATE', null)
    })

    // Nothing changed, nothing threw.
    expect(
      queryClient.getQueryData<CanvassLocation[]>(['locations', SEED_CASE_ID])
    ).toEqual(seeded)
    expect(useCanvassStore.getState().activity).toHaveLength(0)
  })
})

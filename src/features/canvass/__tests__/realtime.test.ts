import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getSupabase } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { useHealthStore, resetHealthStore } from '@/store/health-store'
import { subscribeToCaseActivity } from '../services/realtimeService'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { toCanvassCase, toCanvassLocation } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type {
  CanvassCase,
  CanvassLocation,
  CaseRow,
  LocationRow,
} from '../types'
import {
  caseRow,
  locationRow,
  SEED_CASE_ID,
  SEED_LOCATION_ID,
} from './fixtures'

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

/**
 * Library-faithful fake, modelling the realtime-js 2.110.7 behaviors the
 * CRITICAL regression depends on (traced through installed sources by
 * the review):
 * - `RealtimeClient.channel()` returns the EXISTING channel for a topic
 *   (params discarded) — even one that is mid-leave.
 * - `RealtimeChannel.subscribe()` is gated on `isClosed()`: any state
 *   but 'closed' is a SILENT no-op — no join, no status callback.
 * - `removeChannel()` → phoenix `leave()` sets state 'leaving' and waits
 *   for the server's leave ack (a network round trip — `ackLeave()`
 *   here); only the ack closes the channel, fires the old subscriber's
 *   CLOSED, and empties the client's channel list.
 * - A channel that is not joined delivers nothing.
 */
function fakeRealtime() {
  const broadcastHandlers = new Map<string, (message: unknown) => void>()
  let statusCallback: ((status: string, err?: Error) => void) | undefined
  let state: 'closed' | 'joined' | 'leaving' = 'closed'
  let registered = false
  let pendingLeave: (() => void) | undefined

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
    (callback?: (status: string, err?: Error) => void) => {
      if (state !== 'closed') {
        // The isClosed() gate: the entire join body silently no-ops.
        return channel
      }
      statusCallback = callback
      state = 'joined'
      return channel
    }
  )
  const supabase = {
    channel: vi.fn(() => {
      registered = true
      return channel // topic reuse: the same object, whatever its state
    }),
    removeChannel: vi.fn(() => {
      state = 'leaving'
      return new Promise(resolve => {
        pendingLeave = () => {
          state = 'closed'
          registered = false
          broadcastHandlers.clear()
          statusCallback?.('CLOSED')
          resolve('ok')
        }
      })
    }),
    from: vi.fn(),
  }
  mockGetSupabase.mockReturnValue(
    supabase as unknown as ReturnType<typeof getSupabase>
  )
  return {
    supabase,
    channel,
    /** The server's leave ack lands (the round trip completes). */
    ackLeave: () => {
      pendingLeave?.()
      pendingLeave = undefined
    },
    fire: (event: string, message: unknown) => {
      if (state !== 'joined' || !registered) {
        return // a dead or dying channel delivers nothing
      }
      broadcastHandlers.get(event)?.(message)
    },
    fireStatus: (status: string, err?: Error) => {
      statusCallback?.(status, err)
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

function mappedCase(row: CaseRow): CanvassCase {
  const mapped = toCanvassCase(row)
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

    const unsubscribe = subscribeToCaseActivity(
      () => SEED_CASE_ID,
      vi.fn(),
      onStatus
    )

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

  it('logs the cause when the channel reports an error', () => {
    const rt = fakeRealtime()
    const onStatus = vi.fn()
    const errorSpy = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined)
    subscribeToCaseActivity(() => SEED_CASE_ID, vi.fn(), onStatus)

    // A private-channel RLS denial is the likeliest field failure — the
    // err argument is its only trace (review MEDIUM: cause was dropped).
    rt.fireStatus('CHANNEL_ERROR', new Error('permission denied'))

    expect(onStatus).toHaveBeenCalledWith('error')
    expect(errorSpy).toHaveBeenCalledWith(
      'realtime: channel error',
      expect.objectContaining({ cause: expect.any(Error) as Error })
    )
    errorSpy.mockRestore()
  })

  // Test #47
  it('decodes the broadcast_changes payload shape (pinned to the live capture)', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn()
    subscribeToCaseActivity(() => SEED_CASE_ID, onEvent, vi.fn())

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
  it('dispatches only events matching the current case id', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn()
    subscribeToCaseActivity(() => SEED_CASE_ID, onEvent, vi.fn())

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

  it('records liveness on ANY well-formed envelope, before the case filter', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn()
    subscribeToCaseActivity(() => SEED_CASE_ID, onEvent, vi.fn())

    // Another case's event is filtered out — but it is still a delivered
    // broadcast proving the channel is alive (review HIGH: post-filter
    // confirms turn a quiet selected case into a false STALE ~70% of the
    // time on a healthy board).
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
    expect(useHealthStore.getState().marks.lastEventAt).not.toBeNull()

    // Garbage confirms nothing.
    resetHealthStore()
    rt.fire('UPDATE', { type: 'broadcast', event: 'UPDATE' })
    rt.fire('UPDATE', null)
    expect(useHealthStore.getState().marks.lastEventAt).toBeNull()
  })

  it('contains handler throws instead of letting them die in the socket loop', () => {
    const rt = fakeRealtime()
    const onEvent = vi.fn(() => {
      throw new Error('mapper exploded')
    })
    const errorSpy = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => undefined)
    subscribeToCaseActivity(() => SEED_CASE_ID, onEvent, vi.fn())

    // phoenix's bind.callback loop has no try/catch — an escaping throw
    // dies invisibly in the WebSocket onmessage path (review HIGH).
    expect(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow() as unknown as Record<string, unknown>,
          null
        )
      )
    }).not.toThrow()
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalledWith(
      'realtime: event dispatch failed',
      expect.objectContaining({ cause: expect.any(Error) as Error })
    )
    // Delivery still counted: the channel IS alive, the handler broke.
    expect(useHealthStore.getState().marks.lastEventAt).not.toBeNull()
    errorSpy.mockRestore()
  })
})

describe('useCaseRealtime', () => {
  // Regression for the review CRITICAL: the subscription must never be
  // keyed on the case. With a keyed effect, React's synchronous
  // cleanup→setup on a case switch runs removeChannel (state 'leaving',
  // ack pending) then channel() (same mid-leave channel back) then
  // subscribe() (isClosed()-gated silent no-op) — and when the leave ack
  // lands, ZERO channels remain for the rest of the session.
  it('keeps delivering after the selected case changes (no re-subscribe)', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    const caseB = 'b6a1c000-0000-4000-8000-000000000001'
    const locB = locationRow({
      id: 'l-b',
      case_id: caseB,
      location_name: 'B spot',
      status: 'started',
    })
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [mappedLocation(locationRow())]
    )
    queryClient.setQueryData(['locations', caseB], [mappedLocation(locB)])

    const { rerender, unmount } = renderHook(
      ({ caseId }: { caseId: string | null }) => useCaseRealtime(caseId),
      {
        wrapper: wrapperFor(queryClient),
        initialProps: { caseId: SEED_CASE_ID as string | null },
      }
    )

    // The coordinator switches cases while CanvassRoot stays mounted;
    // any pending leave ack then lands. rerender wrapped in act so the
    // ref-update effect is flushed before the first fire (fix-delta
    // review LOW: observed a rare flake without it).
    act(() => {
      rerender({ caseId: caseB })
    })
    act(() => {
      rt.ackLeave()
    })

    // A case-B update must still arrive live.
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({
            id: 'l-b',
            case_id: caseB,
            location_name: 'B spot',
            status: 'working',
          }) as unknown as Record<string, unknown>,
          locB as unknown as Record<string, unknown>
        )
      )
    })
    expect(
      queryClient.getQueryData<CanvassLocation[]>(['locations', caseB])?.[0]
        ?.status
    ).toBe('working')

    // Exactly one channel and one subscribe for the whole mount.
    expect(rt.supabase.channel).toHaveBeenCalledTimes(1)
    expect(rt.channel.subscribe).toHaveBeenCalledTimes(1)
    expect(rt.supabase.removeChannel).not.toHaveBeenCalled()

    // Back to the first case: still flowing.
    act(() => {
      rerender({ caseId: SEED_CASE_ID })
    })
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({ status: 'working' }) as unknown as Record<
            string,
            unknown
          >,
          locationRow() as unknown as Record<string, unknown>
        )
      )
    })
    expect(
      queryClient.getQueryData<CanvassLocation[]>([
        'locations',
        SEED_CASE_ID,
      ])?.[0]?.status
    ).toBe('working')

    // Unmount is the one true teardown (D12).
    unmount()
    expect(rt.supabase.removeChannel).toHaveBeenCalledTimes(1)
  })

  it('keeps the landing counts AND case list live while NO case is selected', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    queryClient.setQueryData(['location-counts', [SEED_CASE_ID]], {
      [SEED_CASE_ID]: { started: 1, working: 0, complete: 0 },
    })
    queryClient.setQueryData(['cases'], [mappedCase(caseRow())])

    renderHook(() => useCaseRealtime(null), {
      wrapper: wrapperFor(queryClient),
    })

    // The channel exists even with no selection (the landing is live).
    expect(rt.supabase.channel).toHaveBeenCalledTimes(1)

    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({ status: 'working' }) as unknown as Record<
            string,
            unknown
          >,
          locationRow() as unknown as Record<string, unknown>
        )
      )
    })

    // The counts family was invalidated (pre-filter), and no per-case
    // cache was touched (no case is selected).
    expect(
      queryClient.getQueryState(['location-counts', [SEED_CASE_ID]])
        ?.isInvalidated
    ).toBe(true)
    expect(
      queryClient.getQueryData<CanvassLocation[]>(['locations', SEED_CASE_ID])
    ).toBeUndefined()
    // Delivery confirmed health despite the filter.
    expect(useHealthStore.getState().marks.lastEventAt).not.toBeNull()

    // A cloud_cases envelope — with NO selection, so the id filter drops
    // it — still refreshes the case LIST: a new canvass or rename must
    // not sit stale above live counts until the reconcile (fix-delta
    // review LOW: mixed freshness on one card).
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          caseRow({ display_name: 'Renamed elsewhere' }) as unknown as Record<
            string,
            unknown
          >,
          null,
          'cloud_cases'
        )
      )
    })
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
    // Dropped by the filter: no patch, no activity — invalidation only.
    expect(
      queryClient.getQueryData<CanvassCase[]>(['cases'])?.[0]?.displayName
    ).toBe('QuickMart Robbery — Yonge St Canvass')
    expect(useCanvassStore.getState().activity).toHaveLength(0)
  })

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

  it('removes a hard-DELETEd location via the removed flag, without activity', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    const victim = locationRow()
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [
        mappedLocation(victim),
        mappedLocation(locationRow({ id: 'l-2', location_name: 'Other' })),
      ]
    )

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    act(() => {
      // A hard DELETE carries the row in old_record ONLY, with
      // deleted_at still null — only the op says it is gone. Dropping
      // the flag would re-insert the row as a phantom location
      // (review: mutation-confirmed coverage gap).
      rt.fire(
        'DELETE',
        broadcastMessage(
          'DELETE',
          null,
          victim as unknown as Record<string, unknown>
        )
      )
    })

    const cached = queryClient.getQueryData<CanvassLocation[]>([
      'locations',
      SEED_CASE_ID,
    ])
    expect(cached).toHaveLength(1)
    expect(cached?.some(l => l.id === victim.id)).toBe(false)
    // No activity entry / attention stamp for a card that just vanished
    // (review LOW: DELETE carries row === old and read as an update).
    expect(useCanvassStore.getState().activity).toHaveLength(0)
    expect(
      useCanvassStore.getState().attentionByLocation[victim.id]
    ).toBeUndefined()
  })

  it('never builds a cache entry that does not exist (GC resurrection)', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    // NO seeded entries: both families are absent (evicted or never
    // fetched). setQueryData with a non-functional value would BUILD the
    // query and stamp it fresh — a one-row list suppressing the real
    // refetch for up to staleTime (review HIGH).
    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({ status: 'working' }) as unknown as Record<
            string,
            unknown
          >,
          locationRow() as unknown as Record<string, unknown>
        )
      )
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          caseRow() as unknown as Record<string, unknown>,
          null,
          'cloud_cases'
        )
      )
    })

    expect(queryClient.getQueryState(['locations', SEED_CASE_ID])).toBe(
      undefined
    )
    expect(queryClient.getQueryState(['cases'])).toBe(undefined)
  })

  it('patches cloud_cases events into the cases list, mapped and ordered', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    const olderCase = mappedCase(
      caseRow({
        id: 'c-2',
        case_number: '24-CANVASS-0001',
        display_name: 'Older case',
        updated_at: '2026-07-01T00:00:00+00:00',
      })
    )
    queryClient.setQueryData(['cases'], [mappedCase(caseRow()), olderCase])

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    // An UPDATE for the SELECTED case patches ['cases'] through the
    // mapper (review: the cloud_cases branch had no hook-level coverage).
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          caseRow({
            display_name: 'Renamed canvass',
            updated_at: '2026-07-20T00:00:00+00:00',
          }) as unknown as Record<string, unknown>,
          caseRow() as unknown as Record<string, unknown>,
          'cloud_cases'
        )
      )
    })
    let cached = queryClient.getQueryData<CanvassCase[]>(['cases'])
    expect(cached).toHaveLength(2)
    expect(cached?.[0]?.displayName).toBe('Renamed canvass')
    // A view-model, not a raw row.
    expect(cached?.[0]).not.toHaveProperty('display_name')
    // The fetch's updated_at desc order is preserved by the patch.
    expect(cached?.[1]?.id).toBe('c-2')
    const activity = useCanvassStore.getState().activity
    expect(activity[0]?.kind).toBe('case-updated')
    expect(activity[0]?.summary).toBe('Renamed canvass')
    expect(activity[0]?.caseId).toBe(SEED_CASE_ID)

    // A null display_name falls back to the case number, never "null".
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          caseRow({
            display_name: null,
            updated_at: '2026-07-20T00:01:00+00:00',
          }) as unknown as Record<string, unknown>,
          null,
          'cloud_cases'
        )
      )
    })
    expect(useCanvassStore.getState().activity[0]?.summary).toBe(
      '24-CANVASS-0417'
    )

    // Archiving mirrors the fetch predicate: the case LEAVES the list
    // instead of being written back into it (review LOW).
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          caseRow({
            status: 'archived',
            updated_at: '2026-07-20T00:02:00+00:00',
          }) as unknown as Record<string, unknown>,
          null,
          'cloud_cases'
        )
      )
    })
    cached = queryClient.getQueryData<CanvassCase[]>(['cases'])
    expect(cached).toHaveLength(1)
    expect(cached?.[0]?.id).toBe('c-2')
  })

  it('labels INSERTs and unchanged-status UPDATEs distinctly', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [mappedLocation(locationRow())]
    )

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    act(() => {
      rt.fire(
        'INSERT',
        broadcastMessage(
          'INSERT',
          locationRow({
            id: 'l-new',
            location_name: 'New spot',
          }) as unknown as Record<string, unknown>,
          null
        )
      )
    })
    expect(useCanvassStore.getState().activity[0]?.kind).toBe('location-new')

    // Same status on both sides of the UPDATE: an edit, not a move.
    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({
            location_contact: 'Night manager',
          }) as unknown as Record<string, unknown>,
          locationRow() as unknown as Record<string, unknown>
        )
      )
    })
    expect(useCanvassStore.getState().activity[0]?.kind).toBe(
      'location-updated'
    )
  })

  it('cancels an in-flight refetch before patching an entry with data', () => {
    const rt = fakeRealtime()
    const queryClient = makeQueryClient()
    const cancelSpy = vi.spyOn(queryClient, 'cancelQueries')
    queryClient.setQueryData(
      ['locations', SEED_CASE_ID],
      [mappedLocation(locationRow())]
    )

    renderHook(() => useCaseRealtime(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    act(() => {
      rt.fire(
        'UPDATE',
        broadcastMessage(
          'UPDATE',
          locationRow({ status: 'working' }) as unknown as Record<
            string,
            unknown
          >,
          locationRow() as unknown as Record<string, unknown>
        )
      )
    })

    // A reconcile issued before the patch but resolving after it would
    // overwrite the patch with an older snapshot (review LOW).
    expect(cancelSpy).toHaveBeenCalledWith({
      queryKey: ['locations', SEED_CASE_ID],
    })
    // The absent ['cases'] entry was NOT cancelled (nothing to protect).
    expect(cancelSpy).not.toHaveBeenCalledWith({ queryKey: ['cases'] })
  })
})

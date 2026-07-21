import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { useHealthStore, resetHealthStore } from '@/store/health-store'
import { useSessionStore } from '@/features/cloud-session'
import { fetchMedia } from '../services/canvassService'
import { MEDIA_POLL_MS } from '../services/mediaService'
import { useMediaPolling } from '../hooks/useMediaPolling'
import { toCanvassMedia } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type { CanvassMedia, MediaRow } from '../types'
import { mediaRow, SEED_CASE_ID } from './fixtures'

vi.mock('../services/canvassService', () => ({
  fetchMedia: vi.fn(),
}))

function media(overrides: Partial<MediaRow> = {}): CanvassMedia {
  const mapped = toCanvassMedia(mediaRow(overrides))
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
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

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers()
  resetHealthStore()
  resetCanvassStore()
  useSessionStore.setState({ state: 'active' })
})

afterEach(() => {
  vi.useRealTimers()
  // Auto-cleanup unmounts AFTER this hook runs — wrap the reset so a
  // still-mounted polling hook re-renders inside act.
  act(() => {
    useSessionStore.setState({ state: 'booting' })
  })
})

describe('useMediaPolling', () => {
  // Test #85
  it('keeps polling while locked and stops only when offline/signed-out', async () => {
    useSessionStore.setState({ state: 'locked' })
    vi.mocked(fetchMedia).mockResolvedValue([])
    const queryClient = makeQueryClient()

    renderHook(() => useMediaPolling(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })

    await advance(0)
    expect(fetchMedia).toHaveBeenCalledTimes(1)

    // `locked` ⇒ interval ENABLED — a wall board is idle most of its
    // life; lock stops interaction, never data (doc 01 §5.4).
    await advance(MEDIA_POLL_MS + 50)
    expect(fetchMedia).toHaveBeenCalledTimes(2)

    // `offline` ⇒ the poll gate closes.
    act(() => {
      useHealthStore.setState({ state: 'offline' })
    })
    await advance(2 * MEDIA_POLL_MS)
    expect(fetchMedia).toHaveBeenCalledTimes(2)

    // Any non-offline health state polls again (canPoll).
    act(() => {
      useHealthStore.setState({ state: 'reconnecting' })
    })
    await advance(MEDIA_POLL_MS + 50)
    expect(vi.mocked(fetchMedia).mock.calls.length).toBeGreaterThanOrEqual(3)
    const afterRecovery = vi.mocked(fetchMedia).mock.calls.length

    // A torn-down session stops the poll entirely.
    act(() => {
      useSessionStore.setState({ state: 'signed-out' })
    })
    await advance(2 * MEDIA_POLL_MS)
    expect(fetchMedia).toHaveBeenCalledTimes(afterRecovery)
  })

  // Flow D2 wiring (unnumbered regression arms for #82/#84's consumer).
  it('announces newly arrived media with attribution — never the initial backlog', async () => {
    const seeded = media({ id: 'm-a' })
    vi.mocked(fetchMedia).mockResolvedValueOnce([seeded])
    const queryClient = makeQueryClient()

    renderHook(() => useMediaPolling(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })
    await advance(0)

    // The first load is the baseline — a board mounting over 7 seeded
    // objects must not blast 7 media-new pulses.
    expect(useCanvassStore.getState().activity).toHaveLength(0)

    const fresh = media({
      id: 'm-b',
      filename: 'new-photo.jpg',
      location_id: 'loc-2',
    })
    vi.mocked(fetchMedia).mockResolvedValueOnce([seeded, fresh])
    await advance(MEDIA_POLL_MS + 50)

    const activity = useCanvassStore.getState().activity
    expect(activity).toHaveLength(1)
    expect(activity[0]?.kind).toBe('media-new')
    expect(activity[0]?.locationId).toBe('loc-2')
    expect(activity[0]?.summary).toContain('new-photo.jpg')
    // Attention stamped on the location (marker pulse / card highlight).
    expect(
      useCanvassStore.getState().attentionByLocation['loc-2']
    ).toBeDefined()
  })

  it('re-baselines on a case switch — the next case backlog is not news', async () => {
    vi.mocked(fetchMedia).mockResolvedValueOnce([media({ id: 'm-a' })])
    const queryClient = makeQueryClient()

    const hook = renderHook(
      ({ caseId }: { caseId: string | null }) => useMediaPolling(caseId),
      {
        wrapper: wrapperFor(queryClient),
        initialProps: { caseId: SEED_CASE_ID as string | null },
      }
    )
    await advance(0)
    expect(useCanvassStore.getState().activity).toHaveLength(0)

    // Switch to another case whose media is entirely different rows.
    vi.mocked(fetchMedia).mockResolvedValueOnce([
      media({ id: 'm-x', case_id: 'case-2' }),
      media({ id: 'm-y', case_id: 'case-2' }),
    ])
    hook.rerender({ caseId: 'case-2' })
    await advance(0)

    // Two unknown ids arrived — but across a case switch that is a new
    // baseline, not two pulses of cross-case noise.
    expect(useCanvassStore.getState().activity).toHaveLength(0)
  })

  it('feeds poll failures to health and retries next tick, no per-tick noise', async () => {
    vi.mocked(fetchMedia)
      .mockRejectedValueOnce(new Error('tick failed'))
      .mockResolvedValue([])
    const queryClient = makeQueryClient()

    renderHook(() => useMediaPolling(SEED_CASE_ID), {
      wrapper: wrapperFor(queryClient),
    })
    await advance(0)

    // The failure is a health signal (G4), not a toast.
    expect(useHealthStore.getState().marks.lastFetchErrorAt).not.toBeNull()

    // Next tick retries on its own.
    await advance(MEDIA_POLL_MS + 50)
    expect(fetchMedia).toHaveBeenCalledTimes(2)
    expect(useHealthStore.getState().marks.lastFetchOkAt).not.toBeNull()
  })
})

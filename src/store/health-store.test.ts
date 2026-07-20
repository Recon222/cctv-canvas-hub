import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach } from 'vitest'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import {
  useHealthStore,
  evaluate,
  canPoll,
  resetHealthStore,
  STALE_AFTER_MS,
  SIGNED_URL_KEY_PREFIX,
  type HealthMarks,
} from './health-store'

function marks(overrides: Partial<HealthMarks> = {}): HealthMarks {
  return {
    online: true,
    channel: null,
    lastEventAt: null,
    lastFetchOkAt: null,
    lastFetchErrorAt: null,
    startedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetHealthStore()
})

describe('health-store', () => {
  // Test #61
  it('reports live while confirmations are fresh', () => {
    const now = 1_000_000
    expect(
      evaluate(
        marks({ channel: 'subscribed', lastFetchOkAt: now - 1_000 }),
        now
      )
    ).toBe('live')
    expect(
      evaluate(marks({ channel: 'subscribed', lastEventAt: now - 5_000 }), now)
    ).toBe('live')

    // Store path: subscribe + a positive confirmation ⇒ live.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchOk()
    expect(useHealthStore.getState().state).toBe('live')
    useHealthStore.getState().recordEvent()
    expect(useHealthStore.getState().state).toBe('live')
  })

  // Test #62
  it('degrades to stale after the silence threshold', () => {
    expect(STALE_AFTER_MS).toBe(90_000)
    const now = 1_000_000
    // A confirm older than the threshold is no longer a confirm.
    expect(
      evaluate(
        marks({
          channel: 'subscribed',
          lastFetchOkAt: now - STALE_AFTER_MS - 1,
        }),
        now
      )
    ).toBe('stale')
    // Silence since boot with no confirmation at all goes stale too.
    expect(evaluate(marks({ startedAt: now - STALE_AFTER_MS - 1 }), now)).toBe(
      'stale'
    )

    // Store path: a live board left silent past the threshold degrades on
    // the next evaluate tick.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchOk()
    expect(useHealthStore.getState().state).toBe('live')
    useHealthStore.getState().reevaluate(Date.now() + STALE_AFTER_MS + 1)
    expect(useHealthStore.getState().state).toBe('stale')
  })

  // Test #65
  it('only upgrades on positive confirmation', () => {
    const now = 1_000_000
    // Channel SUBSCRIBED alone is not a confirmation — still connecting.
    expect(
      evaluate(marks({ channel: 'subscribed', startedAt: now }), now)
    ).toBe('connecting')
    // A dropped channel is reconnecting even with a fresh fetch — the live
    // badge requires the channel.
    expect(
      evaluate(marks({ channel: 'error', lastFetchOkAt: now - 1_000 }), now)
    ).toBe('reconnecting')
    expect(
      evaluate(marks({ channel: 'closed', lastFetchOkAt: now - 1_000 }), now)
    ).toBe('reconnecting')
    // Offline wins over everything.
    expect(
      evaluate(
        marks({ online: false, channel: 'subscribed', lastFetchOkAt: now }),
        now
      )
    ).toBe('offline')
    // A fetch error never upgrades: it stamps evidence, not confirmation.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchError()
    expect(useHealthStore.getState().state).toBe('connecting')
  })
})

describe('useConnectionHealth (2.5B)', () => {
  function mountHook() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    })
    function Wrapper({ children }: { children: React.ReactNode }) {
      return React.createElement(
        QueryClientProvider,
        { client: queryClient },
        children
      )
    }
    const rendered = renderHook(() => useConnectionHealth(), {
      wrapper: Wrapper,
    })
    return { queryClient, rendered }
  }

  // Test #63
  it('reports reconnecting on channel drop and invalidates case data on resubscribe', () => {
    const { queryClient } = mountHook()
    queryClient.setQueryData(['cases'], [])
    queryClient.setQueryData(['locations', 'c1'], [])
    queryClient.setQueryData(
      [SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'],
      'https://signed.example'
    )

    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
      useHealthStore.getState().recordFetchOk()
    })
    expect(useHealthStore.getState().state).toBe('live')

    // Drop: supabase-js is retrying underneath — honest amber, not live.
    act(() => {
      useHealthStore.getState().channelStatus('error')
    })
    expect(useHealthStore.getState().state).toBe('reconnecting')

    // Resubscribe: catch-up invalidation of case-data queries ONLY —
    // signed URLs refresh on their own interval (AD11).
    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
    })
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['locations', 'c1'])?.isInvalidated).toBe(
      true
    )
    expect(
      queryClient.getQueryState([SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'])
        ?.isInvalidated
    ).toBe(false)
  })

  // Test #64
  it('reports offline from the browser signal and pauses the polling gate', () => {
    const { queryClient } = mountHook()
    queryClient.setQueryData(['cases'], [])

    act(() => {
      window.dispatchEvent(new Event('offline'))
    })
    expect(useHealthStore.getState().state).toBe('offline')
    // The gate every poll loop checks (doc 01 §5.4: offline pauses polling).
    expect(canPoll(useHealthStore.getState().state)).toBe(false)

    // Back online: state leaves offline and case data catches up.
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(useHealthStore.getState().state).not.toBe('offline')
    expect(canPoll(useHealthStore.getState().state)).toBe(true)
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
  })
})

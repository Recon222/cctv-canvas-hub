import React from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import {
  useHealthStore,
  evaluate,
  canPoll,
  lastConfirmAt,
  resetHealthStore,
  STALE_AFTER_MS,
  RECONCILE_MS,
  FETCH_BUDGET_MS,
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

describe('cadence invariant', () => {
  // The reconcile fetch is the ONLY positive liveness confirmation on a
  // silent agency — and the only confirmation AT ALL on the
  // no-case-selected views (cases + counts). PR #8 H1: the previous
  // one-cycle form (`RECONCILE_MS < STALE_AFTER_MS`) protected a
  // breakable invariant — settle-based restart (TanStack schedules the
  // next fetch AFTER the previous settles, so RTT compounds per cycle)
  // or a single failed/slow cycle pushed the next confirmation past the
  // threshold and flashed a false red "do not trust as live" banner on
  // a healthy idle board. The real invariant is TWO full cycles plus
  // the jitter budget inside the threshold: one missed reconcile must
  // never paint STALE. (Lineage: PR #4 round-2 mutation proved 300_000
  // passed a green suite; PR #8 proved 60_000 passed the one-cycle
  // tripwire while breachable in practice.)
  it('keeps a full missed reconcile cycle inside the stale threshold', () => {
    expect(2 * RECONCILE_MS + FETCH_BUDGET_MS).toBeLessThanOrEqual(
      STALE_AFTER_MS
    )
  })

  it('does not flash stale across one missed reconcile cycle', () => {
    // Worst honest case on a landing view: confirm at t0, the next
    // cycle's fetch FAILS (stamps an error, no confirm), and the
    // recovery cycle lands as late as the jitter budget allows.
    const t0 = 1_000_000
    const worst = marks({
      channel: 'subscribed',
      lastFetchOkAt: t0,
      lastFetchErrorAt: t0 + RECONCILE_MS,
    })
    const recoveryDue = t0 + 2 * RECONCILE_MS + FETCH_BUDGET_MS
    // Amber (error newer than the confirm) is the honest render here —
    // degraded, retrying. Never the red stale banner before the
    // recovery cycle has had its chance to land.
    expect(evaluate(worst, recoveryDue)).toBe('reconnecting')
  })
})

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

  it('degrades when a fetch error is newer than the last confirm', () => {
    const now = 1_000_000
    // The socket delivering while PostgREST 500s must not read `live` —
    // lastFetchErrorAt was a write-only mark (review MEDIUM).
    expect(
      evaluate(
        marks({
          channel: 'subscribed',
          lastEventAt: now - 1_000,
          lastFetchErrorAt: now - 500,
        }),
        now
      )
    ).toBe('reconnecting')
    // An error OLDER than the latest confirm does not mask a recovered
    // data plane.
    expect(
      evaluate(
        marks({
          channel: 'subscribed',
          lastEventAt: now - 500,
          lastFetchErrorAt: now - 1_000,
        }),
        now
      )
    ).toBe('live')

    // Store path: a live board whose reconcile starts failing degrades.
    vi.useFakeTimers()
    try {
      useHealthStore.getState().channelStatus('subscribed')
      useHealthStore.getState().recordFetchOk()
      expect(useHealthStore.getState().state).toBe('live')
      vi.advanceTimersByTime(1_000)
      useHealthStore.getState().recordFetchError()
      expect(useHealthStore.getState().state).toBe('reconnecting')
    } finally {
      vi.useRealTimers()
    }
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

describe('lastConfirmAt (5.2, §5.4 A2 binding)', () => {
  // The indicator's displayed timestamp is max(lastEventAt, lastFetchOkAt)
  // — binding to lastEventAt alone renders "updated —" beside a green dot
  // on a silent overnight board (reconciles confirm, broadcasts don't).
  it('is the max of the event and fetch confirmations', () => {
    expect(lastConfirmAt(marks({ lastEventAt: 500, lastFetchOkAt: 900 }))).toBe(
      900
    )
    expect(
      lastConfirmAt(marks({ lastEventAt: 1_200, lastFetchOkAt: 900 }))
    ).toBe(1_200)
    // Either plane alone is a confirmation.
    expect(lastConfirmAt(marks({ lastFetchOkAt: 900 }))).toBe(900)
    expect(lastConfirmAt(marks({ lastEventAt: 700 }))).toBe(700)
    // No confirmation yet ⇒ null (the chip renders its designed
    // "awaiting first confirm" copy, never a fake time).
    expect(lastConfirmAt(marks())).toBeNull()
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
    queryClient.setQueryData(['location-counts', ['c1']], {})
    queryClient.setQueryData(
      [SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'],
      'https://signed.example'
    )
    // A family the catch-up has no business touching (review LOW: the
    // deny-list predicate matched every query in the app).
    queryClient.setQueryData(['preferences'], { theme: 'dark' })

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

    // Resubscribe: catch-up invalidation of the case-data allow-list
    // ONLY — signed URLs refresh on their own interval (AD11), and
    // non-case families stay untouched.
    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
    })
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
    expect(queryClient.getQueryState(['locations', 'c1'])?.isInvalidated).toBe(
      true
    )
    expect(
      queryClient.getQueryState(['location-counts', ['c1']])?.isInvalidated
    ).toBe(true)
    expect(
      queryClient.getQueryState([SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'])
        ?.isInvalidated
    ).toBe(false)
    expect(queryClient.getQueryState(['preferences'])?.isInvalidated).toBe(
      false
    )
  })

  // Guard negatives (review HIGH: mutation-confirmed gap — replacing the
  // guard's previous-status conditions with `true` left the suite green
  // while every health mark triggered a full invalidation storm).
  it('does NOT invalidate on the initial null → subscribed transition', () => {
    const { queryClient } = mountHook()
    queryClient.setQueryData(['cases'], [])

    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
    })

    // First subscribe is not a reconnect: no duplicate full fetch.
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
  })

  it('does NOT invalidate on health marks while already subscribed', () => {
    const { queryClient } = mountHook()
    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
    })
    queryClient.setQueryData(['cases'], [])

    // recordFetchOk → invalidate → refetch → recordFetchOk → … would be
    // an unbounded refetch loop against Supabase.
    act(() => {
      useHealthStore.getState().recordFetchOk()
    })
    expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
  })

  it('reaches stale through the interval tick alone, and stops on unmount', () => {
    vi.useFakeTimers()
    try {
      const { queryClient, rendered } = mountHook()
      queryClient.setQueryData(['cases'], [])
      act(() => {
        useHealthStore.getState().channelStatus('subscribed')
        useHealthStore.getState().recordFetchOk()
      })
      expect(useHealthStore.getState().state).toBe('live')

      // A silent app: no events, no fetches. The interval is the ONLY
      // mechanism that can notice (review: untested production path).
      act(() => {
        vi.advanceTimersByTime(STALE_AFTER_MS + 10_001)
      })
      expect(useHealthStore.getState().state).toBe('stale')

      // Teardown: after unmount, neither the interval nor the store
      // subscription may keep firing.
      act(() => {
        useHealthStore.getState().recordFetchOk()
      })
      expect(useHealthStore.getState().state).toBe('live')
      rendered.unmount()
      act(() => {
        vi.advanceTimersByTime(STALE_AFTER_MS + 10_001)
      })
      // A leaked interval would have re-evaluated to stale.
      expect(useHealthStore.getState().state).toBe('live')
      // A leaked store subscription would invalidate on resubscribe.
      act(() => {
        useHealthStore.getState().channelStatus('error')
        useHealthStore.getState().channelStatus('subscribed')
      })
      expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
      // A leaked online listener would invalidate too.
      act(() => {
        window.dispatchEvent(new Event('online'))
      })
      expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('re-evaluates when the document becomes visible', () => {
    vi.useFakeTimers()
    try {
      mountHook()
      act(() => {
        useHealthStore.getState().channelStatus('subscribed')
        useHealthStore.getState().recordFetchOk()
      })
      expect(useHealthStore.getState().state).toBe('live')

      // Advance the CLOCK without running the interval: a laptop waking
      // from sleep sees time jump with no ticks in between.
      vi.setSystemTime(Date.now() + STALE_AFTER_MS + 1_000)
      expect(useHealthStore.getState().state).toBe('live') // not yet noticed

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(useHealthStore.getState().state).toBe('stale')
    } finally {
      vi.useRealTimers()
    }
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

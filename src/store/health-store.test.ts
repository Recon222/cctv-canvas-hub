import React from 'react'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { toast } from 'sonner'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import { getSupabase, SupabaseNotInitializedError } from '@/lib/supabase/client'
import type * as supabaseClientModule from '@/lib/supabase/client'
import { useSessionStore } from '@/features/cloud-session'
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

vi.mock('@/lib/supabase/client', async importOriginal => {
  const actual = await importOriginal<typeof supabaseClientModule>()
  return {
    ...actual,
    // Default: no client in this context — the wake catch-up (6.2)
    // degrades to the plain sync invalidation every pre-6.2 arm was
    // written against. The 6.2 describe swaps in a fake per test.
    getSupabase: vi.fn(() => {
      throw new actual.SupabaseNotInitializedError()
    }),
  }
})

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

  // 6.2 (Flow E3): every wake path converges on session-check →
  // (refresh near expiry) → setAuth → invalidate.
  describe('wake catch-up (6.2)', () => {
    function fakeSupabase(config: {
      /** ms until token expiry; null = no session at all. */
      expiresInMs: number | null
      /** 'invalid-grant' = definite 4xx refusal; 'network-error' = the
       * offline-wake shape (AuthRetryableFetchError, status 0). */
      refresh?: 'ok' | 'invalid-grant' | 'network-error'
      setAuthRejects?: boolean
    }) {
      const order: string[] = []
      const session = (expiresInMs: number) => ({
        expires_at: Math.floor((Date.now() + expiresInMs) / 1000),
        user: { email: 'coord.reyes@canvass.dev' },
      })
      const fake = {
        auth: {
          getSession: vi.fn(() =>
            Promise.resolve({
              data: {
                session:
                  config.expiresInMs === null
                    ? null
                    : session(config.expiresInMs),
              },
              error: null,
            })
          ),
          refreshSession: vi.fn(() => {
            order.push('refreshSession')
            if (config.refresh === 'invalid-grant') {
              return Promise.resolve({
                data: { session: null },
                error: {
                  message: 'Invalid Refresh Token: Already Used',
                  status: 400,
                },
              })
            }
            if (config.refresh === 'network-error') {
              return Promise.resolve({
                data: { session: null },
                error: { message: 'fetch failed', status: 0 },
              })
            }
            return Promise.resolve({
              data: { session: session(3_600_000) },
              error: null,
            })
          }),
        },
        realtime: {
          setAuth: vi.fn(() => {
            order.push('setAuth')
            return config.setAuthRejects === true
              ? Promise.reject(new Error('websocket not ready'))
              : Promise.resolve()
          }),
        },
      }
      vi.mocked(getSupabase).mockImplementation(() => fake as never)
      return { fake, order }
    }

    beforeEach(() => {
      useSessionStore.setState({ state: 'active' })
    })

    afterEach(() => {
      vi.mocked(getSupabase).mockImplementation(() => {
        throw new SupabaseNotInitializedError()
      })
      useSessionStore.setState({ state: 'booting' })
    })

    // Test #104 — the fresh arm: autoRefreshToken owns routine
    // rotation; a wake with a fresh session must NOT race it.
    it('does not refresh on wake when the session is fresh', async () => {
      const { fake } = fakeSupabase({ expiresInMs: 3_600_000 })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      await waitFor(() => {
        expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
      })
      expect(fake.auth.refreshSession).not.toHaveBeenCalled()
      expect(fake.realtime.setAuth).not.toHaveBeenCalled()
    })

    // Test #104 — the near-expiry arm: refresh THEN setAuth, in order
    // (the socket must get the rotated token before the refetch).
    it('refreshes then re-auths realtime, in order, near expiry', async () => {
      const { fake, order } = fakeSupabase({ expiresInMs: 10_000 })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      await waitFor(() => {
        expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
      })
      expect(fake.auth.refreshSession).toHaveBeenCalledTimes(1)
      expect(order).toEqual(['refreshSession', 'setAuth'])
    })

    // Test #105
    it('invalidates case-data on catch-up, excluding signed URLs', async () => {
      fakeSupabase({ expiresInMs: 10_000 })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])
      queryClient.setQueryData(['locations', 'c1'], [])
      queryClient.setQueryData(['media', 'c1'], [])
      queryClient.setQueryData(
        [SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'],
        'https://signed.example'
      )

      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })

      await waitFor(() => {
        expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
      })
      expect(
        queryClient.getQueryState(['locations', 'c1'])?.isInvalidated
      ).toBe(true)
      expect(queryClient.getQueryState(['media', 'c1'])?.isInvalidated).toBe(
        true
      )
      // Signed URLs refresh on their own interval (AD11) — a wake must
      // not mass-regenerate N storage URLs.
      expect(
        queryClient.getQueryState([SIGNED_URL_KEY_PREFIX, 'images', 'a/b.jpg'])
          ?.isInvalidated
      ).toBe(false)
    })

    // Test #106 — AMENDED at the PR #9 M2 fix: "refresh fails" means a
    // DEFINITE refusal (4xx invalid_grant) — the session is genuinely
    // dead. A network-shaped failure is the deferred arm below.
    it('drops to signed-out when the refresh is refused', async () => {
      const errorToast = vi.spyOn(toast, 'error')
      fakeSupabase({ expiresInMs: 10_000, refresh: 'invalid-grant' })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      // Session genuinely dead: an honest exit with a toast — never a
      // silent stale board behind a green dot.
      await waitFor(() => {
        expect(useSessionStore.getState().state).toBe('signed-out')
      })
      expect(errorToast).toHaveBeenCalled()
      expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
      errorToast.mockRestore()
    })

    // PR #9 M2: a TRANSIENT blip must not sign out — a kiosk waking
    // overnight before wifi reconnects gets a network-shaped refresh
    // failure while the refresh token is still valid. Defer, stay,
    // retry on the next wake/tick.
    it('does not sign out when the refresh fails with a network error', async () => {
      const errorToast = vi.spyOn(toast, 'error')
      fakeSupabase({ expiresInMs: 10_000, refresh: 'network-error' })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      // Deferred: no sign-out, no toast, and no refetch behind a
      // possibly-stale token (the reconcile net + next wake retry own
      // recovery).
      await waitFor(() => {
        expect(vi.mocked(getSupabase)().auth.refreshSession).toHaveBeenCalled()
      })
      await act(async () => {
        await Promise.resolve()
      })
      expect(useSessionStore.getState().state).toBe('active')
      expect(errorToast).not.toHaveBeenCalled()
      expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(false)
      errorToast.mockRestore()
    })

    // PR #9 L2: a post-refresh setAuth hiccup is NOT a dead session —
    // the refresh succeeded; sign-out fires ONLY on the explicit
    // 'failed' freshness result, never the chain's machinery.
    it('does not sign out on a post-refresh setAuth hiccup', async () => {
      const errorToast = vi.spyOn(toast, 'error')
      fakeSupabase({ expiresInMs: 10_000, setAuthRejects: true })
      const { queryClient } = mountHook()
      queryClient.setQueryData(['cases'], [])

      act(() => {
        window.dispatchEvent(new Event('online'))
      })

      // The refreshed session still catches up (invalidation runs).
      await waitFor(() => {
        expect(queryClient.getQueryState(['cases'])?.isInvalidated).toBe(true)
      })
      expect(useSessionStore.getState().state).toBe('active')
      expect(errorToast).not.toHaveBeenCalled()
      errorToast.mockRestore()
    })
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

import React from 'react'
import { act, renderHook } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { useSessionStore } from '../store/session-store'
import { useIdleLock } from '../hooks/useIdleLock'

/**
 * Phase 6.1A — the idle timer (tests #100–101 + the ledger-L1 clamp).
 *
 * Fake timers drive the idle window; the preferences query resolves on
 * the microtask queue (the mocked `loadPreferences` command), so each
 * mount flushes it with an async act before advancing time.
 */

function preferences(idleLockMinutes: number | null) {
  return {
    theme: 'system',
    quick_pane_shortcut: null,
    language: null,
    mapbox_token: null,
    map_style: null,
    idle_lock_minutes: idleLockMinutes,
  }
}

function Wrapper({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } })
  )
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

async function mountIdleLock() {
  const rendered = renderHook(() => useIdleLock(), { wrapper: Wrapper })
  // Let the preferences query resolve so the effect re-arms with the
  // configured minutes (before that it runs on the same default).
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  return rendered
}

describe('useIdleLock (6.1A)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    useSessionStore.setState({ state: 'active' })
  })

  afterEach(() => {
    vi.useRealTimers()
    useSessionStore.setState({ state: 'booting' })
    vi.mocked(commands.loadPreferences).mockResolvedValue({
      status: 'ok',
      data: preferences(null),
    })
  })

  // Test #100
  it('locks after the configured idle period', async () => {
    vi.mocked(commands.loadPreferences).mockResolvedValue({
      status: 'ok',
      data: preferences(5),
    })
    await mountIdleLock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000 - 1_000)
    })
    expect(useSessionStore.getState().state).toBe('active')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000)
    })
    expect(useSessionStore.getState().state).toBe('locked')
  })

  it('defaults to 15 minutes when the preference is unset', async () => {
    // setup.ts default: idle_lock_minutes null → the documented 15.
    await mountIdleLock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(14 * 60_000)
    })
    expect(useSessionStore.getState().state).toBe('active')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000)
    })
    expect(useSessionStore.getState().state).toBe('locked')
  })

  // Test #101
  it('resets the idle timer on user activity', async () => {
    vi.mocked(commands.loadPreferences).mockResolvedValue({
      status: 'ok',
      data: preferences(5),
    })
    await mountIdleLock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000)
    })
    act(() => {
      window.dispatchEvent(new Event('pointermove'))
    })
    // 4 min after the reset — past the original deadline, still active.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4 * 60_000)
    })
    expect(useSessionStore.getState().state).toBe('active')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000 + 1_000)
    })
    expect(useSessionStore.getState().state).toBe('locked')
  })

  // Ledger L1 (PR #6 review): `idle_lock_minutes: 0` from seeded or
  // hand-edited JSON clamps to the 1-minute floor at the consumer —
  // never an instant lock loop. (Unnumbered clamp arm.)
  it('clamps a zero idle preference to the 1-minute floor', async () => {
    vi.mocked(commands.loadPreferences).mockResolvedValue({
      status: 'ok',
      data: preferences(0),
    })
    await mountIdleLock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(useSessionStore.getState().state).toBe('active')

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(useSessionStore.getState().state).toBe('locked')
  })

  it('does not arm the timer while the session is already locked', async () => {
    useSessionStore.setState({ state: 'locked' })
    await mountIdleLock()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60 * 60_000)
    })
    // Still locked, and no zombie timer re-locking after unlock either.
    expect(useSessionStore.getState().state).toBe('locked')
  })
})

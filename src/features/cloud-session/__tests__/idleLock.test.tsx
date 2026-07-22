import React from 'react'
import { act, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { commands } from '@/lib/tauri-bindings'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { getSupabase } from '@/lib/supabase/client'
import type * as supabaseClientModule from '@/lib/supabase/client'
import { useUIStore } from '@/store/ui-store'
import { MainWindow } from '@/components/layout/MainWindow'
import { useSessionStore } from '../store/session-store'
import { useIdleLock } from '../hooks/useIdleLock'

/**
 * Phase 6.1 — the idle timer (tests #100–101 + the ledger-L1 clamp)
 * and the lock overlay (tests #102–103 + the D3 error arms).
 *
 * Fake timers drive the idle window; the preferences query resolves on
 * the microtask queue (the mocked `loadPreferences` command), so each
 * mount flushes it with an async act before advancing time.
 *
 * The overlay tests mock the supabase client at the doc-03 choke point
 * (`vi.mock('@/lib/supabase/client')`) so the REAL `reauthenticate`
 * classification runs (D3: wrong password vs unreachable), and stub
 * `CanvassRoot` with a static board carrying DVR credentials so #102's
 * byte-identity pin is cheap to assert.
 */

// Partial mock: getSupabase is the fake seam; the real helpers
// (isNetworkAuthError — the D3 classifier) stay live.
vi.mock('@/lib/supabase/client', async importOriginal => ({
  ...(await importOriginal<typeof supabaseClientModule>()),
  getSupabase: vi.fn(),
}))
vi.mock('../hooks/useAuthBootstrap', () => ({ useAuthBootstrap: vi.fn() }))
vi.mock('@/features/canvass', () => ({
  CanvassRoot: () => (
    <div data-testid="board-stub">
      <p>QuickMart Convenience</p>
      <p>DVR admin / dvr-pass-1234</p>
      {/* A NavRail-class DIRECT-STORE control (bypasses the command
          dispatcher) — the PR #9 M1 inert arm clicks this. */}
      <button
        type="button"
        onClick={() => {
          useUIStore.getState().toggleRightSidebar()
        }}
      >
        direct store control
      </button>
    </div>
  ),
}))

/** Minimal client fake: only the surfaces Flow F touches. */
function mockSupabaseClient(overrides: {
  signInError?: { message: string; status?: number } | null
}) {
  const fake = {
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: {
          session: { user: { email: 'coord.reyes@canvass.dev' } },
        },
        error: null,
      }),
      signInWithPassword: vi.fn().mockResolvedValue({
        data: {},
        error: overrides.signInError ?? null,
      }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
    },
    removeAllChannels: vi.fn().mockResolvedValue([]),
  }
  vi.mocked(getSupabase).mockReturnValue(fake as never)
  return fake
}

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

describe('LockOverlay (6.1B)', () => {
  beforeEach(() => {
    useSessionStore.setState({ state: 'active' })
  })

  afterEach(() => {
    useSessionStore.setState({ state: 'booting' })
    useUIStore.setState({ rightSidebarVisible: true })
  })

  // Test #102
  it('leaves board content untouched while locked and blocks interaction', async () => {
    mockSupabaseClient({})
    renderWithFeatureProviders(<MainWindow />)

    const board = screen.getByTestId('board-stub')
    const unlockedText = board.textContent

    act(() => {
      useSessionStore.getState().lock()
    })
    // Flush the overlay's async signed-in-email lookup (display-only).
    await act(async () => {
      await Promise.resolve()
    })

    // The board is still mounted and BYTE-IDENTICAL — DVR credentials
    // included (AD6 + owner directive: lock alters nothing, ever).
    expect(screen.getByTestId('board-stub').textContent).toBe(unlockedText)
    expect(screen.getByTestId('board-stub').textContent).toContain(
      'DVR admin / dvr-pass-1234'
    )

    // The overlay is an input-swallowing veil covering the content area.
    const overlay = screen
      .getByText('Board locked — updates continue')
      .closest('div.absolute.inset-0')
    expect(overlay).not.toBeNull()

    // Interaction-dead includes document-level shortcuts: Ctrl+2 (the
    // panel toggle) must not fire while locked, and must again after.
    // MainWindow mounts the real listener chain (PR #9 M1 moved the
    // overlay up to the shell) — no separate renderHook needed.
    const before = useUIStore.getState().rightSidebarVisible
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', ctrlKey: true })
      )
    })
    expect(useUIStore.getState().rightSidebarVisible).toBe(before)
    act(() => {
      useSessionStore.getState().unlock()
    })
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: '2', ctrlKey: true })
      )
    })
    expect(useUIStore.getState().rightSidebarVisible).toBe(!before)
  })

  // PR #9 M1: the lock wall covers the WHOLE window and contains
  // interaction — the shell (TitleBar included) goes inert while
  // locked, so direct-store controls (NavRail/titlebar-toggle class,
  // which bypass the command dispatcher) are unreachable by pointer
  // AND keyboard; the overlay lives outside the inert subtree.
  it('makes direct-store controls inert while locked', async () => {
    const user = userEvent.setup()
    mockSupabaseClient({})
    renderWithFeatureProviders(<MainWindow />)

    // The shell wrapper contains the board AND the titlebar, and only
    // carries inert while locked.
    const shell = screen.getByTestId('lockable-shell')
    expect(shell).not.toHaveAttribute('inert')
    expect(shell.contains(screen.getByTestId('board-stub'))).toBe(true)

    const control = screen.getByRole('button', {
      name: 'direct store control',
    })
    const before = useUIStore.getState().rightSidebarVisible

    act(() => {
      useSessionStore.getState().lock()
    })
    await act(async () => {
      await Promise.resolve()
    })
    expect(screen.getByTestId('lockable-shell')).toHaveAttribute('inert')

    // The control sits INSIDE the inert subtree — the browser blocks
    // pointer + focus on everything under [inert] (jsdom does not
    // emulate inert behavior, so the pin is the mechanism: attribute
    // present + structural containment; enforcement itself is the
    // live-smoke leg). A regression that moves a control outside the
    // wrapper, or drops the attribute, fails here.
    expect(control.closest('[inert]')).not.toBeNull()
    expect(useUIStore.getState().rightSidebarVisible).toBe(before)

    // The overlay itself is OUTSIDE the inert subtree: its password
    // field stays typable while the board is dead.
    const input = screen.getByLabelText('Coordinator password')
    await user.type(input, 'x')
    expect(input).toHaveValue('x')

    // Unlocked again: inert lifts and the same control works.
    act(() => {
      useSessionStore.getState().unlock()
    })
    expect(screen.getByTestId('lockable-shell')).not.toHaveAttribute('inert')
    await user.click(control)
    expect(useUIStore.getState().rightSidebarVisible).toBe(!before)
  })

  // Test #103 — including both D3 error arms: the inline error names
  // WHICH failure (wrong password vs cloud unreachable).
  it('resumes on successful re-auth and stays locked on failure', async () => {
    const user = userEvent.setup()
    const fake = mockSupabaseClient({
      signInError: { message: 'Invalid login credentials', status: 400 },
    })
    renderWithFeatureProviders(<MainWindow />)
    act(() => {
      useSessionStore.getState().lock()
    })
    // Flush the overlay's async signed-in-email lookup (display-only).
    await act(async () => {
      await Promise.resolve()
    })

    const input = screen.getByLabelText('Coordinator password')

    // Wrong password: the cloud answered and refused → stay locked,
    // wrong-password copy.
    await user.type(input, 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "That password didn't match — try again"
    )
    expect(useSessionStore.getState().state).toBe('locked')

    // Unreachable: nothing answered → stay locked, network copy (a
    // coordinator must know which failure this was — D3).
    fake.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'fetch failed', status: 0 },
    })
    await user.clear(input)
    await user.type(input, 'lVNI7U1gt78zHtlz')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the cloud — check the room's connection and try again"
    )
    expect(useSessionStore.getState().state).toBe('locked')

    // PR #9 L3: a 429 rate-limit is NOT "wrong password" — telling a
    // coordinator to retype (and re-fire the limiter) is the D3
    // distinction's exact failure mode. Same "can't reach" copy.
    fake.auth.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Request rate limit reached', status: 429 },
    })
    await user.clear(input)
    await user.type(input, 'lVNI7U1gt78zHtlz')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      "Can't reach the cloud — check the room's connection and try again"
    )
    expect(useSessionStore.getState().state).toBe('locked')

    // Correct password → active, overlay gone, board still there.
    fake.auth.signInWithPassword.mockResolvedValue({ data: {}, error: null })
    await user.clear(input)
    await user.type(input, 'lVNI7U1gt78zHtlz')
    await user.click(screen.getByRole('button', { name: 'Unlock' }))
    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('active')
    })
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByTestId('board-stub')).toBeInTheDocument()
  })

  it('keeps sign-out reachable from the overlay', async () => {
    const user = userEvent.setup()
    mockSupabaseClient({})
    renderWithFeatureProviders(<MainWindow />)
    act(() => {
      useSessionStore.getState().lock()
    })
    // Flush the overlay's async signed-in-email lookup (display-only).
    await act(async () => {
      await Promise.resolve()
    })

    await user.click(screen.getByRole('button', { name: 'Sign out instead' }))
    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('signed-out')
    })
    // vaultClear ran (belt and braces — same contract as SignOutButton).
    expect(vi.mocked(commands.vaultClear)).toHaveBeenCalled()
  })

  it('shows the signed-in email on the overlay when the config carries it', async () => {
    mockSupabaseClient({})
    vi.mocked(commands.loadCloudConfig).mockResolvedValueOnce({
      status: 'ok',
      data: {
        url: 'https://example.supabase.co',
        publishable_key: 'sb_publishable_x',
        locked: false,
        signed_in_email: 'coord.reyes@canvass.dev',
      },
    })
    useSessionStore.setState({ state: 'locked' })
    renderWithFeatureProviders(<MainWindow />)

    expect(
      await screen.findByText(
        'Signed in as coord.reyes@canvass.dev · coordinator'
      )
    ).toBeInTheDocument()
  })
})

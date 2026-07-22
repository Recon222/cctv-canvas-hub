/**
 * M7 multi-window tests (A1/AD13). Part 1 — the MAIN-window side
 * (#112–113, #119, #121): the rail pop-out affordance, the view-window
 * service contract, and the bridge that answers secondaries without
 * ever touching main's own board state. Part 2 — the SECONDARY side
 * (#117–118): SecondaryRoot's handshake boot, per-context stores, and
 * the session-ended teardown/purge.
 *
 * `sessionEvents` is mocked at the module seam: emitters are spies and
 * the `on*` listeners capture their handlers so tests can drive the
 * cross-window events synchronously.
 */

import { screen, waitFor, act } from '@testing-library/react'
import { renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { toast } from 'sonner'
import { commands } from '@/lib/tauri-bindings'
import {
  emitSessionLocked,
  emitViewContext,
  type PopOutView,
} from '@/lib/services/sessionEvents'
import { useSessionStore } from '@/features/cloud-session'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { NavRail } from '../components/NavRail'
import { openViewWindow } from '../services/viewWindows'
import { useViewWindowBridge } from '../hooks/useViewWindowBridge'
import { resetCanvassStore, useCanvassStore } from '../store/canvass-store'
import { SEED_CASE_ID } from './fixtures'

type ReadyHandler = (payload: { view: PopOutView }) => void
type ClosedHandler = (view: PopOutView) => void

const harness = vi.hoisted(() => ({
  ready: [] as ((payload: { view: 'case' | 'map' }) => void)[],
  closed: [] as ((view: 'case' | 'map') => void)[],
  token: [] as ((payload: unknown) => void)[],
  context: [] as ((context: unknown) => void)[],
  locked: [] as (() => void)[],
  unlocked: [] as (() => void)[],
  ended: [] as (() => void)[],
  reset() {
    this.ready.length = 0
    this.closed.length = 0
    this.token.length = 0
    this.context.length = 0
    this.locked.length = 0
    this.unlocked.length = 0
    this.ended.length = 0
  },
}))

vi.mock('@/lib/services/sessionEvents', () => {
  const noopUnlisten = () =>
    Promise.resolve(() => {
      // mock unlisten
    })
  return {
    emitSecondaryReady: vi.fn(() => Promise.resolve()),
    emitSessionToken: vi.fn(() => Promise.resolve()),
    emitViewContext: vi.fn(() => Promise.resolve()),
    emitSessionLocked: vi.fn(() => Promise.resolve()),
    emitSessionUnlocked: vi.fn(() => Promise.resolve()),
    emitSessionEnded: vi.fn(() => Promise.resolve()),
    onSecondaryReady: vi.fn((handler: never) => {
      harness.ready.push(handler)
      return noopUnlisten()
    }),
    onViewWindowClosed: vi.fn((handler: never) => {
      harness.closed.push(handler)
      return noopUnlisten()
    }),
    onSessionToken: vi.fn((handler: never) => {
      harness.token.push(handler)
      return noopUnlisten()
    }),
    onViewContext: vi.fn((handler: never) => {
      harness.context.push(handler)
      return noopUnlisten()
    }),
    onSessionLocked: vi.fn((handler: never) => {
      harness.locked.push(handler)
      return noopUnlisten()
    }),
    onSessionUnlocked: vi.fn((handler: never) => {
      harness.unlocked.push(handler)
      return noopUnlisten()
    }),
    onSessionEnded: vi.fn((handler: never) => {
      harness.ended.push(handler)
      return noopUnlisten()
    }),
  }
})
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }))

beforeEach(() => {
  vi.clearAllMocks()
  harness.reset()
  resetCanvassStore()
  useSessionStore.setState({ state: 'active' })
  vi.mocked(commands.openViewWindow).mockResolvedValue({
    status: 'ok',
    data: null,
  })
})

describe('rail pop-out affordance (Phase 7.3B)', () => {
  // Test #112
  it('opens a view window with the selected case id', async () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })
    const user = userEvent.setup()
    renderWithFeatureProviders(<NavRail />)

    await user.click(screen.getByRole('button', { name: 'Pop out Map' }))

    // The window is unusable without its case: the command carries the
    // selected case id, positionally (tauri-specta).
    await waitFor(() => {
      expect(commands.openViewWindow).toHaveBeenCalledWith('map', SEED_CASE_ID)
    })
    // …and the JS-side view-context emit follows the resolved command
    // (one emitter — sessionEvents; the Rust command never emits it).
    await waitFor(() => {
      expect(emitViewContext).toHaveBeenCalledWith({
        view: 'map',
        caseId: SEED_CASE_ID,
      })
    })
    expect(useCanvassStore.getState().poppedViews.map).toBe(true)
  })

  // Test #119
  it('offers pop-out only on the case and map entries — never cases', () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID })
    renderWithFeatureProviders(<NavRail />)

    expect(
      screen.getByRole('button', { name: 'Pop out Case dashboard' })
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Pop out Map' })
    ).toBeInTheDocument()
    // The Cases landing is bound to the main window (A1).
    expect(
      screen.queryByRole('button', { name: 'Pop out Cases' })
    ).not.toBeInTheDocument()
  })

  it('surfaces a window-creation failure as a toast in the invoking window', async () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID })
    vi.mocked(commands.openViewWindow).mockResolvedValue({
      status: 'error',
      error: 'boom',
    })
    const user = userEvent.setup()
    renderWithFeatureProviders(<NavRail />)

    await user.click(screen.getByRole('button', { name: 'Pop out Map' }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled()
    })
    // A failed open never marks the view popped.
    expect(useCanvassStore.getState().poppedViews.map).toBe(false)
  })
})

describe('view-window service contract (Phase 7.1)', () => {
  // Test #113
  it('focuses, not duplicates, an already-open view window — and retargets it', async () => {
    await openViewWindow('map', SEED_CASE_ID)
    await openViewWindow('map', 'case-two')

    // Both calls resolve through the SAME command — the Rust side
    // focuses the existing label instead of building a second window
    // (create-once); the retarget re-emits view-context with the NEW
    // case so the open window switches.
    expect(commands.openViewWindow).toHaveBeenCalledTimes(2)
    expect(emitViewContext).toHaveBeenNthCalledWith(1, {
      view: 'map',
      caseId: SEED_CASE_ID,
    })
    expect(emitViewContext).toHaveBeenNthCalledWith(2, {
      view: 'map',
      caseId: 'case-two',
    })
    expect(useCanvassStore.getState().poppedViews.map).toBe(true)
  })
})

describe('main-side bridge (Phase 7.3B)', () => {
  function attachBridge() {
    renderHook(() => {
      useViewWindowBridge()
    })
  }

  // Test #121
  it('keeps main-window state untouched when a secondary closes', async () => {
    useCanvassStore.setState({
      selectedCaseId: SEED_CASE_ID,
      view: 'map',
      poppedViews: { case: false, map: true },
    })
    attachBridge()
    await waitFor(() => {
      expect(harness.closed.length).toBeGreaterThan(0)
    })

    act(() => {
      for (const handler of harness.closed as ClosedHandler[]) {
        handler('map')
      }
    })

    // ONLY the popped indicator changes — selection and view are main's
    // own board state and a closing pop-out must never mutate them.
    expect(useCanvassStore.getState().selectedCaseId).toBe(SEED_CASE_ID)
    expect(useCanvassStore.getState().view).toBe('map')
    expect(useCanvassStore.getState().poppedViews.map).toBe(false)
  })

  // Unnumbered rider (7.2B handshake, the view-context half — the token
  // half is #139 in client.test.ts): secondary-ready is answered with
  // the case the window was opened FOR, plus a lock-state catch-up when
  // main is locked (the lock could fire between open and handshake).
  it('answers secondary-ready with the registered view-context (+ locked catch-up)', async () => {
    await openViewWindow('case', SEED_CASE_ID)
    attachBridge()
    await waitFor(() => {
      expect(harness.ready.length).toBeGreaterThan(0)
    })
    vi.mocked(emitViewContext).mockClear()

    act(() => {
      for (const handler of harness.ready as ReadyHandler[]) {
        handler({ view: 'case' })
      }
    })
    await waitFor(() => {
      expect(emitViewContext).toHaveBeenCalledWith({
        view: 'case',
        caseId: SEED_CASE_ID,
      })
    })
    expect(emitSessionLocked).not.toHaveBeenCalled()

    // Locked main: the reply also re-broadcasts the lock so a secondary
    // that missed the transition seeds `locked`, not `active`.
    useSessionStore.setState({ state: 'locked' })
    act(() => {
      for (const handler of harness.ready as ReadyHandler[]) {
        handler({ view: 'case' })
      }
    })
    await waitFor(() => {
      expect(emitSessionLocked).toHaveBeenCalled()
    })
  })
})

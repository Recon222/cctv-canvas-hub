/**
 * Session-propagation events (Phase 7.2B, AD13): the typed Tauri events
 * between the main window (sole auth owner) and the pop-out view
 * windows. ONE emitter home — every session/view-context emit in the
 * app goes through this module, never a second raw `emit()` call site.
 *
 * Initial delivery is a HANDSHAKE, not a push: the secondary attaches
 * its listeners FIRST, then emits `secondary-ready`; main replies with
 * `session-token` + `view-context`. A push at window-open would RACE
 * the listener attach — Tauri events are not buffered, so the emit
 * would land before the listener exists and every open would boot into
 * the timeout state.
 *
 * Lifecycle semantics (AD6 parity, doc 01 §A1):
 * - `session-token` — handshake reply + every session rotation in main
 *   (TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED — the unlock re-auth is
 *   a full sign-in minting a new session; PR #10 H1).
 * - `view-context`  — handshake reply + re-emitted on a focus-if-open
 *   retarget (the JS-side-only emit; the Rust command never emits it).
 * - `session-locked` / `session-unlocked` — idle lock parity: the
 *   secondary locks interaction in step with main while the board keeps
 *   flowing unchanged (lock revokes nothing, alters no content).
 * - `session-ended` — SIGN-OUT ONLY. Never emitted for a lock.
 * - `view-window-closed` — emitted by RUST (view_windows service) when
 *   a pop-out is destroyed; main clears its rail indicator (#121).
 */

import { emit, listen, type UnlistenFn } from '@tauri-apps/api/event'

/** The two pop-out views (mirror of the Rust `ViewWindow` enum). */
export type PopOutView = 'case' | 'map'

export interface SessionTokenPayload {
  /** CloudConfig url — designed-public (T4). */
  url: string
  /** CloudConfig publishable key — designed-public (T4). */
  key: string
  /** The current access token — held in memory only in secondaries (T9). */
  token: string
}

export interface ViewContext {
  view: PopOutView
  caseId: string
}

const SECONDARY_READY = 'secondary-ready'
const SESSION_TOKEN = 'session-token'
const VIEW_CONTEXT = 'view-context'
const SESSION_LOCKED = 'session-locked'
const SESSION_UNLOCKED = 'session-unlocked'
const SESSION_ENDED = 'session-ended'
const VIEW_WINDOW_CLOSED = 'view-window-closed'

// ————— emitters —————

/** Secondary → main: listeners are attached, ready for the reply. */
export async function emitSecondaryReady(view: PopOutView): Promise<void> {
  await emit(SECONDARY_READY, { view })
}

/** Main → secondaries: handshake reply + every session rotation
 * (TOKEN_REFRESHED / SIGNED_IN / USER_UPDATED — PR #10 H1). */
export async function emitSessionToken(
  payload: SessionTokenPayload
): Promise<void> {
  await emit(SESSION_TOKEN, payload)
}

/** Main → secondaries: the case a view window targets. */
export async function emitViewContext(context: ViewContext): Promise<void> {
  await emit(VIEW_CONTEXT, context)
}

/** Main → secondaries: idle lock engaged (AD6 parity — data keeps flowing). */
export async function emitSessionLocked(): Promise<void> {
  await emit(SESSION_LOCKED)
}

/** Main → secondaries: idle lock released. */
export async function emitSessionUnlocked(): Promise<void> {
  await emit(SESSION_UNLOCKED)
}

/** Main → secondaries: sign-out only — every secondary terminalizes. */
export async function emitSessionEnded(): Promise<void> {
  await emit(SESSION_ENDED)
}

// ————— listeners —————

export async function onSecondaryReady(
  handler: (payload: { view: PopOutView }) => void
): Promise<UnlistenFn> {
  return listen<{ view: PopOutView }>(SECONDARY_READY, event => {
    handler(event.payload)
  })
}

export async function onSessionToken(
  handler: (payload: SessionTokenPayload) => void
): Promise<UnlistenFn> {
  return listen<SessionTokenPayload>(SESSION_TOKEN, event => {
    handler(event.payload)
  })
}

export async function onViewContext(
  handler: (context: ViewContext) => void
): Promise<UnlistenFn> {
  return listen<ViewContext>(VIEW_CONTEXT, event => {
    handler(event.payload)
  })
}

export async function onSessionLocked(
  handler: () => void
): Promise<UnlistenFn> {
  return listen(SESSION_LOCKED, () => {
    handler()
  })
}

export async function onSessionUnlocked(
  handler: () => void
): Promise<UnlistenFn> {
  return listen(SESSION_UNLOCKED, () => {
    handler()
  })
}

export async function onSessionEnded(handler: () => void): Promise<UnlistenFn> {
  return listen(SESSION_ENDED, () => {
    handler()
  })
}

/** Rust → main: a view window was destroyed (payload: `"case" | "map"`). */
export async function onViewWindowClosed(
  handler: (view: PopOutView) => void
): Promise<UnlistenFn> {
  return listen<PopOutView>(VIEW_WINDOW_CLOSED, event => {
    handler(event.payload)
  })
}

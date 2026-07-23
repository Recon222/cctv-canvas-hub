/**
 * Pop-out window orchestration — the MAIN-window side (Phase 7.3B).
 *
 * Owns the per-view case registry: the case each open view window was
 * opened FOR, so the handshake's view-context half can answer a
 * `secondary-ready` (the token half lives in `client.ts` — #139). The
 * Rust command builds/focuses and returns; every `view-context` emit is
 * JS-side, through `sessionEvents` (7.1A: one emitter, never two).
 */

import { commands } from '@/lib/tauri-bindings'
import { logger } from '@/lib/logger'
import {
  emitSessionLocked,
  emitViewContext,
  type PopOutView,
} from '@/lib/services/sessionEvents'
import { useSessionStore } from '@/features/cloud-session'
import { useCanvassStore } from '../store/canvass-store'

/** view → the case id its window targets. Module state — main only. */
const openViewCases = new Map<PopOutView, string>()

/**
 * Open (or focus, create-once — Rust side) the pop-out for `view`,
 * targeted at `caseId` (#112: the window is unusable without it). A
 * second call for the same view focuses the existing window and
 * RETARGETS it via the re-emitted view-context (#113).
 */
export async function openViewWindow(
  view: PopOutView,
  caseId: string
): Promise<void> {
  const result = await commands.openViewWindow(view, caseId)
  if (result.status === 'error') {
    throw new Error(result.error)
  }
  openViewCases.set(view, caseId)
  useCanvassStore.getState().setViewPopped(view, true)
  // On first create this lands before the secondary's listeners attach
  // (harmless — the handshake reply carries the context); on
  // focus-if-open it IS the retarget.
  await emitViewContext({ view, caseId })
}

/**
 * The view-context half of the handshake reply (7.2B): a secondary
 * announced itself — send the case its window was opened for. Also
 * re-broadcasts the lock state when main is locked, so a secondary that
 * missed the transition (lock fired between open and handshake) seeds
 * `locked`, not `active` (AD6 parity).
 */
export function replySecondaryReady(view: PopOutView): void {
  const caseId = openViewCases.get(view)
  if (caseId !== undefined) {
    emitViewContext({ view, caseId }).catch((cause: unknown) => {
      logger.warn('Failed to reply view-context to a secondary', {
        view,
        cause,
      })
    })
  }
  if (useSessionStore.getState().state === 'locked') {
    emitSessionLocked().catch((cause: unknown) => {
      logger.warn('Failed to re-broadcast the lock state', { cause })
    })
  }
}

/** A view window was destroyed (Rust `view-window-closed`): clear ONLY
 * the popped indicator — never selection/view in main (#121). */
export function clearViewWindow(view: PopOutView): void {
  openViewCases.delete(view)
  useCanvassStore.getState().setViewPopped(view, false)
}

/**
 * Session-exit registry reset (PR #10 M1, fix b): called from the board
 * unmount (CanvassRoot's session-exit cleanup — the same place every
 * other per-session module state resets; `signOut()` itself cannot call
 * canvass code without an import cycle, and `view-window-closed` cannot
 * cover it because the bridge has already unmounted). A stale registry
 * after re-sign-in is a cross-operator seed: operator A's caseId would
 * answer operator B's fresh handshake.
 */
export function resetViewWindows(): void {
  openViewCases.clear()
  useCanvassStore.setState({ poppedViews: { case: false, map: false } })
}

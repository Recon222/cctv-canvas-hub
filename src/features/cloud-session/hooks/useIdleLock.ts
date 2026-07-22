/**
 * Idle lock timer (Phase 6.1A, Flow F, AD6): no pointer/keyboard for
 * `idle_lock_minutes` while the session is `active` ⇒ `lock()`. The
 * lock is interaction-only — the board beneath keeps flowing (the poll
 * gates already honor `locked`; realtime rides the board mount).
 */

import { useEffect } from 'react'
import { usePreferences } from '@/features/preferences'
import { useSessionStore } from '../store/session-store'

/** Every signal that a human is at the console. Wheel covers trackpad
 * scrolling, which fires neither pointer nor key events. */
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'keydown', 'wheel']

export function useIdleLock(): void {
  const sessionState = useSessionStore(state => state.state)
  const { data: preferences } = usePreferences()
  // Ledger L1 (PR #6 review): clamp once at the consumer — `null` means
  // the documented 15-minute default, and a seeded/hand-edited `0` gets
  // the 1-minute floor, never an instant lock.
  const idleLockMinutes = Math.max(1, preferences?.idle_lock_minutes ?? 15)

  useEffect(() => {
    if (sessionState !== 'active') {
      return
    }
    const timeoutMs = idleLockMinutes * 60_000
    const lockNow = () => {
      // `lock()` self-guards active → locked; a stale timer firing
      // after sign-out is a no-op.
      useSessionStore.getState().lock()
    }
    let timer = window.setTimeout(lockNow, timeoutMs)
    const reset = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(lockNow, timeoutMs)
    }
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, reset, { passive: true })
    }
    return () => {
      window.clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, reset)
      }
    }
  }, [sessionState, idleLockMinutes])
}

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import { logger } from '@/lib/logger'
import {
  emitSessionLocked,
  emitSessionUnlocked,
} from '@/lib/services/sessionEvents'
import { setLockedFlag } from '../services/configService'
import type { SessionState } from '../types'

/**
 * The session state machine (doc 01 §5.4). Selector-only access
 * (ast-grep no-destructure). ZERO health state here — health is the
 * global health-store's domain (AD11, M2).
 *
 * Lock durability (PR #9 H1): every lock/unlock transition persists
 * the flag through `setLockedFlag` — the ONE home for it, so every
 * caller (idle timer, palette command, overlay unlock) is covered and
 * bootstrap can re-enter `locked` after a reload/relaunch. Sign-out
 * clears it in `signOut()` (that path never runs `unlock()`).
 */
interface SessionStore {
  state: SessionState
  setState: (state: SessionState) => void
  /** `active → locked` only — a signed-out shell can never lock. */
  lock: () => void
  /** `locked → active` only. */
  unlock: () => void
}

/** Fire-and-forget: a persist failure must never block the in-memory
 * transition (the wall stays up NOW; durability degrades with a logged
 * error — an unattended kiosk can't act on a toast). */
function persistLockedFlag(locked: boolean): void {
  setLockedFlag(locked).catch((cause: unknown) => {
    logger.error('Failed to persist the lock flag', { locked, cause })
  })
}

/** 7.2B (AD6 parity, R8 #140): lock/unlock broadcast to the pop-out
 * windows from the SAME choke point that persists the durable flag —
 * every caller (idle timer, palette command, overlay unlock) is
 * covered. Fire-and-forget like the flag write; secondaries seed their
 * own-context session-store from these and keep the board flowing. */
function broadcastLockState(locked: boolean): void {
  const send = locked ? emitSessionLocked : emitSessionUnlocked
  send().catch((cause: unknown) => {
    logger.error('Failed to broadcast the lock state to view windows', {
      locked,
      cause,
    })
  })
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    (set, get) => ({
      state: 'booting',

      setState: state => set({ state }, undefined, 'setState'),

      lock: () => {
        if (get().state !== 'active') {
          return
        }
        set({ state: 'locked' }, undefined, 'lock')
        persistLockedFlag(true)
        broadcastLockState(true)
      },

      unlock: () => {
        if (get().state !== 'locked') {
          return
        }
        set({ state: 'active' }, undefined, 'unlock')
        persistLockedFlag(false)
        broadcastLockState(false)
      },
    }),
    { name: 'session-store' }
  )
)

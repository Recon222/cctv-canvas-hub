import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { SessionState } from '../types'

/**
 * The session state machine (doc 01 §5.4). Selector-only access
 * (ast-grep no-destructure). ZERO health state here — health is the
 * global health-store's domain (AD11, M2).
 */
interface SessionStore {
  state: SessionState
  setState: (state: SessionState) => void
  /** `active → locked` only — a signed-out shell can never lock. */
  lock: () => void
  /** `locked → active` only. */
  unlock: () => void
}

export const useSessionStore = create<SessionStore>()(
  devtools(
    set => ({
      state: 'booting',

      setState: state => set({ state }, undefined, 'setState'),

      lock: () =>
        set(
          current =>
            current.state === 'active' ? { state: 'locked' } : current,
          undefined,
          'lock'
        ),

      unlock: () =>
        set(
          current =>
            current.state === 'locked' ? { state: 'active' } : current,
          undefined,
          'unlock'
        ),
    }),
    { name: 'session-store' }
  )
)

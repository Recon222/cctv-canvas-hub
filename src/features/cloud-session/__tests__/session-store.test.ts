import { describe, it, expect, beforeEach } from 'vitest'
import { useSessionStore } from '../store/session-store'

beforeEach(() => {
  useSessionStore.setState({ state: 'booting' })
})

describe('session-store', () => {
  // Test #24
  it('transitions active → locked → active via lock/unlock actions', () => {
    const { setState, lock, unlock } = useSessionStore.getState()

    setState('active')
    lock()
    expect(useSessionStore.getState().state).toBe('locked')

    unlock()
    expect(useSessionStore.getState().state).toBe('active')

    // lock/unlock are no-ops outside their source states — a signed-out
    // shell must never end up locked (or spuriously active).
    setState('signed-out')
    lock()
    expect(useSessionStore.getState().state).toBe('signed-out')
    unlock()
    expect(useSessionStore.getState().state).toBe('signed-out')
  })
})

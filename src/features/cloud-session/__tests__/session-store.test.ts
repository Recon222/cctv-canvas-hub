import { describe, it, expect, beforeEach, vi } from 'vitest'
import { waitFor } from '@testing-library/react'
import { commands } from '@/lib/tauri-bindings'
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

  // PR #9 H1: lock/unlock persist the durable flag through the config
  // (the ONE home — idle timer, palette command, and overlay unlock all
  // route through these actions). Fire-and-forget: the in-memory
  // transition never blocks on disk.
  it('persists the lock flag on lock and clears it on unlock', async () => {
    vi.mocked(commands.loadCloudConfig).mockResolvedValue({
      status: 'ok',
      data: {
        url: 'https://testref.supabase.co',
        publishable_key: 'sb_publishable_test',
        signed_in_email: null,
        locked: false,
      },
    })
    const save = vi.mocked(commands.saveCloudConfig)
    save.mockClear()

    useSessionStore.setState({ state: 'active' })
    useSessionStore.getState().lock()
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ locked: true })
      )
    })

    vi.mocked(commands.loadCloudConfig).mockResolvedValue({
      status: 'ok',
      data: {
        url: 'https://testref.supabase.co',
        publishable_key: 'sb_publishable_test',
        signed_in_email: null,
        locked: true,
      },
    })
    save.mockClear()
    useSessionStore.getState().unlock()
    await waitFor(() => {
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({ locked: false })
      )
    })
  })
})

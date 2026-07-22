import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FeatureTestWrapper } from '@/test/feature-test-utils'
import { initSupabase } from '@/lib/supabase/client'
import { useAuthBootstrap } from '../hooks/useAuthBootstrap'
import { useSessionStore } from '../store/session-store'
import { loadConfig } from '../services/configService'
import { restoreSession, checkSchemaGate } from '../services/authService'

vi.mock('@/lib/supabase/client')
vi.mock('../services/configService')
vi.mock('../services/authService')

const mockLoadConfig = vi.mocked(loadConfig)
const mockInitSupabase = vi.mocked(initSupabase)
const mockRestoreSession = vi.mocked(restoreSession)
const mockCheckSchemaGate = vi.mocked(checkSchemaGate)

const CONFIG = {
  url: 'https://testref.supabase.co',
  publishable_key: 'sb_publishable_test',
  signed_in_email: 'coord@example.test',
  locked: false,
}

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({ state: 'booting' })
})

function renderBootstrap() {
  return renderHook(() => useAuthBootstrap(), { wrapper: FeatureTestWrapper })
}

describe('useAuthBootstrap', () => {
  // Test #20
  it('starts in booting and reaches needs-setup with no config', async () => {
    mockLoadConfig.mockResolvedValue(null)

    expect(useSessionStore.getState().state).toBe('booting')
    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('needs-setup')
    })
    expect(mockInitSupabase).not.toHaveBeenCalled()
  })

  // Test #21
  it('reaches signed-out with config but no restorable session', async () => {
    mockLoadConfig.mockResolvedValue(CONFIG)
    mockRestoreSession.mockResolvedValue(false)

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('signed-out')
    })
    expect(mockInitSupabase).toHaveBeenCalledWith(CONFIG)
    expect(mockCheckSchemaGate).not.toHaveBeenCalled()
  })

  // Test #22
  it('reaches active with config + session + gate pass', async () => {
    mockLoadConfig.mockResolvedValue(CONFIG)
    mockRestoreSession.mockResolvedValue(true)
    mockCheckSchemaGate.mockResolvedValue('ok')

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('active')
    })
  })

  // PR #9 H1 (the REVISE gate): the idle lock must survive a
  // reload/relaunch. A restored session + gate ok + the persisted
  // locked flag ⇒ bootstrap re-enters `locked`, NEVER `active` — F5,
  // a crash, the updater, or M1 relaunch-restore must not drop the
  // wall without a password.
  it('re-enters locked when the persisted lock flag is set', async () => {
    mockLoadConfig.mockResolvedValue({ ...CONFIG, locked: true })
    mockRestoreSession.mockResolvedValue(true)
    mockCheckSchemaGate.mockResolvedValue('ok')

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('locked')
    })
  })

  // Test #23
  it('reaches schema-gate on gate mismatch, never active', async () => {
    mockLoadConfig.mockResolvedValue(CONFIG)
    mockRestoreSession.mockResolvedValue(true)
    mockCheckSchemaGate.mockResolvedValue('mismatch')

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('schema-gate')
    })
  })

  // "Never infinite booting" contract, error side: a config-load rejection
  // (e.g. IPC failure) must land in needs-setup, not a stuck booting shell.
  it('reaches needs-setup when config load rejects', async () => {
    mockLoadConfig.mockRejectedValue(new Error('IPC read failed'))

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('needs-setup')
    })
    expect(mockInitSupabase).not.toHaveBeenCalled()
  })

  // Restore/gate rejection (e.g. network down mid-restore) must land in
  // signed-out — again never a stuck booting shell.
  it('reaches signed-out when session restore rejects', async () => {
    mockLoadConfig.mockResolvedValue(CONFIG)
    mockRestoreSession.mockRejectedValue(new Error('network unreachable'))

    renderBootstrap()

    await waitFor(() => {
      expect(useSessionStore.getState().state).toBe('signed-out')
    })
    expect(mockCheckSchemaGate).not.toHaveBeenCalled()
  })
})

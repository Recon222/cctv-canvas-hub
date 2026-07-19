import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { initSupabase } from '@/lib/supabase/client'
import { MainWindowContent } from '@/components/layout/MainWindowContent'
import { useSessionStore } from '../store/session-store'
import { SetupScreen } from '../components/SetupScreen'
import { SignInScreen } from '../components/SignInScreen'
import {
  saveConfig,
  probeProject,
  ProbeRejectedError,
} from '../services/configService'
import {
  signIn,
  checkSchemaGate,
  fetchSchemaVersion,
} from '../services/authService'

vi.mock('@/lib/supabase/client')
// Keep the real parseEnrollmentPayload + error classes; mock the IPC/cloud calls.
vi.mock('../services/configService', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    loadConfig: vi.fn(),
    saveConfig: vi.fn(),
    clearConfig: vi.fn(),
    probeProject: vi.fn(),
  }
})
// Keep the real APP_REQUIRED_SCHEMA_VERSION; mock the calls.
vi.mock('../services/authService', async importOriginal => {
  const actual: Record<string, unknown> = await importOriginal()
  return {
    ...actual,
    signIn: vi.fn(),
    signOut: vi.fn(),
    restoreSession: vi.fn(),
    fetchSchemaVersion: vi.fn(),
    checkSchemaGate: vi.fn(),
    reauthenticate: vi.fn(),
  }
})
// MainWindowContent mounts the bootstrap — keep it inert for screen tests.
vi.mock('../hooks/useAuthBootstrap', () => ({ useAuthBootstrap: vi.fn() }))

const VALID_PAYLOAD = JSON.stringify({
  v: 1,
  url: 'https://testref.supabase.co',
  key: 'sb_publishable_test',
})

beforeEach(() => {
  vi.clearAllMocks()
  useSessionStore.setState({ state: 'booting' })
})

describe('session screens', () => {
  // Test #25
  it('renders SetupScreen in needs-setup and submits a pasted payload', async () => {
    useSessionStore.setState({ state: 'needs-setup' })
    vi.mocked(probeProject).mockResolvedValue(undefined)
    vi.mocked(saveConfig).mockResolvedValue(undefined)
    const user = userEvent.setup()

    renderWithFeatureProviders(<SetupScreen />)

    await user.click(screen.getByLabelText('Enrollment payload'))
    await user.paste(VALID_PAYLOAD)
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    await waitFor(() => {
      expect(saveConfig).toHaveBeenCalledWith({
        url: 'https://testref.supabase.co',
        publishable_key: 'sb_publishable_test',
        signed_in_email: null,
      })
    })
    expect(probeProject).toHaveBeenCalledWith(
      'https://testref.supabase.co',
      'sb_publishable_test'
    )
    expect(vi.mocked(initSupabase)).toHaveBeenCalled()
    expect(useSessionStore.getState().state).toBe('signed-out')
  })

  // Test #26
  it('shows an inline translated error on probe failure', async () => {
    useSessionStore.setState({ state: 'needs-setup' })
    vi.mocked(probeProject).mockRejectedValue(
      new ProbeRejectedError('Invalid API key')
    )
    const user = userEvent.setup()

    renderWithFeatureProviders(<SetupScreen />)

    const textarea = screen.getByLabelText('Enrollment payload')
    await user.click(textarea)
    await user.paste(VALID_PAYLOAD)
    await user.click(screen.getByRole('button', { name: 'Connect' }))

    expect(
      await screen.findByText(
        'The project refused this key — check the enrollment payload'
      )
    ).toBeInTheDocument()
    // Form is still editable — no dead end.
    expect(textarea).toBeEnabled()
    await user.click(textarea)
    await user.paste(' more')
    expect(saveConfig).not.toHaveBeenCalled()
    expect(useSessionStore.getState().state).toBe('needs-setup')
  })

  // Test #27
  it('renders SignInScreen in signed-out and signs in', async () => {
    useSessionStore.setState({ state: 'signed-out' })
    vi.mocked(signIn).mockResolvedValue(undefined)
    vi.mocked(checkSchemaGate).mockResolvedValue('ok')
    const user = userEvent.setup()

    renderWithFeatureProviders(<SignInScreen />)

    await user.type(screen.getByLabelText('Email'), 'coord@example.test')
    await user.type(screen.getByLabelText('Password'), 'pw123')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))

    await waitFor(() => {
      expect(signIn).toHaveBeenCalledWith('coord@example.test', 'pw123')
    })
    expect(useSessionStore.getState().state).toBe('active')
  })

  // Test #28
  it('renders SchemaGateScreen with the found vs required version and no board mount', async () => {
    useSessionStore.setState({ state: 'schema-gate' })
    vi.mocked(fetchSchemaVersion).mockResolvedValue(2)

    renderWithFeatureProviders(<MainWindowContent />)

    expect(
      await screen.findByText('Cloud schema version: 2')
    ).toBeInTheDocument()
    expect(screen.getByText('Required schema version: 1')).toBeInTheDocument()
    // The board (M1 placeholder) must not mount behind the gate.
    expect(screen.queryByText('Connected · schema v1')).not.toBeInTheDocument()
  })
})

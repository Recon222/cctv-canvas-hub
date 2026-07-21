import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { commands, type AppPreferences } from '@/lib/tauri-bindings'
import { useUIStore } from '@/store/ui-store'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { PreferencesDialog } from '../components/PreferencesDialog'
import {
  loadPreferences,
  savePreferences,
} from '../services/preferencesService'

/**
 * Phase 3.1 (tests #66–67): the three M3 preference fields —
 * `mapbox_token`, `map_style`, `idle_lock_minutes` — exist end-to-end
 * (Rust type → generated bindings → dialog inputs). The commands are
 * mocked globally in src/test/setup.ts; #66's round-trip wires the mock
 * as an echo so the assertion pins the TypeScript surface (the
 * compile-time contract is the regenerated bindings type itself).
 */

const mockLoad = vi.mocked(commands.loadPreferences)
const mockSave = vi.mocked(commands.savePreferences)

const BASE_PREFERENCES: AppPreferences = {
  theme: 'system',
  quick_pane_shortcut: null,
  language: null,
  mapbox_token: null,
  map_style: null,
  idle_lock_minutes: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  mockLoad.mockResolvedValue({ status: 'ok', data: { ...BASE_PREFERENCES } })
  mockSave.mockResolvedValue({ status: 'ok', data: null })
})

describe('preferences additions (Phase 3.1)', () => {
  // Test #66
  it('round-trips the three new preference fields through save → load', async () => {
    // Fake token/style/minutes only — never real values (CLAUDE.local rule).
    const edited: AppPreferences = {
      ...BASE_PREFERENCES,
      mapbox_token: 'pk.test-fake-token',
      map_style: 'dark-v11',
      idle_lock_minutes: 30,
    }
    let saved: AppPreferences | undefined
    mockSave.mockImplementation(preferences => {
      saved = preferences
      return Promise.resolve({ status: 'ok', data: null })
    })
    mockLoad.mockImplementation(() => {
      if (saved === undefined) {
        throw new Error('load before save in round-trip test')
      }
      return Promise.resolve({ status: 'ok', data: saved })
    })

    await savePreferences(edited)
    const loaded = await loadPreferences()

    expect(loaded.mapbox_token).toBe('pk.test-fake-token')
    expect(loaded.map_style).toBe('dark-v11')
    expect(loaded.idle_lock_minutes).toBe(30)
  })

  // Test #67
  it('renders the three new inputs in the dialog, token field masked-style', async () => {
    const user = userEvent.setup()
    useUIStore.setState({ preferencesOpen: true })
    renderWithFeatureProviders(<PreferencesDialog />)

    // The Map pane hosts the new fields.
    await user.click(await screen.findByRole('button', { name: 'Map' }))

    const tokenInput = await screen.findByLabelText('Mapbox access token')
    expect(tokenInput).toHaveAttribute('type', 'password')
    // Style select (combobox trigger) + idle-minutes number input.
    expect(
      screen.getByRole('combobox', { name: 'Map style' })
    ).toBeInTheDocument()
    const idleInput = screen.getByLabelText('Idle lock minutes')
    expect(idleInput).toHaveAttribute('type', 'number')

    // Editing the token persists it through the preferences service.
    await waitFor(() => {
      expect(tokenInput).toBeEnabled()
    })
    await user.type(tokenInput, 'pk.test-fake-token')
    await user.tab()
    await waitFor(() => {
      expect(mockSave).toHaveBeenCalledWith(
        expect.objectContaining({ mapbox_token: 'pk.test-fake-token' })
      )
    })
  })
})

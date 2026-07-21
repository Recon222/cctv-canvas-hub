import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock matchMedia for tests
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock Tauri APIs for tests
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn().mockResolvedValue(() => {
    // Mock unlisten function
  }),
}))

vi.mock('@tauri-apps/plugin-updater', () => ({
  check: vi.fn().mockResolvedValue(null),
}))

// Mock typed Tauri bindings (tauri-specta generated)
vi.mock('@/lib/tauri-bindings', () => ({
  commands: {
    greet: vi.fn().mockResolvedValue('Hello, test!'),
    loadPreferences: vi.fn().mockResolvedValue({
      status: 'ok',
      data: {
        theme: 'system',
        quick_pane_shortcut: null,
        language: null,
        mapbox_token: null,
        map_style: null,
        idle_lock_minutes: null,
      },
    }),
    savePreferences: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    sendNativeNotification: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    saveEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    loadEmergencyData: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    cleanupOldRecoveryFiles: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: 0 }),
    showQuickPane: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    dismissQuickPane: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    toggleQuickPane: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    getDefaultQuickPaneShortcut: vi
      .fn()
      .mockResolvedValue('CommandOrControl+Shift+.'),
    updateQuickPaneShortcut: vi
      .fn()
      .mockResolvedValue({ status: 'ok', data: null }),
    loadCloudConfig: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    saveCloudConfig: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    clearCloudConfig: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    vaultGet: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    vaultSet: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
    vaultClear: vi.fn().mockResolvedValue({ status: 'ok', data: null }),
  },
  unwrapResult: vi.fn((result: { status: string; data?: unknown }) => {
    if (result.status === 'ok') return result.data
    throw result
  }),
}))

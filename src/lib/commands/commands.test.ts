import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { TFunction } from 'i18next'
import type { CommandContext, AppCommand } from './types'

const mockUIStore = {
  getState: vi.fn(() => ({
    leftSidebarVisible: true,
    commandPaletteOpen: false,
    setLeftSidebarVisible: vi.fn(),
  })),
}

vi.mock('@/store/ui-store', () => ({
  useUIStore: mockUIStore,
}))

const { registerCommands, getAllCommands, executeCommand } =
  await import('./registry')
const { navigationCommands } = await import('./navigation-commands')
const { featureCommands } = await import('./feature-commands')
const { useCanvassStore, resetCanvassStore } =
  await import('@/features/canvass')

const createMockContext = (): CommandContext => ({
  openPreferences: vi.fn(),
  showToast: vi.fn(),
})

// Mock translation function for testing
const mockT = ((key: string): string => {
  const translations: Record<string, string> = {
    'commands.showLeftSidebar.label': 'Show Left Sidebar',
    'commands.showLeftSidebar.description': 'Show the left sidebar',
    'commands.hideLeftSidebar.label': 'Hide Left Sidebar',
    'commands.hideLeftSidebar.description': 'Hide the left sidebar',
    'commands.showRightSidebar.label': 'Show Right Sidebar',
    'commands.showRightSidebar.description': 'Show the right sidebar',
    'commands.hideRightSidebar.label': 'Hide Right Sidebar',
    'commands.hideRightSidebar.description': 'Hide the right sidebar',
    'commands.openPreferences.label': 'Open Preferences',
    'commands.openPreferences.description': 'Open the application preferences',
  }
  return translations[key] || key
}) as TFunction

describe('Simplified Command System', () => {
  let mockContext: CommandContext

  beforeEach(() => {
    mockContext = createMockContext()
    registerCommands(navigationCommands)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('Command Registration', () => {
    it('registers commands correctly', () => {
      const commands = getAllCommands(mockContext)
      expect(commands.length).toBeGreaterThan(0)

      const sidebarCommand = commands.find(
        cmd => cmd.id === 'show-left-sidebar' || cmd.id === 'hide-left-sidebar'
      )
      expect(sidebarCommand).toBeDefined()
      expect(mockT(sidebarCommand?.labelKey ?? '')).toContain('Sidebar')
    })

    it('filters commands by availability', () => {
      mockUIStore.getState.mockReturnValue({
        leftSidebarVisible: false,
        commandPaletteOpen: false,
        setLeftSidebarVisible: vi.fn(),
      })

      const availableCommands = getAllCommands(mockContext)
      const showSidebarCommand = availableCommands.find(
        cmd => cmd.id === 'show-left-sidebar'
      )
      const hideSidebarCommand = availableCommands.find(
        cmd => cmd.id === 'hide-left-sidebar'
      )

      expect(showSidebarCommand).toBeDefined()
      expect(hideSidebarCommand).toBeUndefined()
    })

    it('filters commands by search term using translations', () => {
      const searchResults = getAllCommands(mockContext, 'sidebar', mockT)

      expect(searchResults.length).toBeGreaterThan(0)
      searchResults.forEach(cmd => {
        const label = mockT(cmd.labelKey).toLowerCase()
        const description = cmd.descriptionKey
          ? mockT(cmd.descriptionKey).toLowerCase()
          : ''
        const matchesSearch =
          label.includes('sidebar') || description.includes('sidebar')

        expect(matchesSearch).toBe(true)
      })
    })
  })

  describe('Command Execution', () => {
    it('executes show-left-sidebar command correctly', async () => {
      mockUIStore.getState.mockReturnValue({
        leftSidebarVisible: false,
        commandPaletteOpen: false,
        setLeftSidebarVisible: vi.fn(),
      })

      const result = await executeCommand('show-left-sidebar', mockContext)

      expect(result.success).toBe(true)
    })

    it('fails to execute unavailable command', async () => {
      mockUIStore.getState.mockReturnValue({
        leftSidebarVisible: true,
        commandPaletteOpen: false,
        setLeftSidebarVisible: vi.fn(),
      })

      const result = await executeCommand('show-left-sidebar', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not available')
    })

    it('handles non-existent command', async () => {
      const result = await executeCommand('non-existent-command', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('not found')
    })

    it('handles command execution errors', async () => {
      const errorCommand: AppCommand = {
        id: 'error-command',
        labelKey: 'commands.error.label',
        execute: () => {
          throw new Error('Test error')
        },
      }

      registerCommands([errorCommand])

      const result = await executeCommand('error-command', mockContext)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Test error')
    })
  })

  describe('M5 palette commands (Phase 5.3B)', () => {
    // Test #99
    it('registers the M5 palette commands (A1)', () => {
      registerCommands(featureCommands)

      const ids = getAllCommands(mockContext).map(cmd => cmd.id)
      expect(ids).toEqual(
        expect.arrayContaining([
          'canvass-view-cases',
          'canvass-view-case',
          'canvass-view-map',
          'session-sign-out',
        ])
      )
      // session-lock-now registers in 6.1, WITH its unlock overlay — a
      // lock command with no escape would strand an M5 build.
      expect(ids).not.toContain('session-lock-now')
    })

    it('guards the case-bound views behind a selected case', async () => {
      registerCommands(featureCommands)
      resetCanvassStore()

      // No selected case: the palette mirrors the rail's disabled
      // posture honestly — a toast, never a broken blank view.
      const result = await executeCommand('canvass-view-map', mockContext)
      expect(result.success).toBe(true)
      expect(mockContext.showToast).toHaveBeenCalledWith(
        'Select a case first',
        'info'
      )
      expect(useCanvassStore.getState().view).toBe('cases')

      // With a selection, the three view commands mirror the rail.
      useCanvassStore.getState().selectCase('case-1')
      await executeCommand('canvass-view-map', mockContext)
      expect(useCanvassStore.getState().view).toBe('map')
      await executeCommand('canvass-view-case', mockContext)
      expect(useCanvassStore.getState().view).toBe('case')
      await executeCommand('canvass-view-cases', mockContext)
      expect(useCanvassStore.getState().view).toBe('cases')

      resetCanvassStore()
    })
  })
})

import { useEffect } from 'react'
import { TitleBar } from '@/components/titlebar/TitleBar'
import { MainWindowContent } from './MainWindowContent'
import { CommandPalette } from '@/features/command-palette'
import { PreferencesDialog } from '@/features/preferences'
import { SessionLockOverlay, useSessionStore } from '@/features/cloud-session'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useUIStore } from '@/store/ui-store'
import { useMainWindowEventListeners } from '@/hooks/useMainWindowEventListeners'

/**
 * Map-maximal shell (spec §4): TitleBar + full-bleed content, no
 * edge-docked side panels (AD9 — the sidebar files stay dormant for a
 * later /cleanup). Global overlays (palette, preferences, toasts) remain.
 *
 * Lock containment (PR #9 M1): while `locked`, the WHOLE shell —
 * TitleBar included — goes `inert` (React 19 native prop), killing
 * pointer AND focus/keyboard reachability for every control that
 * bypasses the command dispatcher (titlebar toggles, NavRail,
 * MonitorToggle, map zoom). The LockOverlay is a SIBLING outside the
 * inert subtree so its own password/sign-out input keeps working, and
 * it covers the full window rather than the content region alone.
 */
export function MainWindow() {
  const { theme } = useTheme()
  const locked = useSessionStore(state => state.state === 'locked')

  // Set up global event listeners (keyboard shortcuts, etc.)
  useMainWindowEventListeners()

  // PR #9 fix-delta N2: `inert` does not cross React portals — the
  // Preferences dialog and command palette render into document.body,
  // OUTSIDE the inert shell, and Preferences' Save is a plain mutation
  // (not dispatcher-gated). Dismiss both when the lock fires; discarding
  // in-progress edits is correct — the operator walked away. (The other
  // full-screen surfaces — ImageViewer/VideoPlayer — are in-tree
  // absolute overlays inside the board, so inert already covers them;
  // toasts carry no actions.)
  useEffect(() => {
    if (locked) {
      useUIStore.getState().setPreferencesOpen(false)
      useUIStore.getState().setCommandPaletteOpen(false)
    }
  }, [locked])

  return (
    <div className="relative flex h-screen w-full flex-col overflow-hidden rounded-xl bg-background">
      <div
        inert={locked}
        data-testid="lockable-shell"
        className="flex min-h-0 flex-1 flex-col"
      >
        <TitleBar />

        <div className="flex flex-1 overflow-hidden">
          <MainWindowContent className="flex-1" />
        </div>
      </div>

      {locked && <SessionLockOverlay />}

      {/* Global UI Components (hidden until triggered) */}
      <CommandPalette />
      <PreferencesDialog />
      <Toaster
        position="bottom-right"
        theme={
          theme === 'dark' ? 'dark' : theme === 'light' ? 'light' : 'system'
        }
        className="toaster group"
        toastOptions={{
          classNames: {
            toast:
              'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
            description: 'group-[.toast]:text-muted-foreground',
            actionButton:
              'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
            cancelButton:
              'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
          },
        }}
      />
    </div>
  )
}

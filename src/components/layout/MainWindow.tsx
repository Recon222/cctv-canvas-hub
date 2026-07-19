import { TitleBar } from '@/components/titlebar/TitleBar'
import { MainWindowContent } from './MainWindowContent'
import { CommandPalette } from '@/features/command-palette'
import { PreferencesDialog } from '@/features/preferences'
import { Toaster } from 'sonner'
import { useTheme } from '@/hooks/use-theme'
import { useMainWindowEventListeners } from '@/hooks/useMainWindowEventListeners'

/**
 * Map-maximal shell (spec §4): TitleBar + full-bleed content, no
 * edge-docked side panels (AD9 — the sidebar files stay dormant for a
 * later /cleanup). Global overlays (palette, preferences, toasts) remain.
 */
export function MainWindow() {
  const { theme } = useTheme()

  // Set up global event listeners (keyboard shortcuts, etc.)
  useMainWindowEventListeners()

  return (
    <div className="flex h-screen w-full flex-col overflow-hidden rounded-xl bg-background">
      <TitleBar />

      <div className="flex flex-1 overflow-hidden">
        <MainWindowContent className="flex-1" />
      </div>

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

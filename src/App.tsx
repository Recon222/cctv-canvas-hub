import { useEffect } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
import { initializeCommandSystem } from './lib/commands'
import { buildAppMenu, setupMenuLanguageListener } from './lib/menu'
import { initializeLanguage } from './i18n/language-init'
import { logger } from './lib/logger'
import { cleanupOldFiles } from './lib/recovery'
import { loadPreferences } from './features/preferences/services/preferencesService'
import './App.css'
import { MainWindow } from './components/layout/MainWindow'
import { ThemeProvider } from './components/ThemeProvider'
import { ErrorBoundary } from './components/ErrorBoundary'

/**
 * App Component - Top-Level Orchestrator
 *
 * This is a non-routed Tauri app. Orchestration happens at the
 * App/Layout level (Phase 3.1 pattern):
 *
 * 1. App.tsx: Bootstraps command system, language, menu, auto-updater
 * 2. MainWindow: Composes layout with features (preferences, command palette)
 * 3. Features: Self-contained modules in src/features/
 *
 * Data flow: App → ThemeProvider → MainWindow → Features
 */
function App() {
  // Initialize command system and cleanup on app startup
  useEffect(() => {
    logger.info('🚀 Frontend application starting up')
    initializeCommandSystem()
    logger.debug('Command system initialized')

    // Initialize language based on saved preference or system locale
    const initLanguageAndMenu = async () => {
      // A preferences read failure must not take down i18n or the native menu —
      // neither needs prefs (language falls back to the system locale).
      let savedLanguage: string | null = null
      try {
        savedLanguage = (await loadPreferences()).language
      } catch (error) {
        logger.error(
          'Failed to load saved language preference; using system locale',
          { error }
        )
      }

      try {
        // Initialize language (will use system locale if no preference)
        await initializeLanguage(savedLanguage)

        // Build the application menu with the initialized language
        await buildAppMenu()
        logger.debug('Application menu built')
        setupMenuLanguageListener()
      } catch (error) {
        logger.error('Failed to initialize language or menu', { error })
      }
    }

    initLanguageAndMenu()

    // Clean up old recovery files on startup
    cleanupOldFiles().catch(error => {
      logger.warn('Failed to cleanup old recovery files', { error })
    })

    // Example of logging with context
    logger.info('App environment', {
      isDev: import.meta.env.DEV,
      mode: import.meta.env.MODE,
    })

    // Auto-updater logic - check for updates 5 seconds after app loads
    const checkForUpdates = async () => {
      try {
        const update = await check()
        if (update) {
          logger.info(`Update available: ${update.version}`)

          // Show confirmation dialog
          const shouldUpdate = confirm(
            `Update available: ${update.version}\n\nWould you like to install this update now?`
          )

          if (shouldUpdate) {
            try {
              // Download and install with progress logging
              await update.downloadAndInstall(event => {
                switch (event.event) {
                  case 'Started':
                    logger.info(`Downloading ${event.data.contentLength} bytes`)
                    break
                  case 'Progress':
                    logger.info(`Downloaded: ${event.data.chunkLength} bytes`)
                    break
                  case 'Finished':
                    logger.info('Download complete, installing...')
                    break
                }
              })

              // Ask if user wants to restart now
              const shouldRestart = confirm(
                'Update completed successfully!\n\nWould you like to restart the app now to use the new version?'
              )

              if (shouldRestart) {
                await relaunch()
              }
            } catch (updateError) {
              logger.error(`Update installation failed: ${String(updateError)}`)
              alert(
                `Update failed: There was a problem with the automatic download.\n\n${String(updateError)}`
              )
            }
          }
        }
      } catch (checkError) {
        logger.error(`Update check failed: ${String(checkError)}`)
        // Silent fail for update checks - don't bother user with network issues
      }
    }

    // Check for updates 5 seconds after app loads
    const updateTimer = setTimeout(checkForUpdates, 5000)
    return () => clearTimeout(updateTimer)
  }, [])

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <MainWindow />
      </ThemeProvider>
    </ErrorBoundary>
  )
}

export default App

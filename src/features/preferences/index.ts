/**
 * Preferences Feature - Public API
 *
 * Outside code MUST import from this file, never from internal paths.
 */

// Export components
export { PreferencesDialog } from './components/PreferencesDialog'

// Export hooks (needed by ThemeProvider and other external consumers)
export { usePreferences, useSavePreferences } from './hooks/usePreferences'

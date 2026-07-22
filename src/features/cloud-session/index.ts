/**
 * Cloud Session Feature - Public API
 *
 * Outside code MUST import from this file, never from internal paths.
 */

export { SetupScreen } from './components/SetupScreen'
export { SignInScreen } from './components/SignInScreen'
export { SchemaGateScreen } from './components/SchemaGateScreen'
export { SignOutButton } from './components/SignOutButton'
export {
  ConnectionIndicator,
  ConnectionBanner,
} from './components/ConnectionIndicator'
export { SessionLockOverlay } from './components/LockOverlay'
export { useSessionStore } from './store/session-store'
export { useAuthBootstrap } from './hooks/useAuthBootstrap'
export { useIdleLock } from './hooks/useIdleLock'
// Sign-out action for non-component callers (the palette's
// session-sign-out command, 5.3B); SignOutButton stays the UI surface.
export { signOut } from './services/authService'
// The schema gate constant — CanvassRoot's panel footer chip (6.3C);
// the process-panel takes it as a host-supplied string (AD11: no
// process-panel → cloud-session seam).
export { APP_REQUIRED_SCHEMA_VERSION } from './services/authService'
export type { SessionState } from './types'

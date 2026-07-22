import {
  SchemaGateScreen,
  SessionLockOverlay,
  SetupScreen,
  SignInScreen,
  useAuthBootstrap,
  useIdleLock,
  useSessionStore,
} from '@/features/cloud-session'
import { CanvassRoot } from '@/features/canvass'
import { cn } from '@/lib/utils'

interface MainWindowContentProps {
  className?: string
}

/**
 * Single mount point for the session state machine (doc 01 §5.4):
 * bootstrap runs here, and the screen renders by session state.
 * `booting` shows the calm empty shell until bootstrap resolves —
 * the bootstrap guarantees it always exits to another state.
 *
 * Lock (Flow F, 6.1): the board mounts for `active` AND `locked` — a
 * locked board keeps flowing unchanged — with the input-swallowing
 * overlay layered above it while locked (relative/absolute pair).
 */
export function MainWindowContent({ className }: MainWindowContentProps) {
  useAuthBootstrap()
  useIdleLock()
  const state = useSessionStore(s => s.state)

  return (
    <div
      className={cn('relative flex h-full flex-col bg-background', className)}
    >
      {state === 'needs-setup' && <SetupScreen />}
      {state === 'signed-out' && <SignInScreen />}
      {state === 'schema-gate' && <SchemaGateScreen />}
      {(state === 'active' || state === 'locked') && <CanvassRoot />}
      {state === 'locked' && <SessionLockOverlay />}
    </div>
  )
}

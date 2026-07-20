import {
  ConnectedPlaceholder,
  SchemaGateScreen,
  SetupScreen,
  SignInScreen,
  useAuthBootstrap,
  useSessionStore,
} from '@/features/cloud-session'
import { cn } from '@/lib/utils'

interface MainWindowContentProps {
  className?: string
}

/**
 * Single mount point for the session state machine (doc 01 §5.4):
 * bootstrap runs here, and the screen renders by session state.
 * `booting` shows the calm empty shell until bootstrap resolves —
 * the bootstrap guarantees it always exits to another state.
 */
export function MainWindowContent({ className }: MainWindowContentProps) {
  useAuthBootstrap()
  const state = useSessionStore(s => s.state)

  return (
    <div className={cn('flex h-full flex-col bg-background', className)}>
      {state === 'needs-setup' && <SetupScreen />}
      {state === 'signed-out' && <SignInScreen />}
      {state === 'schema-gate' && <SchemaGateScreen />}
      {(state === 'active' || state === 'locked') && <ConnectedPlaceholder />}
    </div>
  )
}

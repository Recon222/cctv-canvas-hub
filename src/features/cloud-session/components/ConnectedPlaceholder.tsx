import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { useSessionStore } from '../store/session-store'
import { APP_REQUIRED_SCHEMA_VERSION, signOut } from '../services/authService'

/**
 * Temporary M1 stand-in for the canvass board — Phase 2.4D swaps this for
 * the real CanvassRoot. Shows the connected state and a sign-out escape.
 */
export function ConnectedPlaceholder() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      useSessionStore.getState().setState('signed-out')
    } catch (cause) {
      logger.error('Sign-out failed', { cause })
      toast.error(t('cloudSession.connected.signOutFailed'))
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 bg-zinc-950 text-zinc-100">
      <p className="text-5xl font-semibold tracking-tight">
        {t('cloudSession.connected.status', {
          version: APP_REQUIRED_SCHEMA_VERSION,
        })}
      </p>
      <p className="text-xl text-zinc-400">
        {t('cloudSession.connected.description')}
      </p>
      <Button
        size="lg"
        variant="outline"
        disabled={busy}
        onClick={() => void handleSignOut()}
        className="text-lg"
      >
        {t('cloudSession.connected.signOut')}
      </Button>
    </div>
  )
}

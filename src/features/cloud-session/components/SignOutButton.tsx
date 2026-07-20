import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { useSessionStore } from '../store/session-store'
import { signOut } from '../services/authService'

/**
 * The board's sign-out escape (kept reachable after the M1 placeholder
 * was retired — ledger D4). Auth actions live in cloud-session; other
 * features mount this via the barrel.
 */
export function SignOutButton() {
  const { t } = useTranslation()
  const [busy, setBusy] = useState(false)

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
      useSessionStore.getState().setState('signed-out')
    } catch (cause) {
      logger.error('Sign-out failed', { cause })
      toast.error(t('cloudSession.signOutFailed'))
      setBusy(false)
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={t('cloudSession.signOut')}
      title={t('cloudSession.signOut')}
      disabled={busy}
      onClick={() => void handleSignOut()}
      className="text-zinc-400 hover:text-zinc-100"
    >
      <LogOut className="size-5" aria-hidden />
    </Button>
  )
}

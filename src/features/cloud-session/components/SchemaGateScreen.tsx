import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { logger } from '@/lib/logger'
import { useSessionStore } from '../store/session-store'
import {
  APP_REQUIRED_SCHEMA_VERSION,
  fetchSchemaVersion,
  signOut,
} from '../services/authService'

/**
 * Re-check the cloud's schema version; unblock to `active` if it now
 * matches. Module-level so the mount effect has no reactive deps.
 */
async function checkVersion(setFound: (v: number | null) => void) {
  try {
    const version = await fetchSchemaVersion()
    setFound(version)
    if (
      version === APP_REQUIRED_SCHEMA_VERSION &&
      // A late-resolving check must not override a state the user already
      // left (e.g. a sign-out that completed while this was in flight).
      useSessionStore.getState().state === 'schema-gate'
    ) {
      useSessionStore.getState().setState('active')
    }
  } catch (cause) {
    logger.warn('Schema gate: version check failed', { cause })
    setFound(null)
  }
}

/**
 * Fail-closed blocking screen (AD10): the cloud's schema version does not
 * match what this app understands — no data feature may mount. Shows found
 * vs required, with retry and sign-out escapes (no dead ends).
 */
export function SchemaGateScreen() {
  const { t } = useTranslation()
  const [found, setFound] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void checkVersion(setFound)
  }, [])

  const retry = async () => {
    setBusy(true)
    await checkVersion(setFound)
    setBusy(false)
  }

  const handleSignOut = async () => {
    setBusy(true)
    try {
      await signOut()
    } catch (cause) {
      logger.warn('Sign-out from schema gate failed; leaving anyway', { cause })
      toast.error(t('cloudSession.gate.signOutFailed'))
    }
    useSessionStore.getState().setState('signed-out')
    setBusy(false)
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-8 text-zinc-100">
      <div className="flex w-full max-w-2xl flex-col gap-8 text-start">
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl font-semibold tracking-tight text-amber-400">
            {t('cloudSession.gate.title')}
          </h1>
          <p className="text-xl text-zinc-400">
            {t('cloudSession.gate.description')}
          </p>
        </div>
        <div className="flex flex-col gap-2 text-2xl">
          <p>
            {t('cloudSession.gate.requiredVersion', {
              version: APP_REQUIRED_SCHEMA_VERSION,
            })}
          </p>
          <p>
            {found !== null
              ? t('cloudSession.gate.foundVersion', { version: found })
              : t('cloudSession.gate.foundVersionUnknown')}
          </p>
        </div>
        <div className="flex gap-4">
          <Button
            size="lg"
            disabled={busy}
            onClick={() => void retry()}
            className="text-lg"
          >
            {t('cloudSession.gate.retry')}
          </Button>
          <Button
            size="lg"
            variant="outline"
            disabled={busy}
            onClick={() => void handleSignOut()}
            className="text-lg"
          >
            {t('cloudSession.gate.signOut')}
          </Button>
        </div>
      </div>
    </div>
  )
}

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
 *
 * Case File restyle (design_handoff §7 schema-mismatch): red safety-gate
 * eyebrow, Nacelle title, version lines in a danger-bordered panel. The
 * exact version strings are test contracts — presentation only.
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
    <div className="flex h-full flex-col items-center justify-center bg-hub-ground px-8 font-inter text-hub-body [background-image:radial-gradient(900px_500px_at_50%_0%,rgb(248_113_113/6%),transparent_65%)]">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-stmono text-xs uppercase tracking-[4px] text-hub-danger">
            {t('cloudSession.gate.eyebrow')}
          </p>
          <h1 className="font-nacelle text-4xl font-semibold tracking-tight text-hub-heading">
            {t('cloudSession.gate.title')}
          </h1>
          <p className="max-w-lg text-xl text-hub-muted [text-wrap:pretty]">
            {t('cloudSession.gate.description')}
          </p>
        </div>
        <div className="flex flex-col gap-2 rounded-md border border-hub-danger/45 bg-hub-danger/5 px-7 py-6 text-center font-jbmono text-2xl text-hub-heading">
          <p>
            {t('cloudSession.gate.requiredVersion', {
              version: APP_REQUIRED_SCHEMA_VERSION,
            })}
          </p>
          <p className="text-hub-danger">
            {found !== null
              ? t('cloudSession.gate.foundVersion', { version: found })
              : t('cloudSession.gate.foundVersionUnknown')}
          </p>
        </div>
        <div className="flex flex-col items-center gap-3">
          <div className="flex gap-4">
            <Button
              size="lg"
              disabled={busy}
              onClick={() => void retry()}
              className="rounded border border-hub-accent/40 bg-hub-accent/10 font-stmono text-[13px] uppercase tracking-[2.5px] text-hub-heading hover:bg-hub-accent/20"
            >
              {t('cloudSession.gate.retry')}
            </Button>
            <Button
              size="lg"
              variant="outline"
              disabled={busy}
              onClick={() => void handleSignOut()}
              className="rounded border-hub-hairline bg-transparent font-stmono text-[13px] uppercase tracking-[2.5px] text-hub-muted hover:text-hub-heading"
            >
              {t('cloudSession.gate.signOut')}
            </Button>
          </div>
          <p className="text-center text-[13px] text-hub-faint">
            {t('cloudSession.gate.adminNote')}
          </p>
        </div>
      </div>
    </div>
  )
}

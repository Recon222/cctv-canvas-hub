/**
 * Flow A/B orchestration: load config → init client → restore → gate.
 *
 * Failure lands in the nearest safe state (needs-setup on config errors,
 * signed-out on auth errors) with a toast — never an infinite `booting`.
 */

import { useEffect } from 'react'
import { toast } from 'sonner'
import i18n from '@/i18n/config'
import { logger } from '@/lib/logger'
import { initSupabase } from '@/lib/supabase/client'
import { useSessionStore } from '../store/session-store'
import { loadConfig } from '../services/configService'
import { restoreSession, checkSchemaGate } from '../services/authService'

export function useAuthBootstrap(): void {
  useEffect(() => {
    void bootstrap()
  }, [])
}

async function bootstrap(): Promise<void> {
  const { setState } = useSessionStore.getState()

  let config
  try {
    config = await loadConfig()
  } catch (cause) {
    logger.error('Bootstrap: failed to load cloud config', { cause })
    toast.error(i18n.t('cloudSession.errors.configLoadFailed'))
    setState('needs-setup')
    return
  }
  if (!config) {
    setState('needs-setup')
    return
  }

  try {
    initSupabase(config)
    const restored = await restoreSession()
    if (!restored) {
      setState('signed-out')
      return
    }
    const gate = await checkSchemaGate()
    if (gate !== 'ok') {
      setState('schema-gate')
      return
    }
    // PR #9 H1: the idle lock survives a reload/relaunch — a restored
    // session re-enters `locked` when the persisted flag is set, never
    // `active` (F5/crash/updater must not drop the wall passwordless).
    setState(config.locked ? 'locked' : 'active')
  } catch (cause) {
    logger.error('Bootstrap: session restore failed', { cause })
    toast.error(i18n.t('cloudSession.errors.bootstrapFailed'))
    setState('signed-out')
  }
}

import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import i18n from '@/i18n/config'
import { logger } from '@/lib/logger'
import {
  ensureFreshSession,
  getSupabase,
  type SupabaseClient,
} from '@/lib/supabase/client'
import { useSessionStore } from '@/features/cloud-session'
import { isCaseDataKey, useHealthStore } from '@/store/health-store'

/**
 * Cross-cutting health wiring (Phase 2.5B, AD11): browser online/offline
 * + visibility listeners, the periodic `evaluate` tick, and Flow E
 * catch-up — on reconnect/resubscribe, invalidate the case-data query
 * families via the ALLOW-list (`CASE_DATA_KEY_FAMILIES`, health-store —
 * the same tuple the hooks build their keys from). A deny-list would
 * silently capture every family added later (signed URLs — which
 * refresh on their own interval and must not be mass-regenerated on
 * every wifi blip — preferences, M3/M5 families) (review LOW).
 *
 * 6.2A: every wake path (online / visible / resubscribe) converges on
 * `catchUp` — session validity check, refresh ONLY near/after expiry
 * (`autoRefreshToken` owns routine rotation), `realtime.setAuth()`,
 * THEN the allow-listed invalidation. Refresh failure is an honest
 * sign-out with a toast, never a silent stale board (Flow E3, #106).
 */

const EVALUATE_INTERVAL_MS = 10_000

function invalidateCaseData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: query => isCaseDataKey(query.queryKey[0]),
  })
}

function exitSignedOut(cause: unknown): void {
  logger.error('Wake catch-up: session refresh failed', { cause })
  toast.error(i18n.t('cloudSession.errors.sessionExpired'))
  useSessionStore.getState().setState('signed-out')
}

/** Flow E3 — the one catch-up path every wake signal converges on. */
function catchUp(queryClient: QueryClient): void {
  let supabase: SupabaseClient
  try {
    supabase = getSupabase()
  } catch {
    // No client in this context (pre-init) — nothing to refresh; the
    // catch-up degrades to the plain invalidation.
    invalidateCaseData(queryClient)
    return
  }
  void ensureFreshSession(supabase)
    .then(freshness => {
      if (freshness === 'failed') {
        // Session genuinely dead — never refetch behind a dead token.
        exitSignedOut('refresh refused')
        return
      }
      invalidateCaseData(queryClient)
    })
    .catch((cause: unknown) => {
      // getSession/refreshSession resolve their errors; a rejection is
      // machinery-level breakage — the same honest exit.
      exitSignedOut(cause)
    })
}

export function useConnectionHealth(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const onOnline = () => {
      useHealthStore.getState().setOnline(true)
      catchUp(queryClient)
    }
    const onOffline = () => {
      useHealthStore.getState().setOnline(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        useHealthStore.getState().reevaluate()
        // Flow E3: a restored board catches up immediately instead of
        // waiting out the reconcile interval (refetchInterval is
        // focus-gated while hidden, so data really is stale here).
        catchUp(queryClient)
      }
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    document.addEventListener('visibilitychange', onVisibility)
    const interval = setInterval(() => {
      useHealthStore.getState().reevaluate()
    }, EVALUATE_INTERVAL_MS)

    // Resubscribe detection: a dropped channel coming back is the
    // catch-up moment (Flow E3) — the initial null→subscribed transition
    // is not a reconnect and triggers nothing.
    const unsubscribe = useHealthStore.subscribe((state, previous) => {
      if (
        state.marks.channel === 'subscribed' &&
        previous.marks.channel !== 'subscribed' &&
        previous.marks.channel !== null
      ) {
        catchUp(queryClient)
      }
    })

    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(interval)
      unsubscribe()
    }
  }, [queryClient])
}

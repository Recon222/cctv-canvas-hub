import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { SIGNED_URL_KEY_PREFIX, useHealthStore } from '@/store/health-store'

/**
 * Cross-cutting health wiring (Phase 2.5B, AD11): browser online/offline
 * + visibility listeners, the periodic `evaluate` tick, and Flow E
 * catch-up — on reconnect/resubscribe, invalidate case-data queries via
 * the exclusion predicate on `SIGNED_URL_KEY_PREFIX` (signed URLs
 * refresh on their own interval and must not be mass-regenerated on
 * every wifi blip; the predicate matches nothing until M4).
 *
 * Wake-time session refresh (`getSession`/`refreshSession` near expiry)
 * is Phase 6.2 — not wired here yet.
 */

const EVALUATE_INTERVAL_MS = 10_000

function invalidateCaseData(queryClient: QueryClient): void {
  void queryClient.invalidateQueries({
    predicate: query => query.queryKey[0] !== SIGNED_URL_KEY_PREFIX,
  })
}

export function useConnectionHealth(): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    const onOnline = () => {
      useHealthStore.getState().setOnline(true)
      invalidateCaseData(queryClient)
    }
    const onOffline = () => {
      useHealthStore.getState().setOnline(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        useHealthStore.getState().reevaluate()
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
        invalidateCaseData(queryClient)
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

import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { canPoll, useHealthStore } from '@/store/health-store'
import { useSessionStore } from '@/features/cloud-session'
import { MEDIA_POLL_MS } from '../services/mediaService'
import { diffMedia, mediaEntry } from '../services/attention'
import { useCanvassStore } from '../store/canvass-store'
import { caseMediaQueryOptions } from './useCaseMedia'
import type { CanvassMedia } from '../types'

/**
 * The media freshness loop (Phase 4.2B, Flow D, G3): refetch the case's
 * media every `MEDIA_POLL_MS` while the session is `active` OR `locked`
 * (a locked wall board keeps polling — doc 01 §5.4) and the connection
 * is not `offline` (health-store `canPoll` — the D14 consumer). Each
 * new row by id becomes a `media-new` activity entry + an attention
 * stamp on its location.
 *
 * Poll failures feed `recordFetchError()` inside the shared queryFn —
 * a health signal, never a per-tick toast; the next tick retries.
 *
 * The per-location event accelerator (any location event invalidates
 * the case's media) already ships in M2's useCaseRealtime — this poll
 * is the safety net under it, and its diff also announces rows the
 * accelerator's invalidation pulls in.
 */
export function useMediaPolling(caseId: string | null): void {
  const session = useSessionStore(state => state.state)
  const health = useHealthStore(state => state.state)
  const pollingEnabled =
    caseId !== null &&
    (session === 'active' || session === 'locked') &&
    canPoll(health)

  const { data } = useQuery({
    ...caseMediaQueryOptions(caseId),
    enabled: pollingEnabled,
    refetchInterval: pollingEnabled ? MEDIA_POLL_MS : false,
  })

  /** Last list seen PER CASE — a case switch re-baselines instead of
   * reporting the next case's whole backlog as news. `null` list means
   * "no baseline yet": the first load is the baseline, not news. */
  const baselineRef = useRef<{
    caseId: string | null
    list: CanvassMedia[] | null
  }>({ caseId: null, list: null })

  useEffect(() => {
    if (baselineRef.current.caseId !== caseId) {
      baselineRef.current = { caseId, list: null }
    }
    if (data === undefined) {
      return
    }
    const previous = baselineRef.current.list
    baselineRef.current = { caseId, list: data }
    if (previous === null) {
      return
    }
    for (const row of diffMedia(previous, data)) {
      useCanvassStore.getState().pushActivity(mediaEntry(row))
    }
  }, [caseId, data])
}

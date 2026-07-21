import { useQuery } from '@tanstack/react-query'
import { MEDIA_KEY, useHealthStore } from '@/store/health-store'
import { fetchMedia } from '../services/canvassService'

/**
 * The single definition of the case-media query — `useCaseMedia`
 * (read-only observers: media strips, dashboard) and `useMediaPolling`
 * (the 20 s freshness interval, Flow D) share it so the key and the
 * health-feeding fetch can never drift apart.
 */
export function caseMediaQueryOptions(caseId: string | null) {
  return {
    queryKey: [MEDIA_KEY, caseId],
    queryFn: async () => {
      if (caseId === null) {
        throw new Error('case media query requires a selected case')
      }
      try {
        const media = await fetchMedia(caseId)
        useHealthStore.getState().recordFetchOk()
        return media
      } catch (cause) {
        useHealthStore.getState().recordFetchError()
        throw cause
      }
    },
  }
}

/** Case-partitioned media list (G6) — fetch-on-mount + realtime-triggered
 * invalidation; the poll interval lives in `useMediaPolling`. */
export function useCaseMedia(caseId: string | null) {
  return useQuery({
    ...caseMediaQueryOptions(caseId),
    enabled: caseId !== null,
  })
}

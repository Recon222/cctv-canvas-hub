import { useQuery } from '@tanstack/react-query'
import { MEDIA_KEY, useHealthStore } from '@/store/health-store'
import { fetchMedia } from '../services/canvassService'

/**
 * Case-partitioned media list (G6). The 20 s freshness poll arrives with
 * M4 (`useMediaPolling`, Flow D) — until then this is fetch-on-mount
 * plus realtime-triggered invalidation.
 */
export function useCaseMedia(caseId: string | null) {
  return useQuery({
    queryKey: [MEDIA_KEY, caseId],
    queryFn: async () => {
      if (caseId === null) {
        throw new Error('useCaseMedia requires a selected case')
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
    enabled: caseId !== null,
  })
}

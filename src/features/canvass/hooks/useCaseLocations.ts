import { useQuery } from '@tanstack/react-query'
import {
  LOCATIONS_KEY,
  RECONCILE_MS,
  useHealthStore,
} from '@/store/health-store'
import { fetchLocations } from '../services/canvassService'

/** Case-partitioned location list (G6) with the reconcile safety net. */
export function useCaseLocations(caseId: string | null) {
  return useQuery({
    queryKey: [LOCATIONS_KEY, caseId],
    queryFn: async () => {
      if (caseId === null) {
        throw new Error('useCaseLocations requires a selected case')
      }
      try {
        const locations = await fetchLocations(caseId)
        useHealthStore.getState().recordFetchOk()
        return locations
      } catch (cause) {
        useHealthStore.getState().recordFetchError()
        throw cause
      }
    },
    enabled: caseId !== null,
    refetchInterval: RECONCILE_MS,
  })
}

import { useQuery } from '@tanstack/react-query'
import {
  LOCATION_COUNTS_KEY,
  RECONCILE_MS,
  useHealthStore,
} from '@/store/health-store'
import { fetchLocationCounts } from '../services/canvassService'

/**
 * The landing view's status counts — one agency-wide query (three
 * integers per case) with the reconcile safety net. Realtime keeps it
 * live: any `cloud_locations` broadcast invalidates `['location-counts']`
 * regardless of which case is selected (useCaseRealtime).
 */
export function useLocationCounts(caseIds: string[]) {
  // Sorted so the key is stable across list reorders (cases re-sort on
  // every update); membership changes still refetch.
  const sorted = [...caseIds].sort()
  return useQuery({
    queryKey: [LOCATION_COUNTS_KEY, sorted],
    queryFn: async () => {
      try {
        const counts = await fetchLocationCounts(sorted)
        useHealthStore.getState().recordFetchOk()
        return counts
      } catch (cause) {
        useHealthStore.getState().recordFetchError()
        throw cause
      }
    },
    enabled: sorted.length > 0,
    refetchInterval: RECONCILE_MS,
  })
}

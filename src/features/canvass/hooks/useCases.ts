import { useQuery } from '@tanstack/react-query'
import { CASES_KEY, RECONCILE_MS, useHealthStore } from '@/store/health-store'
import { fetchCases } from '../services/canvassService'

/**
 * The active-case list. Fetch results feed the health store — successes
 * are liveness confirmations, failures are degradation evidence (G4).
 * The slow reconcile interval is the lost-broadcast safety net (Flow E4).
 */
export function useCases() {
  return useQuery({
    queryKey: [CASES_KEY],
    queryFn: async () => {
      try {
        const cases = await fetchCases()
        useHealthStore.getState().recordFetchOk()
        return cases
      } catch (cause) {
        useHealthStore.getState().recordFetchError()
        throw cause
      }
    },
    refetchInterval: RECONCILE_MS,
  })
}

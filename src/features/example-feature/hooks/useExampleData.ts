/**
 * Orchestration Layer - TanStack Query Hooks
 *
 * Hooks wrap service functions with TanStack Query for:
 * - Automatic caching, deduplication, and background refetching
 * - Built-in loading/error states (no manual useState)
 * - Cache invalidation on mutations
 *
 * This is the ONLY data-fetching pattern in the codebase.
 */

import { useQuery } from '@tanstack/react-query'
import { greetUser } from '../services/exampleService'

export function useGreeting(name: string) {
  return useQuery({
    queryKey: ['example', 'greeting', name],
    queryFn: () => greetUser(name),
    enabled: name.length > 0,
  })
}

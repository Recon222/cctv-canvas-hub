/**
 * Preferences Hooks - TanStack Query Orchestration
 *
 * Wraps service functions with TanStack Query for caching,
 * deduplication, loading/error states, and cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { logger } from '@/lib/logger'
import {
  loadPreferences,
  savePreferences,
  getDefaultQuickPaneShortcut,
} from '../services/preferencesService'

export const preferencesQueryKeys = {
  all: ['preferences'] as const,
  preferences: () => [...preferencesQueryKeys.all] as const,
  defaultShortcut: ['default-quick-pane-shortcut'] as const,
}

export function usePreferences() {
  return useQuery({
    queryKey: preferencesQueryKeys.preferences(),
    queryFn: loadPreferences,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 10, // 10 minutes
  })
}

export function useSavePreferences() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: savePreferences,
    onSuccess: (_data, preferences) => {
      // Update the cache with the new preferences
      queryClient.setQueryData(preferencesQueryKeys.preferences(), preferences)
      logger.info('Preferences cache updated')
      toast.success('Preferences saved')
    },
    onError: (error: Error) => {
      toast.error('Failed to save preferences', {
        description: error.message,
      })
    },
  })
}

export function useDefaultQuickPaneShortcut() {
  return useQuery({
    queryKey: preferencesQueryKeys.defaultShortcut,
    queryFn: getDefaultQuickPaneShortcut,
    staleTime: Infinity, // Never refetch - this is a constant
  })
}

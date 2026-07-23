import { useEffect } from 'react'
import { usePreferences } from '@/features/preferences'
import { initializeLanguage } from '@/i18n'
import { logger } from '@/lib/logger'

/**
 * Language parity for secondary windows (M7, 7.1B): initializes i18n
 * from the saved preference through the barrel-exported hook — the
 * sanctioned preferences seam (AD11; App.tsx's relative deep import of
 * the service predates the plan and must not be copied).
 */
export function LanguageSync() {
  const { data: preferences } = usePreferences()
  useEffect(() => {
    if (preferences !== undefined) {
      initializeLanguage(preferences.language).catch((cause: unknown) => {
        logger.error('secondary: language init failed', { cause })
      })
    }
  }, [preferences])
  return null
}

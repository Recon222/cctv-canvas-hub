import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SettingsField, SettingsSection } from '../shared/SettingsComponents'
import { usePreferences, useSavePreferences } from '../../hooks/usePreferences'

/**
 * Map + kiosk preferences (Phase 3.1B): Mapbox token (password-style —
 * kept out of shoulder view on a shared machine, though it is a
 * designed-public `pk.` value), map style (A2 design binding:
 * satellite-night default), and the idle-lock minutes M6 consumes.
 *
 * Text/number fields persist on blur (a keystroke-level save would spam
 * the atomic-write path); the style select persists on change like the
 * theme select.
 */

/** The A2-pinned style choices; null preference means the default. */
export const DEFAULT_MAP_STYLE = 'standard-satellite'
const MAP_STYLES = ['standard-satellite', 'standard', 'dark-v11'] as const

const STYLE_LABEL_KEYS: Record<(typeof MAP_STYLES)[number], string> = {
  'standard-satellite': 'preferences.map.style.standardSatellite',
  standard: 'preferences.map.style.standard',
  'dark-v11': 'preferences.map.style.darkV11',
}

export function MapPane() {
  const { t } = useTranslation()
  const { data: preferences } = usePreferences()
  const savePreferences = useSavePreferences()
  // Local drafts while typing; null = not editing, show the saved value.
  const [tokenDraft, setTokenDraft] = useState<string | null>(null)
  const [minutesDraft, setMinutesDraft] = useState<string | null>(null)

  const disabled = !preferences || savePreferences.isPending

  const commitToken = () => {
    if (tokenDraft === null || !preferences) {
      return
    }
    const trimmed = tokenDraft.trim()
    const next = trimmed === '' ? null : trimmed
    if (next !== preferences.mapbox_token) {
      savePreferences.mutate({ ...preferences, mapbox_token: next })
    }
    setTokenDraft(null)
  }

  const commitMinutes = () => {
    if (minutesDraft === null || !preferences) {
      return
    }
    const parsed = Number.parseInt(minutesDraft, 10)
    // Empty or nonsense reverts to the default (null → 15, doc 01 §5.3).
    const next = Number.isNaN(parsed) || parsed < 1 ? null : parsed
    if (next !== preferences.idle_lock_minutes) {
      savePreferences.mutate({ ...preferences, idle_lock_minutes: next })
    }
    setMinutesDraft(null)
  }

  const handleStyleChange = (value: string) => {
    if (preferences) {
      savePreferences.mutate({ ...preferences, map_style: value })
    }
  }

  return (
    <div className="space-y-6">
      <SettingsSection title={t('preferences.map.section.display')}>
        <SettingsField
          label={t('preferences.map.mapboxToken')}
          description={t('preferences.map.mapboxTokenDescription')}
        >
          <Input
            type="password"
            aria-label={t('preferences.map.mapboxToken')}
            placeholder={t('preferences.map.mapboxTokenPlaceholder')}
            value={tokenDraft ?? preferences?.mapbox_token ?? ''}
            onChange={event => {
              setTokenDraft(event.target.value)
            }}
            onBlur={commitToken}
            disabled={disabled}
          />
        </SettingsField>

        <SettingsField
          label={t('preferences.map.style')}
          description={t('preferences.map.styleDescription')}
        >
          <Select
            value={preferences?.map_style ?? DEFAULT_MAP_STYLE}
            onValueChange={handleStyleChange}
            disabled={disabled}
          >
            <SelectTrigger aria-label={t('preferences.map.style')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAP_STYLES.map(style => (
                <SelectItem key={style} value={style}>
                  {t(STYLE_LABEL_KEYS[style])}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
      </SettingsSection>

      <SettingsSection title={t('preferences.map.section.kiosk')}>
        <SettingsField
          label={t('preferences.map.idleLockMinutes')}
          description={t('preferences.map.idleLockMinutesDescription')}
        >
          <Input
            type="number"
            min={1}
            aria-label={t('preferences.map.idleLockMinutes')}
            placeholder="15"
            value={minutesDraft ?? preferences?.idle_lock_minutes ?? ''}
            onChange={event => {
              setMinutesDraft(event.target.value)
            }}
            onBlur={commitMinutes}
            disabled={disabled}
          />
        </SettingsField>
      </SettingsSection>
    </div>
  )
}

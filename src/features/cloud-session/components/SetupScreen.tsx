import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { initSupabase } from '@/lib/supabase/client'
import { useSessionStore } from '../store/session-store'
import {
  parseEnrollmentPayload,
  probeProject,
  saveConfig,
  EnrollmentPayloadError,
  ProbeRejectedError,
  ProbeUnreachableError,
} from '../services/configService'

/**
 * First-run enrollment (Flow A): paste `{v,url,key}` → probe → save →
 * init client → signed-out. Wall-legible: large type, dark, calm.
 */
export function SetupScreen() {
  const { t } = useTranslation()
  const [payload, setPayload] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      const { url, key } = parseEnrollmentPayload(payload)
      await probeProject(url, key)
      const config = { url, publishable_key: key, signed_in_email: null }
      await saveConfig(config)
      initSupabase(config)
      useSessionStore.getState().setState('signed-out')
    } catch (cause) {
      if (cause instanceof EnrollmentPayloadError) {
        setError(t('cloudSession.setup.invalidPayload'))
      } else if (cause instanceof ProbeRejectedError) {
        setError(t('cloudSession.setup.probeRejected'))
      } else if (cause instanceof ProbeUnreachableError) {
        setError(t('cloudSession.setup.probeUnreachable'))
      } else {
        setError(t('cloudSession.setup.saveFailed'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-8 text-zinc-100">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col gap-3 text-start">
          <h1 className="text-4xl font-semibold tracking-tight">
            {t('cloudSession.setup.title')}
          </h1>
          <p className="text-xl text-zinc-400">
            {t('cloudSession.setup.description')}
          </p>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            void submit()
          }}
        >
          <Label htmlFor="enrollment-payload" className="text-lg">
            {t('cloudSession.setup.payloadLabel')}
          </Label>
          <Textarea
            id="enrollment-payload"
            value={payload}
            onChange={event => setPayload(event.target.value)}
            placeholder={t('cloudSession.setup.payloadPlaceholder')}
            disabled={busy}
            rows={4}
            className="bg-zinc-900 font-mono !text-base"
          />
          {error && (
            <p role="alert" className="text-lg text-red-400">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={busy || payload.trim() === ''}
            className="text-lg"
          >
            {busy
              ? t('cloudSession.setup.probing')
              : t('cloudSession.setup.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}

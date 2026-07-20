import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { initSupabase } from '@/lib/supabase/client'
import { useSessionStore } from '../store/session-store'
import { CornerFrame } from './CornerFrame'
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
 *
 * Case File restyle (design_handoff §7): gold eyebrow, Nacelle display
 * title, corner-bracketed enrollment panel. Flow logic unchanged.
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
    <div className="flex h-full flex-col items-center justify-center bg-hub-ground px-8 font-inter text-hub-body [background-image:radial-gradient(900px_500px_at_50%_0%,rgb(43_140_193/8%),transparent_65%)]">
      <div className="flex w-full max-w-2xl flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-stmono text-xs uppercase tracking-[4px] text-hub-working">
            {t('cloudSession.brand')}
          </p>
          <h1 className="font-nacelle text-4xl font-semibold tracking-tight text-hub-heading">
            {t('cloudSession.setup.title')}
          </h1>
          <p className="max-w-lg text-xl text-hub-muted [text-wrap:pretty]">
            {t('cloudSession.setup.description')}
          </p>
        </div>
        <CornerFrame eyebrow={t('cloudSession.setup.panelLabel')}>
          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={event => {
              event.preventDefault()
              void submit()
            }}
          >
            <Label
              htmlFor="enrollment-payload"
              className="font-stmono text-[11px] uppercase tracking-[2px] text-hub-muted"
            >
              {t('cloudSession.setup.payloadLabel')}
            </Label>
            <Textarea
              id="enrollment-payload"
              value={payload}
              onChange={event => setPayload(event.target.value)}
              placeholder={t('cloudSession.setup.payloadPlaceholder')}
              disabled={busy}
              rows={4}
              className="rounded border-hub-input-border bg-hub-input font-jbmono !text-[13px] leading-relaxed text-hub-body-2 placeholder:text-hub-ghost"
            />
            {error && (
              <p role="alert" className="text-lg text-hub-danger">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={busy || payload.trim() === ''}
              className="rounded border border-hub-started/60 bg-hub-started/20 font-stmono text-sm uppercase tracking-[2.5px] text-hub-heading hover:bg-hub-started/30"
            >
              {busy
                ? t('cloudSession.setup.probing')
                : t('cloudSession.setup.submit')}
            </Button>
            <p className="text-center font-stmono text-[10px] uppercase tracking-[1.5px] text-hub-ghost">
              {t('cloudSession.setup.checkedNote')}
            </p>
          </form>
        </CornerFrame>
        <p className="text-center text-[13px] text-hub-faint">
          {t('cloudSession.setup.footer')}
        </p>
      </div>
    </div>
  )
}

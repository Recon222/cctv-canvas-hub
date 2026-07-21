import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSessionStore } from '../store/session-store'
import { CornerFrame } from './CornerFrame'
import { signIn, checkSchemaGate } from '../services/authService'

/**
 * Coordinator password sign-in (Flow A step 4 / Flow B fallback), then the
 * schema gate decides active vs schema-gate. Wall-legible styling.
 *
 * Case File restyle (design_handoff §7). Flow logic unchanged. The
 * connected-host line (agency URL) needs config data — left for wiring
 * agents (noted in HANDOFF.md).
 */
export function SignInScreen() {
  const { t } = useTranslation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password)
      const gate = await checkSchemaGate()
      useSessionStore
        .getState()
        .setState(gate === 'ok' ? 'active' : 'schema-gate')
    } catch (cause) {
      const message =
        cause instanceof Error && cause.message ? cause.message : ''
      setError(t('cloudSession.signIn.failed', { message }))
    } finally {
      setBusy(false)
    }
  }

  const fieldLabel =
    'font-stmono text-[11px] uppercase tracking-[2px] text-hub-muted'
  const fieldInput =
    'h-12 rounded border-hub-input-border bg-hub-input !text-lg text-hub-heading'
  return (
    <div className="flex h-full flex-col items-center justify-center bg-hub-ground px-8 font-inter text-hub-body [background-image:radial-gradient(900px_500px_at_50%_0%,rgb(43_140_193/8%),transparent_65%)]">
      <div className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <p className="font-stmono text-xs uppercase tracking-[4px] text-hub-working">
            {t('cloudSession.brand')}
          </p>
          <h1 className="font-nacelle text-4xl font-semibold tracking-tight text-hub-heading">
            {t('cloudSession.signIn.title')}
          </h1>
          <p className="text-xl text-hub-muted">
            {t('cloudSession.signIn.description')}
          </p>
        </div>
        <CornerFrame eyebrow={t('cloudSession.signIn.panelLabel')}>
          <form
            className="flex flex-col gap-4 p-4"
            onSubmit={event => {
              event.preventDefault()
              void submit()
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="sign-in-email" className={fieldLabel}>
                {t('cloudSession.signIn.emailLabel')}
              </Label>
              <Input
                id="sign-in-email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={event => setEmail(event.target.value)}
                disabled={busy}
                className={fieldInput}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="sign-in-password" className={fieldLabel}>
                {t('cloudSession.signIn.passwordLabel')}
              </Label>
              <Input
                id="sign-in-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                disabled={busy}
                className={fieldInput}
              />
            </div>
            {error && (
              <p role="alert" className="text-lg text-hub-danger">
                {error}
              </p>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={busy || email.trim() === '' || password === ''}
              className="mt-1 rounded border border-hub-started/60 bg-hub-started/20 font-stmono text-sm uppercase tracking-[2.5px] text-hub-heading hover:bg-hub-started/30"
            >
              {busy
                ? t('cloudSession.signIn.signingIn')
                : t('cloudSession.signIn.submit')}
            </Button>
          </form>
        </CornerFrame>
        <p className="text-center text-[13px] text-hub-faint">
          {t('cloudSession.signIn.footer')}
        </p>
      </div>
    </div>
  )
}

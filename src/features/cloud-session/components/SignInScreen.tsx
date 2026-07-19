import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSessionStore } from '../store/session-store'
import { signIn, checkSchemaGate } from '../services/authService'

/**
 * Coordinator password sign-in (Flow A step 4 / Flow B fallback), then the
 * schema gate decides active vs schema-gate. Wall-legible styling.
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

  return (
    <div className="flex h-full flex-col items-center justify-center bg-zinc-950 px-8 text-zinc-100">
      <div className="flex w-full max-w-xl flex-col gap-8">
        <div className="flex flex-col gap-3 text-start">
          <h1 className="text-4xl font-semibold tracking-tight">
            {t('cloudSession.signIn.title')}
          </h1>
          <p className="text-xl text-zinc-400">
            {t('cloudSession.signIn.description')}
          </p>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            void submit()
          }}
        >
          <div className="flex flex-col gap-2">
            <Label htmlFor="sign-in-email" className="text-lg">
              {t('cloudSession.signIn.emailLabel')}
            </Label>
            <Input
              id="sign-in-email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={event => setEmail(event.target.value)}
              disabled={busy}
              className="h-12 bg-zinc-900 !text-lg"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="sign-in-password" className="text-lg">
              {t('cloudSession.signIn.passwordLabel')}
            </Label>
            <Input
              id="sign-in-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
              disabled={busy}
              className="h-12 bg-zinc-900 !text-lg"
            />
          </div>
          {error && (
            <p role="alert" className="text-lg text-red-400">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            disabled={busy || email.trim() === '' || password === ''}
            className="text-lg"
          >
            {busy
              ? t('cloudSession.signIn.signingIn')
              : t('cloudSession.signIn.submit')}
          </Button>
        </form>
      </div>
    </div>
  )
}

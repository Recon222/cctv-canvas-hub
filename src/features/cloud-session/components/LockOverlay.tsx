import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Idle lock overlay (Phase 6.1B, AD6, design_handoff §7): the board
 * stays fully visible and LIVE beneath — this is an input-swallowing
 * veil, never a content change (owner directive: lock alters nothing).
 * Gold frame + top banner say "locked but flowing" at wall distance.
 *
 * Presentational: the host (useIdleLock wiring) mounts it while
 * session === 'locked' and owns re-auth via `onUnlock`.
 */
export interface LockOverlayProps {
  signedInEmail: string | null
  /** Resolve to unlock; throw/reject ⇒ inline error, stays locked. */
  onUnlock: (password: string) => Promise<void>
}

export function LockOverlay({ signedInEmail, onUnlock }: LockOverlayProps) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setError(false)
    setBusy(true)
    try {
      await onUnlock(password)
      setPassword('')
    } catch {
      // Failed re-auth stays locked with an inline error (plan 6.1) —
      // the cause is always a wrong password from the operator's view.
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center">
      {/* Gold viewport frame — locked-but-live, visible from across the room */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 border border-hub-working/40"
      />
      <div className="absolute start-1/2 top-0 flex -translate-x-1/2 items-center gap-2.5 rounded-b-md border border-t-0 border-hub-working/45 bg-hub-working/10 px-4 pb-1 pt-1.5 rtl:translate-x-1/2">
        <Lock className="size-3.5 text-hub-working" aria-hidden />
        <span className="font-stmono text-[11px] uppercase tracking-[3px] text-hub-working">
          {t('cloudSession.lock.banner')}
        </span>
      </div>
      <div className="flex w-[400px] flex-col gap-4 rounded-lg border border-hub-hairline bg-hub-overlay p-7 shadow-2xl backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Lock className="size-5 shrink-0 text-hub-working" aria-hidden />
          <div className="flex flex-col">
            <span className="font-nacelle text-lg font-semibold text-hub-heading">
              {t('cloudSession.lock.title')}
            </span>
            <span className="text-[12.5px] text-hub-muted">
              {t('cloudSession.lock.subtitle')}
            </span>
          </div>
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={event => {
            event.preventDefault()
            void submit()
          }}
        >
          <Input
            type="password"
            autoComplete="current-password"
            aria-label={t('cloudSession.lock.passwordLabel')}
            placeholder={t('cloudSession.lock.passwordLabel')}
            value={password}
            onChange={event => {
              setPassword(event.target.value)
            }}
            disabled={busy}
            className="h-11 rounded border-hub-input-border bg-hub-input !text-[15px] text-hub-heading placeholder:text-hub-ghost"
          />
          {error && (
            <p role="alert" className="text-[14px] text-hub-danger">
              {t('cloudSession.lock.failed')}
            </p>
          )}
          <Button
            type="submit"
            disabled={busy || password === ''}
            className="rounded border border-hub-working/50 bg-hub-working/10 font-stmono text-[13px] uppercase tracking-[2.5px] text-hub-working hover:bg-hub-working/20"
          >
            {t('cloudSession.lock.unlock')}
          </Button>
        </form>
        {signedInEmail !== null && (
          <p className="text-center font-stmono text-[9.5px] uppercase tracking-[1.5px] text-hub-ghost">
            {t('cloudSession.lock.signedInAs', { email: signedInEmail })}
          </p>
        )}
      </div>
    </div>
  )
}

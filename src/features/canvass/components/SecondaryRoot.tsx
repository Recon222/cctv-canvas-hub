import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { Lock } from 'lucide-react'
import type { UnlistenFn } from '@tauri-apps/api/event'
import { cn } from '@/lib/utils'
import { logger } from '@/lib/logger'
import {
  emitSecondaryReady,
  onSessionEnded,
  onSessionLocked,
  onSessionToken,
  onSessionUnlocked,
  onViewContext,
  type PopOutView,
  type SessionTokenPayload,
} from '@/lib/services/sessionEvents'
import {
  initSecondaryClient,
  teardownSecondaryClient,
  updateSecondaryToken,
} from '@/lib/supabase/secondary-client'
import {
  isCaseDataKey,
  lastConfirmAt,
  resetHealthStore,
  useHealthStore,
} from '@/store/health-store'
import {
  ConnectionBanner,
  ConnectionIndicator,
  useSessionStore,
} from '@/features/cloud-session'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { useCases } from '../hooks/useCases'
import { useMediaPolling } from '../hooks/useMediaPolling'
import { MapCanvas } from './MapCanvas'
import { CaseDashboard } from './CaseDashboard'
import { LocationCardStack } from './LocationCardStack'
import { BoardHeader, CaseHeading, LiveClock } from './chrome/BoardHeader'
import './canvass.css'

/**
 * The secondary-window host (Phase 7.3A, A1/AD13): a pop-out window is
 * a SEPARATE JS context running its own read-only data stack — own
 * QueryClient (provided by `window-main.tsx`), own store instances
 * (module singletons are per-context), own realtime subscription. It
 * reuses the poured views unchanged — pop-out is HOSTING, not forking —
 * because the claimed `getSupabase()` seam and the seeded stores make
 * this context indistinguishable to them.
 *
 * Boot order is PINNED: attach every listener FIRST, THEN emit
 * `secondary-ready` (Tauri events aren't buffered — the reply would
 * race the attach) → token installs the client (`initSecondaryClient`)
 * → `view-context` seeds THIS context's canvass-store → the board (and
 * with it the mount-scoped subscription) mounts only once the token is
 * in place (setAuth-before-subscribe).
 *
 * This context is REFRESH-PASSIVE: main owns rotation; the wake-refresh
 * health path (`useConnectionHealth`) is never mounted here —
 * `auth.refreshSession()` throws under the accessToken proxy. Health
 * feeds from the subscription's onStatus + query results only.
 */

/** Genuine-failure backstop: no token this long after the handshake ⇒
 * the terminal timeout state (a secondary never prompts for
 * credentials — auth UI exists only in main). */
export const SECONDARY_BOOT_TIMEOUT_MS = 10_000

type BootPhase = 'connecting' | 'ready' | 'timeout' | 'ended'

export function SecondaryRoot({ view }: { view: PopOutView }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [phase, setPhase] = useState<BootPhase>('connecting')
  const initializedRef = useRef(false)
  const endedRef = useRef(false)

  useEffect(() => {
    let disposed = false
    const unlisteners: UnlistenFn[] = []
    const timeoutId = setTimeout(() => {
      setPhase(current => (current === 'connecting' ? 'timeout' : current))
    }, SECONDARY_BOOT_TIMEOUT_MS)

    const handleToken = (payload: SessionTokenPayload) => {
      if (endedRef.current) {
        return
      }
      if (initializedRef.current) {
        updateSecondaryToken(payload.token)
        return
      }
      initializedRef.current = true
      initSecondaryClient(payload.url, payload.key, payload.token)
      // Seed THIS context's session-store — unless a lock broadcast
      // already landed (the handshake's two replies are unordered; the
      // token must never wipe `locked` back to `active`).
      if (useSessionStore.getState().state !== 'locked') {
        useSessionStore.getState().setState('active')
      }
      setPhase('ready')
    }

    const handleEnded = async () => {
      if (endedRef.current) {
        return
      }
      endedRef.current = true
      // Teardown BEFORE the terminal screen (7.2 error handling): remove
      // channels + disconnect + discard the token — no broadcast may be
      // delivered after the event (sign-out revokes only the refresh
      // token; the access token stays valid up to ~1 h).
      await teardownSecondaryClient()
      // Per-context session-exit purge (doc 01 §5.4 invariant): reset
      // this context's stores and purge ITS QueryClient's case-data
      // families — a cached list inside staleTime would render operator
      // A's rows (DVR credentials included) to operator B (#117).
      resetCanvassStore()
      resetHealthStore()
      useSessionStore.getState().setState('signed-out')
      queryClient.removeQueries({
        predicate: query => isCaseDataKey(query.queryKey[0]),
      })
      setPhase('ended')
    }

    const attach = async () => {
      // LISTENERS FIRST — all five before the ready emit (pinned order).
      const attached = await Promise.all([
        onSessionToken(handleToken),
        onViewContext(context => {
          if (context.view !== view) {
            return
          }
          useCanvassStore.getState().selectCase(context.caseId)
          useCanvassStore.getState().setView(context.view)
        }),
        onSessionLocked(() => {
          useSessionStore.getState().setState('locked')
        }),
        onSessionUnlocked(() => {
          useSessionStore.getState().setState('active')
        }),
        onSessionEnded(() => {
          handleEnded().catch((cause: unknown) => {
            logger.error('secondary: session-ended teardown failed', { cause })
          })
        }),
      ])
      if (disposed) {
        for (const unlisten of attached) {
          unlisten()
        }
        return
      }
      unlisteners.push(...attached)
      // THEN announce — main replies session-token + view-context.
      await emitSecondaryReady(view)
    }

    attach().catch((cause: unknown) => {
      logger.error('secondary: handshake boot failed', { cause })
    })

    return () => {
      disposed = true
      clearTimeout(timeoutId)
      for (const unlisten of unlisteners) {
        unlisten()
      }
    }
  }, [view, queryClient])

  if (phase === 'ready') {
    return <SecondaryBoard view={view} />
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 bg-hub-ground p-8 text-center font-inter">
      {phase === 'connecting' && (
        <p className="font-stmono text-[13px] uppercase tracking-[2px] text-hub-muted">
          {t('canvass.secondary.connecting')}
        </p>
      )}
      {phase === 'timeout' && (
        <>
          <p className="font-nacelle text-xl font-semibold text-hub-heading">
            {t('canvass.secondary.timeoutTitle')}
          </p>
          <p className="max-w-[48ch] text-[15px] text-hub-muted">
            {t('canvass.secondary.timeoutBody')}
          </p>
        </>
      )}
      {phase === 'ended' && (
        <>
          <p className="font-nacelle text-xl font-semibold text-hub-heading">
            {t('canvass.secondary.endedTitle')}
          </p>
          <p className="max-w-[48ch] text-[15px] text-hub-muted">
            {t('canvass.secondary.endedBody')}
          </p>
        </>
      )}
    </div>
  )
}

/** The design canvas width (AD15 — same convention as CanvassRoot). */
const DESIGN_WIDTH = 1920

/**
 * The live board of a secondary context — mounted only after the token
 * is installed, so the mount-scoped subscription (useCaseRealtime, the
 * five-arg thunk form reading THIS context's store) never subscribes
 * before `setAuth` (7.2A). Mirrors CanvassRoot's AD15 layering: the map
 * is an unscaled full-window layer; the chrome scales by boardWidth /
 * 1920.
 */
function SecondaryBoard({ view }: { view: PopOutView }) {
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const locked = useSessionStore(state => state.state === 'locked')
  const queryClient = useQueryClient()
  useCaseRealtime(selectedCaseId)
  useMediaPolling(selectedCaseId)

  // Refresh-passive health wiring (7.3A): browser online/offline, the
  // periodic reevaluate tick, and a catch-up REFETCH (auth-free) when
  // the channel resubscribes after a drop. No wake-refresh path — main
  // owns token rotation (auth.refreshSession throws under the proxy).
  useEffect(() => {
    const onOnline = () => {
      useHealthStore.getState().setOnline(true)
    }
    const onOffline = () => {
      useHealthStore.getState().setOnline(false)
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const interval = setInterval(() => {
      useHealthStore.getState().reevaluate()
    }, 10_000)
    const unsubscribe = useHealthStore.subscribe((state, previous) => {
      if (
        state.marks.channel === 'subscribed' &&
        previous.marks.channel !== 'subscribed' &&
        previous.marks.channel !== null
      ) {
        void queryClient.invalidateQueries({
          predicate: query => isCaseDataKey(query.queryKey[0]),
        })
      }
    })
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      clearInterval(interval)
      unsubscribe()
    }
  }, [queryClient])

  // Attention TTL sweep — same per-context clock CanvassRoot runs.
  useEffect(() => {
    const id = setInterval(() => {
      useCanvassStore.getState().clearExpiredAttention()
    }, 1_000)
    return () => {
      clearInterval(id)
    }
  }, [])

  // AD15 scale (CanvassRoot's measured-board pattern): chrome scales,
  // the map layer stays unscaled-native.
  const rootRef = useRef<HTMLDivElement>(null)
  const [boardSize, setBoardSize] = useState<{
    width: number
    height: number
  } | null>(null)
  useEffect(() => {
    const node = rootRef.current
    if (node === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = () => {
      setBoardSize({ width: node.clientWidth, height: node.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  const scale =
    boardSize === null || boardSize.width === 0
      ? 1
      : boardSize.width / DESIGN_WIDTH
  const scaleStyle =
    boardSize === null
      ? undefined
      : {
          width: DESIGN_WIDTH,
          height: boardSize.height / scale,
          transform: `scale(${String(scale)})`,
          transformOrigin: '0 0',
        }

  return (
    <div
      ref={rootRef}
      className="relative h-full overflow-hidden bg-hub-ground font-inter text-hub-body"
    >
      {/* AD6 parity: `inert` kills interaction across the whole board
          while the content stays byte-identical (lock alters nothing). */}
      <div inert={locked} className="h-full">
        {view === 'map' && (
          <div className="absolute inset-0">
            <MapCanvas />
          </div>
        )}
        <div
          className={cn(
            'absolute top-0 left-0 flex h-full w-full flex-col',
            view === 'map' && 'pointer-events-none'
          )}
          style={scaleStyle}
        >
          <div className={cn(view === 'map' && 'pointer-events-auto')}>
            <SecondaryHeader />
          </div>
          <main className="relative min-w-0 flex-1 overflow-hidden">
            {view === 'case' && (
              <div className="pointer-events-auto h-full">
                <CaseDashboard />
              </div>
            )}
            {view === 'map' && (
              <div className="pointer-events-auto absolute inset-y-4 end-4 w-[408px]">
                <LocationCardStack floating />
              </div>
            )}
          </main>
        </div>
      </div>
      {locked && <SecondaryLockVeil />}
    </div>
  )
}

/** Header: case identity + honest liveness — fed by THIS context's
 * health store (subscription status + fetch results only). */
function SecondaryHeader() {
  const { t } = useTranslation()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const healthState = useHealthStore(state => state.state)
  const lastConfirm = useHealthStore(state => lastConfirmAt(state.marks))
  const { data: cases } = useCases()
  const selectedCase = cases?.find(c => c.id === selectedCaseId) ?? null

  return (
    <>
      <BoardHeader>
        {selectedCase === null ? (
          <CaseHeading
            tag={t('canvass.header.appTag')}
            title={t('canvass.header.commandCentre')}
          />
        ) : (
          <CaseHeading
            tag={selectedCase.caseNumber}
            title={
              selectedCase.displayName ?? selectedCase.incidentBusinessName
            }
          />
        )}
        <ConnectionIndicator state={healthState} lastConfirm={lastConfirm} />
        <LiveClock />
      </BoardHeader>
      <ConnectionBanner state={healthState} lastConfirm={lastConfirm} />
    </>
  )
}

/**
 * The secondary's lock veil (AD6 parity, #117): the gold locked-but-live
 * frame WITHOUT a credential prompt — re-auth exists only in main. The
 * veil swallows pointer input; `inert` on the board handles the rest.
 */
function SecondaryLockVeil() {
  const { t } = useTranslation()
  return (
    <div className="absolute inset-0 z-50">
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
    </div>
  )
}

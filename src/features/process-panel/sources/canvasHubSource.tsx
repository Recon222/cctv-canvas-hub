/**
 * The canvas-hub source adapter (plan 6.3A — the pinned seam between
 * the ported renderer and this app's data planes). Produces the flat
 * `ProcessPanelRow` stream the retained surface consumes, fed by:
 *
 *  (a) a vanilla `useHealthStore.subscribe` diffing **`state.state`**
 *      across notifications — NOT the store object: `marks` is a fresh
 *      object on every broadcast envelope, and diffing the object
 *      would bury real transitions under a live→live firehose;
 *  (b) `readLogTail` polling through the diagnostics service —
 *      **poll discipline**: only while the SYSTEM lane is actually
 *      watched (expanded AND active — a kiosk session runs for days;
 *      no disk reads for an unwatched lane), one tick skipped while a
 *      read is in flight;
 *  (c) `vault_status` on each lane activation — an error renders as an
 *      explicit error row, NEVER as "no key present".
 *
 * The ACTIVITY lane is deliberately absent here: it renders the
 * `activitySlot` ReactNode that `CanvassRoot` fills with
 * `<ActivityFeed />` — composition at the mount site; this feature
 * imports NOTHING from canvass (AD11, fix-delta 2).
 */

import { useEffect, useState } from 'react'
import i18n from '@/i18n/config'
import { useHealthStore, type HealthState } from '@/store/health-store'
import { readLogTail, readVaultStatus } from '../services/diagnosticsService'
import type { VaultStatus } from '@/lib/tauri-bindings'

export interface ProcessPanelRow {
  at: number
  lane: 'activity' | 'system'
  source: string
  text: string
  tone?: 'info' | 'warn' | 'error'
}

export const LOG_TAIL_POLL_MS = 5_000
/** Ring cap on accumulated health-transition rows. */
const HEALTH_ROW_CAP = 100

function healthTone(state: HealthState): 'info' | 'warn' | 'error' {
  if (state === 'stale' || state === 'offline') {
    return 'error'
  }
  if (state === 'reconnecting') {
    return 'warn'
  }
  return 'info'
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

function vaultWord(present: boolean): string {
  return present
    ? i18n.t('processPanel.vault.present')
    : i18n.t('processPanel.vault.absent')
}

function vaultRowsFrom(status: VaultStatus, at: number): ProcessPanelRow[] {
  const rows: ProcessPanelRow[] = [
    {
      at,
      lane: 'system',
      source: 'vault',
      text: i18n.t('processPanel.vault.summary', {
        config: vaultWord(status.config_present),
        vault: vaultWord(status.vault_present),
        key: vaultWord(status.keyring_key_present),
      }),
      tone: 'info',
    },
  ]
  if (status.vault_mtime_ms !== null) {
    rows.push({
      at,
      lane: 'system',
      source: 'vault',
      text: i18n.t('processPanel.vault.sealed', {
        time: formatStamp(status.vault_mtime_ms),
      }),
      tone: 'info',
    })
  }
  return rows
}

/** Rule 6 (doc 01): explicit date + seconds, never relative-only. */
function formatStamp(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

/**
 * The adapter hook. `systemLaneActive` gates the DISK/IPC sources (the
 * poll discipline); the health subscription always runs — the panel
 * mounts with the board, and transitions must not be lost while the
 * lane is collapsed.
 */
export function useCanvasHubSource(
  systemLaneActive: boolean
): ProcessPanelRow[] {
  const [healthRows, setHealthRows] = useState<ProcessPanelRow[]>([])
  const [vaultRows, setVaultRows] = useState<ProcessPanelRow[]>([])
  const [tailRows, setTailRows] = useState<ProcessPanelRow[]>([])

  // (a) Health transitions — diff `state.state`, never the store object.
  // The CURRENT state needs no seed row: the lane's Footer renders it
  // live; only transitions accumulate here.
  useEffect(() => {
    const unsubscribe = useHealthStore.subscribe((state, previous) => {
      if (state.state !== previous.state) {
        setHealthRows(rows =>
          [
            ...rows,
            {
              at: Date.now(),
              lane: 'system' as const,
              source: 'health',
              text: i18n.t('processPanel.health.transition', {
                from: previous.state,
                to: state.state,
              }),
              tone: healthTone(state.state),
            },
          ].slice(-HEALTH_ROW_CAP)
        )
      }
    })
    return unsubscribe
  }, [])

  // (b) Log tail — 5 s poll, gated, in-flight ticks skipped.
  useEffect(() => {
    if (!systemLaneActive) {
      return
    }
    let cancelled = false
    let inFlight = false
    const tick = () => {
      if (inFlight) {
        return // skip the tick — an unguarded interval stacks reads
      }
      inFlight = true
      void readLogTail()
        .then(tail => {
          if (cancelled) {
            return
          }
          const at = Date.now()
          const lines = tail.length === 0 ? [] : tail.split('\n')
          setTailRows(
            lines.map(line => ({
              at,
              lane: 'system' as const,
              source: 'log',
              text: line,
            }))
          )
        })
        .catch((cause: unknown) => {
          if (cancelled) {
            return
          }
          // Inline error row — the panel is chrome; its failures stay
          // inside it and the board is unaffected (plan 6.3).
          setTailRows([
            {
              at: Date.now(),
              lane: 'system',
              source: 'log',
              text: i18n.t('processPanel.log.error', {
                message: errorMessage(cause),
              }),
              tone: 'error',
            },
          ])
        })
        .finally(() => {
          inFlight = false
        })
    }
    tick()
    const interval = setInterval(tick, LOG_TAIL_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [systemLaneActive])

  // (c) Vault status — refreshed on each lane activation.
  useEffect(() => {
    if (!systemLaneActive) {
      return
    }
    let cancelled = false
    void readVaultStatus()
      .then(status => {
        if (!cancelled) {
          setVaultRows(vaultRowsFrom(status, Date.now()))
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          // Explicit error row — never an all-false "no key present"
          // that would send an operator to re-enroll (6.3B).
          setVaultRows([
            {
              at: Date.now(),
              lane: 'system',
              source: 'vault',
              text: i18n.t('processPanel.vault.error', {
                message: errorMessage(cause),
              }),
              tone: 'error',
            },
          ])
        }
      })
    return () => {
      cancelled = true
    }
  }, [systemLaneActive])

  return [...tailRows, ...vaultRows, ...healthRows]
}

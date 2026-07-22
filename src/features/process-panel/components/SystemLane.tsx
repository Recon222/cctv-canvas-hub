/**
 * SYSTEM lane (plan 6.3A): the ported terminal renderer over the
 * canvas-hub row stream. Rows become ANSI-tagged text chunks (dim
 * source tag, tone-colored body) written through the vtEngine and
 * rendered by TextLane under the hardcoded CRT treatment; the retained
 * Header/Footer frame it. (The export dropdown was cut at the M6 live
 * smoke — see Header.tsx.)
 */

import { useEffect, useState } from 'react'
import type { HealthState } from '@/store/health-store'
import { createVtState, vtWrite } from '../services/vtEngine'
import type { ProcessPanelRow } from '../sources/canvasHubSource'
import { TextLane } from './TextLane'
import { Header } from './Header'
import { Footer } from './Footer'
import './crt.css'

export interface SystemLaneProps {
  rows: ProcessPanelRow[]
  healthState: HealthState
}

const ESC = '\x1B'
const TONE_SGR: Record<NonNullable<ProcessPanelRow['tone']>, string> = {
  info: '',
  warn: `${ESC}[33m`,
  error: `${ESC}[31m`,
}

/** HH:MM:SS row stamp. Local on purpose: the rule-6 formatters live in
 * canvass, and this feature imports nothing from it (AD11). */
function formatClockTime(at: number): string {
  const d = new Date(at)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

function formatUptime(ms: number): string {
  const total = Math.floor(ms / 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = total % 60
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
}

function rowToChunk(row: ProcessPanelRow): string {
  const tag = `${ESC}[2m${formatClockTime(row.at)} [${row.source}]${ESC}[0m`
  const tone = row.tone === undefined ? '' : TONE_SGR[row.tone]
  const reset = tone === '' ? '' : `${ESC}[0m`
  return `${tag} ${tone}${row.text}${reset}\n`
}

// ponytail: full VtState rebuild per rows change (≤ ~300 lines every
// 5 s poll) — switch to incremental vtWrite if a profiler ever cares.
function rowsToVtState(chunks: string[]) {
  let state = createVtState()
  for (const chunk of chunks) {
    state = vtWrite(state, chunk)
  }
  return state
}

/** The panel's boot instant — uptime shown in the lane chrome. */
const STARTED_AT = Date.now()

export function SystemLane({ rows, healthState }: SystemLaneProps) {
  // 1 s uptime tick — runs only while the lane is actually mounted
  // (PanelShell mounts the slot only when expanded + SYSTEM active).
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now())
    }, 1_000)
    return () => {
      clearInterval(interval)
    }
  }, [])

  const chunks = rows.map(rowToChunk)
  const vtState = rowsToVtState(chunks)
  const uptimeLabel = formatUptime(now - STARTED_AT)
  const tailLineCount = rows.filter(row => row.source === 'log').length

  return (
    <div data-bg="crt" className="flex h-full min-h-0 flex-col bg-[#0a0a0a]">
      <Header
        isRunning={healthState === 'live'}
        rowCount={rows.length}
        uptimeLabel={uptimeLabel}
      />
      <div
        data-testid="process-monitor-body"
        className="relative min-h-0 flex-1 overflow-auto"
      >
        <TextLane text={vtState} />
        <div className="crt-overlay" aria-hidden />
      </div>
      <Footer
        healthState={healthState}
        rowCount={rows.length}
        tailLineCount={tailLineCount}
        uptimeLabel={uptimeLabel}
      />
    </div>
  )
}

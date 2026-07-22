/**
 * ANSI → React node parser.
 *
 * Converts raw text containing ANSI SGR escape sequences (Rich, Textual,
 * plain stdout from Click / typer / etc.) into React.ReactNode arrays
 * with inline `style` props. Handles 16-color / 256-color / truecolor
 * foreground + background, plus bold (1) / dim (2) / italic (3) /
 * underline (4) / inverse (7) / strike (9) and the corresponding reset
 * variants. Cursor-positioning sequences (CSI H/A/B/C/D/J/K/etc.) and
 * OSC sequences are stripped silently — we render a flat append-only
 * stream, not a terminal grid.
 *
 * Ported from the `processTerminal` retained surface (plan 6.3A). The
 * SGR state machine + palette + regex source live in `./ansiSgr.ts` so
 * the React parser here and the HTML parser at `./parseAnsiToHtml.ts`
 * share a single source of truth. Only the per-segment output differs:
 * this parser emits `<span>` React nodes; that parser emits `<span>`
 * HTML strings.
 *
 * Lives in a service file (no React components) so any regex
 * rule-disable surface never touches a component the React Compiler
 * would skip optimizing.
 */

import type { ReactNode } from 'react'
import {
  ANSI_RE_SOURCE,
  applySgr,
  styleFromState,
  type AnsiState,
} from './ansiSgr'

interface ParsedChunk {
  nodes: ReactNode[]
  state: AnsiState
}

/** Stateful parser: pass the previous state in, get next state out. */
function parseAnsi(input: string, initial: AnsiState): ParsedChunk {
  const nodes: ReactNode[] = []
  let state = initial
  let cursor = 0
  let key = 0
  const re = new RegExp(ANSI_RE_SOURCE, 'g')
  let m: RegExpExecArray | null

  while ((m = re.exec(input)) !== null) {
    if (m.index > cursor) {
      const text = input.slice(cursor, m.index)
      const styled = styleFromState(state)
      const hasStyle = Object.values(styled).some(v => v !== undefined)
      nodes.push(
        hasStyle ? (
          <span key={key++} style={styled}>
            {text}
          </span>
        ) : (
          text
        )
      )
    }
    // SGR sequences only; cursor / OSC are stripped silently.
    const isSgr = m[0].endsWith('m')
    if (isSgr) {
      const params = (m[1] ?? '').split(';').filter(Boolean).map(Number)
      state = applySgr(state, params.length === 0 ? [0] : params)
    }
    cursor = m.index + m[0].length
  }
  if (cursor < input.length) {
    const text = input.slice(cursor)
    const styled = styleFromState(state)
    const hasStyle = Object.values(styled).some(v => v !== undefined)
    nodes.push(
      hasStyle ? (
        <span key={key++} style={styled}>
          {text}
        </span>
      ) : (
        text
      )
    )
  }
  return { nodes, state }
}

/** Group raw chunks into render-friendly lines. ANSI carries between lines. */
export function chunksToLines(chunks: string[]): ReactNode[][] {
  const joined = chunks.join('')
  const rawLines = joined.split('\n')
  const lines: ReactNode[][] = []
  let state: AnsiState = {}
  for (const raw of rawLines) {
    const { nodes, state: next } = parseAnsi(raw, state)
    state = next
    lines.push(nodes)
  }
  return lines
}

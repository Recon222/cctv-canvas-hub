/**
 * ANSI SGR — shared state machine for the React + HTML parsers.
 *
 * Ported from the `processTerminal` retained surface (plan 6.3A —
 * gate-passed adaptation, not a copy). Shared by the React-node parser
 * (`ansiParser.tsx` → `parseAnsi`) and the HTML-string parser
 * (`parseAnsiToHtml.ts` → `parseAnsiToHtml`) so the SGR state machine
 * exists once. Drift is structurally prevented: any new SGR code lands
 * here, both parsers benefit.
 *
 * Module surface:
 *   - `AnsiState` — the SGR state shape (fg, bg, bold, dim, italic,
 *     underline, inverse, strike)
 *   - `BASE_16` — VS Code-style 16-color palette
 *   - `ansi256ToHex(n)` — 256-color palette resolution (8-bit cube +
 *     grayscale ramp)
 *   - `applySgr(state, params)` — the actual state machine; takes a
 *     prior state + SGR parameter list, returns the next state
 *   - `ANSI_RE_SOURCE` — regex source string for SGR + cursor + OSC
 *     sequences. Consumers create their own `new RegExp(source, 'g')`
 *     because the `g` flag is stateful — sharing a single instance
 *     would leak `lastIndex` across parser calls.
 *   - `StyleAttrs` — neutral style shape (camelCase keys, structurally
 *     compatible with React's CSSProperties)
 *   - `styleFromState(s)` — returns a `StyleAttrs` object for the
 *     React parser to spread onto `style={...}`
 *   - `cssStringFromState(s)` — returns an inline-CSS string
 *     (`'color: #...; font-weight: 600; ...'`) for the HTML parser
 *     to embed in `<span style="...">`
 *
 * Both `styleFromState` and `cssStringFromState` walk the same
 * `AnsiState` and share the inverse-swap + decoration-join logic.
 * Drift between the two output helpers is structurally tested by
 * the parity test at `parseAnsiToHtml.test.ts`.
 */

export interface AnsiState {
  fg?: string
  bg?: string
  bold?: boolean
  dim?: boolean
  italic?: boolean
  underline?: boolean
  inverse?: boolean
  strike?: boolean
}

export const BASE_16: string[] = [
  '#000000',
  '#cd3131',
  '#0dbc79',
  '#e5e510',
  '#2472c8',
  '#bc3fbc',
  '#11a8cd',
  '#e5e5e5',
  '#666666',
  '#f14c4c',
  '#23d18b',
  '#f5f543',
  '#3b8eea',
  '#d670d6',
  '#29b8db',
  '#ffffff',
]

export function ansi256ToHex(n: number): string {
  if (n < 16) return BASE_16[n] ?? '#ffffff'
  if (n < 232) {
    const i = n - 16
    const r = Math.floor(i / 36)
    const g = Math.floor((i % 36) / 6)
    const b = i % 6
    const conv = (v: number) => (v === 0 ? 0 : 55 + v * 40)
    return `rgb(${conv(r)},${conv(g)},${conv(b)})`
  }
  const v = (n - 232) * 10 + 8
  return `rgb(${v},${v},${v})`
}

export function applySgr(state: AnsiState, params: number[]): AnsiState {
  const next = { ...state }
  let i = 0
  while (i < params.length) {
    const p = params[i]
    if (p === 0 || p === undefined) {
      next.fg = undefined
      next.bg = undefined
      next.bold = false
      next.dim = false
      next.italic = false
      next.underline = false
      next.inverse = false
      next.strike = false
    } else if (p === 1) next.bold = true
    else if (p === 2) next.dim = true
    else if (p === 3) next.italic = true
    else if (p === 4) next.underline = true
    else if (p === 7) next.inverse = true
    else if (p === 9) next.strike = true
    else if (p === 22) {
      next.bold = false
      next.dim = false
    } else if (p === 23) next.italic = false
    else if (p === 24) next.underline = false
    else if (p === 27) next.inverse = false
    else if (p === 29) next.strike = false
    else if (p >= 30 && p <= 37) next.fg = BASE_16[p - 30]
    else if (p >= 40 && p <= 47) next.bg = BASE_16[p - 40]
    else if (p >= 90 && p <= 97) next.fg = BASE_16[p - 90 + 8]
    else if (p >= 100 && p <= 107) next.bg = BASE_16[p - 100 + 8]
    else if (p === 39) next.fg = undefined
    else if (p === 49) next.bg = undefined
    else if (p === 38 || p === 48) {
      const target: 'fg' | 'bg' = p === 38 ? 'fg' : 'bg'
      const mode = params[i + 1]
      if (mode === 5) {
        const c = params[i + 2]
        if (c != null) next[target] = ansi256ToHex(c)
        i += 2
      } else if (mode === 2) {
        const r = params[i + 2]
        const g = params[i + 3]
        const b = params[i + 4]
        if (r != null && g != null && b != null) {
          next[target] = `rgb(${r},${g},${b})`
        }
        i += 4
      }
    }
    i += 1
  }
  return next
}

/**
 * Regex source for ANSI SGR + cursor + OSC sequences. Exported as a
 * source string (not a compiled RegExp) so each consumer creates its
 * own `new RegExp(ANSI_RE_SOURCE, 'g')` — the `g` flag is stateful
 * and sharing a single RegExp instance would leak `lastIndex` across
 * parser invocations.
 *
 * Alternatives, in order: SGR (`CSI … m`, params captured), OSC
 * (BEL- or ST-terminated), generic CSI (finals A–H J K S T f s u,
 * plus h/l so private-mode set/reset — alt-screen `?1049h/l`, cursor
 * visibility `?25h/l`, bracketed paste `?2004h/l` — strips instead of
 * leaking `[?25l` as literal text), and DEC cursor save/restore
 * (`ESC 7` / `ESC 8`). The VT-lite engine (M3) interprets a subset of
 * the CSI matches; every other consumer strips all of them.
 *
 * The escape sequences are encoded via `\x1B`-style escapes inside a
 * string literal; this avoids the `no-control-regex` eslint warning
 * that fires when control characters appear directly in a regex
 * literal. The compiled `RegExp` constructed downstream still matches
 * the same control bytes.
 */
export const ANSI_RE_SOURCE =
  '\\x1B\\[([\\d;]*)m|\\x1B\\][^\\x07\\x1B]*(?:\\x07|\\x1B\\\\)|\\x1B\\[[\\d;?]*[A-HJKSTfsuhl]|\\x1B[78]'

/**
 * Style attributes derived from an `AnsiState`. Camel-cased keys make
 * the shape structurally compatible with React's `CSSProperties` so
 * the React parser can pass it directly to `style={...}` without a
 * conversion step.
 */
export interface StyleAttrs {
  color?: string
  backgroundColor?: string
  fontWeight?: number
  opacity?: number
  fontStyle?: string
  textDecoration?: string
}

/** Common decorator path — derives the final attribute set from state. */
function computeAttrs(s: AnsiState): StyleAttrs {
  const fg = s.inverse ? s.bg : s.fg
  const bg = s.inverse ? s.fg : s.bg
  const decoration =
    [s.underline ? 'underline' : '', s.strike ? 'line-through' : '']
      .filter(Boolean)
      .join(' ') || undefined
  return {
    color: fg,
    backgroundColor: bg,
    fontWeight: s.bold ? 600 : undefined,
    opacity: s.dim ? 0.65 : undefined,
    fontStyle: s.italic ? 'italic' : undefined,
    textDecoration: decoration,
  }
}

/**
 * React-facing — returns camel-cased `StyleAttrs` (compatible with
 * `CSSProperties` via TypeScript structural typing).
 */
export function styleFromState(s: AnsiState): StyleAttrs {
  return computeAttrs(s)
}

/**
 * Serialize a computed `StyleAttrs` to an inline-CSS string. The
 * shared second half of `cssStringFromState`, exported (M5 Phase 15B)
 * so the HTML export can serialize vtEngine segment styles — which
 * are ALREADY `StyleAttrs` (produced via `styleFromState`) — with
 * structural React↔HTML parity: both surfaces flow through
 * `computeAttrs` and this one serializer.
 */
export function cssStringFromAttrs(a: StyleAttrs): string {
  const parts: string[] = []
  if (a.color !== undefined) parts.push(`color: ${a.color}`)
  if (a.backgroundColor !== undefined)
    parts.push(`background-color: ${a.backgroundColor}`)
  if (a.fontWeight !== undefined) parts.push(`font-weight: ${a.fontWeight}`)
  if (a.opacity !== undefined) parts.push(`opacity: ${a.opacity}`)
  if (a.fontStyle !== undefined) parts.push(`font-style: ${a.fontStyle}`)
  if (a.textDecoration !== undefined)
    parts.push(`text-decoration: ${a.textDecoration}`)
  return parts.join('; ')
}

/**
 * HTML-facing — returns an inline-CSS string ready to embed in
 * `<span style="...">`. Same logic as `styleFromState`, just kebab-
 * cased + serialized. Returns an empty string when no attributes
 * are active so the consumer can branch on `.length === 0`.
 */
export function cssStringFromState(s: AnsiState): string {
  return cssStringFromAttrs(computeAttrs(s))
}

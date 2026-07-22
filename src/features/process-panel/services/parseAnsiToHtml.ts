/**
 * ANSI → HTML string parser.
 *
 * Ported from the `processTerminal` retained surface (plan 6.3A).
 * Sibling of `ansiParser.tsx` — emits HTML strings instead of React
 * nodes. Shares the SGR state machine + palette + regex via
 * `./ansiSgr.ts`. Only the per-segment output differs: each text
 * segment becomes a literal `<span style="...">` string with
 * kebab-cased CSS, ready to embed in the exported HTML document.
 *
 * Why a separate parser instead of `ReactDOMServer.renderToStaticMarkup`:
 *   - No `react-dom/server` bundle hit (~60KB)
 *   - Direct string output fits the SYSTEM-lane HTML export
 *   - Byte-level control over escape behavior (untrusted log output
 *     gets defense-in-depth HTML escaping)
 *
 * Drift risk between this parser and `ansiParser.tsx` is mitigated by
 * the shared `applySgr` + `styleFromState`/`cssStringFromState` helpers
 * in `ansiSgr.ts`.
 */

import {
  ANSI_RE_SOURCE,
  applySgr,
  cssStringFromState,
  type AnsiState,
} from './ansiSgr'

interface ParsedChunkHtml {
  html: string
  state: AnsiState
}

/**
 * HTML-escape a text segment. Defends against untrusted tool stdout
 * being interpreted as markup. Escapes the OWASP-recommended set —
 * `&`, `<`, `>`, `"`, `'` — per HTML-export ADR-6.
 *
 * The single-quote escape (`'` → `&#39;`) is the addition over the
 * existing `escapeHtml` in `exportService.ts`. Single quotes can
 * close attribute values when single-quoted attributes appear in
 * generated HTML; escaping them is defense-in-depth even though our
 * generator uses double-quoted attributes.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Stateful parser: pass the previous state in, get next state out. */
function parseAnsiToHtml(input: string, initial: AnsiState): ParsedChunkHtml {
  let html = ''
  let state = initial
  let cursor = 0
  const re = new RegExp(ANSI_RE_SOURCE, 'g')
  let m: RegExpExecArray | null

  const emit = (text: string): void => {
    if (text.length === 0) return
    const css = cssStringFromState(state)
    if (css.length > 0) {
      html += `<span style="${css}">${escapeHtml(text)}</span>`
    } else {
      html += escapeHtml(text)
    }
  }

  while ((m = re.exec(input)) !== null) {
    if (m.index > cursor) {
      emit(input.slice(cursor, m.index))
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
    emit(input.slice(cursor))
  }
  return { html, state }
}

/**
 * Group raw chunks into rendered lines as HTML strings. ANSI state
 * carries between lines (matching `chunksToLines` semantics in
 * `ansiParser.tsx`). Each line is wrapped in `<div>...</div>` so
 * line boundaries survive in the rendered output.
 *
 * Empty lines render as `<div>&nbsp;</div>` so the line still has
 * height in the browser (a literal empty `<div>` collapses to zero
 * height in flow layout).
 */
export function chunksToLinesHtml(chunks: string[]): string {
  const joined = chunks.join('')
  const rawLines = joined.split('\n')
  const out: string[] = []
  let state: AnsiState = {}
  for (const raw of rawLines) {
    const { html, state: next } = parseAnsiToHtml(raw, state)
    state = next
    out.push(html.length > 0 ? `<div>${html}</div>` : '<div>&nbsp;</div>')
  }
  return out.join('')
}

/** Exported for testing only. */
export { parseAnsiToHtml, escapeHtml }

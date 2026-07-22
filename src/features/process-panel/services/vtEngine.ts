/**
 * vtEngine — the SYSTEM lane's text engine (ported `processTerminal`
 * retained surface, plan 6.3A).
 *
 * VT-lite line-model semantics: printable text
 * splices into the current line at `cursorCol`, `\n` line-feeds
 * (moving over EXISTING lines when the cursor is mid-buffer), `\r`
 * returns to column 0 so the next write rewrites the line in place —
 * the mechanic that animates Rich/indicatif progress bars in DOM.
 * EL 0/1/2 erase within the line, CUU/CUD move the cursor bounded to
 * the state's own lines, CHA positions the column. Everything else on
 * the wire — alt-screen, 2J, cursor save/restore, OSC — is stripped
 * without corrupting the surrounding text (full-screen TUIs stay out
 * of scope, ADR-4). SGR styling rides the shared `ansiSgr` machine.
 *
 * STRUCTURAL SHARING CONTRACT (plan §6, review HIGH-3 of the plan
 * round): `vtWrite` returns a NEW `VtState` with a fresh `lines`
 * array and NEW `VtLine` objects for lines touched by this chunk
 * (version bumped); untouched lines keep reference identity so
 * memoized row components skip. The input state is never mutated.
 */

import {
  ANSI_RE_SOURCE,
  applySgr,
  styleFromState,
  type AnsiState,
  type StyleAttrs,
} from './ansiSgr'

export interface VtSeg {
  text: string
  /** null = unstyled (avoids empty-object churn on the hot path). */
  style: StyleAttrs | null
}

export interface VtLine {
  /** Bumped every time this line's content changes — render keys. */
  version: number
  segs: VtSeg[]
}

export interface VtState {
  lines: VtLine[]
  /** Cursor line — moved by \n and (bounded) CUU/CUD. */
  cursorRow: number
  /** Cursor column — moved by writes, \r, CHA; splice target. */
  cursorCol: number
  /** SGR state carried across chunks and lines. */
  sgr: AnsiState
  /**
   * Incomplete trailing escape sequence held back from the previous
   * chunk (review F-6 golden-parity finding): pipe reads CAN split an
   * ESC/CSI/OSC mid-sequence; parsing per-chunk rendered the fragments
   * as literal text. V1 was immune only because it re-joined the whole
   * stream every render. Prepended to the next write. BOUNDED by
   * MAX_PENDING and flushed at stream end via `vtFlushPending`
   * (review round-2 N-1) — never an unbounded silent hold.
   */
  pending: string
}

/** Hoisted per js-hoist-regexp; `lastIndex` reset at each vtWrite call
 *  (the `g` flag is stateful — sharing without reset would leak). */
const ANSI_RE = new RegExp(ANSI_RE_SOURCE, 'g')

/** Trailing-fragment matchers for the split-escape holdback, built
 *  from string sources like `ANSI_RE_SOURCE` so the control bytes
 *  don't trip `no-control-regex` (the rule tracks literals passed
 *  straight to `new RegExp`, not identifier references). No `g`
 *  flag — stateless. */
const TRAILING_OSC_SOURCE = '\\x1B\\][^\\x07\\x1B]*$'
const TRAILING_CSI_SOURCE = '\\x1B(\\[[0-9;?]*)?$'
const TRAILING_OSC_RE = new RegExp(TRAILING_OSC_SOURCE)
const TRAILING_CSI_RE = new RegExp(TRAILING_CSI_SOURCE)

export function createVtState(): VtState {
  return {
    lines: [{ version: 0, segs: [] }],
    cursorRow: 0,
    cursorCol: 0,
    sgr: {},
    pending: '',
  }
}

/**
 * Length of an incomplete escape sequence at the END of `text`
 * (0 = none). Covers a bare ESC, an unfinished CSI (`ESC [ params…`
 * with no final byte yet), and an unterminated OSC.
 */
function trailingPartialEscape(text: string): number {
  // Unterminated OSC: ESC ] … (no BEL / ST yet) — must check before
  // the generic ESC cases since OSC bodies can be long.
  const osc = TRAILING_OSC_RE.exec(text)
  if (osc) return text.length - osc.index
  // Bare ESC or unfinished CSI at the very end.
  const csi = TRAILING_CSI_RE.exec(text)
  if (csi) return text.length - csi.index
  return 0
}

function lineLength(line: VtLine): number {
  let n = 0
  for (const seg of line.segs) n += seg.text.length
  return n
}

/**
 * The splice workhorse: segments covering the visible column range
 * [start, end) of a line. Styles are preserved; boundary segments are
 * cut at the column edges.
 */
function sliceSegs(segs: VtSeg[], start: number, end: number): VtSeg[] {
  const out: VtSeg[] = []
  let pos = 0
  for (const seg of segs) {
    const segStart = pos
    const segEnd = pos + seg.text.length
    pos = segEnd
    if (segEnd <= start) continue
    if (segStart >= end) break
    const text = seg.text.slice(
      Math.max(start, segStart) - segStart,
      Math.min(end, segEnd) - segStart
    )
    if (text.length > 0) out.push({ text, style: seg.style })
  }
  return out
}

/** Bound on the split-escape holdback (review round-2 N-1). Real
 *  escape sequences are tiny (SGR ≤ ~20 chars; OSC titles ≤ ~100);
 *  a "sequence" larger than this is a never-terminated opener that
 *  would otherwise swallow all subsequent output forever. */
const MAX_PENDING = 256

/**
 * Write a raw chunk into the state. Returns a new state per the
 * structural-sharing contract. Internals mutate a DRAFT only.
 */
export function vtWrite(state: VtState, chunk: string): VtState {
  return write(state, chunk, true)
}

/**
 * Surface a held escape fragment as literal text (review round-2
 * N-1): called when a lane's stream ends (block close / session
 * result sweep) so a process killed mid-escape — or a sequence that
 * never terminates — can't silently lose its trailing bytes. The ESC
 * byte itself is invisible in DOM text; the rest renders literally,
 * matching V1's behavior for unterminated sequences. Same-reference
 * no-op when nothing is pending.
 */
export function vtFlushPending(state: VtState): VtState {
  if (state.pending.length === 0) return state
  return write(state, '', false)
}

function write(state: VtState, chunk: string, holdback: boolean): VtState {
  if (chunk.length === 0 && state.pending.length === 0) return state

  // Reassemble any escape fragment held back from the previous chunk,
  // then hold back a new incomplete tail (F-6: split-escape safety).
  // BOUNDED (review round-2 N-1): past MAX_PENDING this is not a real
  // split escape — force-render it as literal instead of holding.
  let input = state.pending + chunk
  let partial = holdback ? trailingPartialEscape(input) : 0
  if (partial > MAX_PENDING) partial = 0
  const pending = partial > 0 ? input.slice(input.length - partial) : ''
  if (partial > 0) input = input.slice(0, input.length - partial)
  if (input.length === 0) {
    // Nothing complete to render yet — carry the fragment forward.
    return { ...state, pending }
  }

  // Draft containers: fresh lines array; touched lines are re-created
  // lazily (version bumped once per write call) so untouched lines
  // keep reference identity — the memo-skip guarantee.
  const lines = state.lines.slice()
  let row = state.cursorRow
  let col = state.cursorCol
  let sgr = state.sgr
  /** Rows already re-created (fresh objects) in THIS write. */
  const freshRows = new Set<number>()

  const touchLine = (): VtLine => {
    // `row` always indexes a real line by construction (states are
    // created with one line; lineFeed pushes before moving; CUU/CUD
    // clamp) — the fallback satisfies noUncheckedIndexedAccess
    // without asserting.
    const prev = lines[row] ?? { version: -1, segs: [] }
    if (freshRows.has(row)) return prev
    const clone: VtLine = { version: prev.version + 1, segs: prev.segs.slice() }
    lines[row] = clone
    freshRows.add(row)
    return clone
  }

  const writeText = (text: string) => {
    if (text.length === 0) return
    const style = styleFromState(sgr)
    const hasStyle = Object.values(style).some(v => v !== undefined)
    const seg: VtSeg = { text, style: hasStyle ? style : null }
    const line = touchLine()
    const len = lineLength(line)
    if (col >= len) {
      // Hot path: append at (or padded past) the end of the line.
      if (col > len)
        line.segs.push({ text: ' '.repeat(col - len), style: null })
      line.segs.push(seg)
    } else {
      // Splice: overwrite [col, col + text.length), keep the suffix —
      // the \r-rewrite mechanic that animates bars in place.
      line.segs = [
        ...sliceSegs(line.segs, 0, col),
        seg,
        ...sliceSegs(line.segs, col + text.length, Infinity),
      ]
    }
    col += text.length
  }

  const lineFeed = () => {
    if (row === lines.length - 1) {
      lines.push({ version: 0, segs: [] })
      freshRows.add(lines.length - 1)
    }
    row += 1
    col = 0
  }

  const eraseLine = (mode: number) => {
    const current = lines[row]
    const len = current ? lineLength(current) : 0
    if (mode === 2) {
      if (len === 0) return
      touchLine().segs = []
    } else if (mode === 1) {
      // Blank start → cursor inclusive; erased cells become spaces.
      if (len === 0) return
      const blankTo = Math.min(col + 1, len)
      const line = touchLine()
      line.segs = [
        { text: ' '.repeat(blankTo), style: null },
        ...sliceSegs(line.segs, blankTo, Infinity),
      ]
    } else {
      // EL0: cursor → end.
      if (col >= len) return
      const line = touchLine()
      line.segs = sliceSegs(line.segs, 0, col)
    }
  }

  const writeRun = (run: string) => {
    let start = 0
    for (let i = 0; i < run.length; i++) {
      const ch = run[i]
      if (ch === '\n') {
        writeText(run.slice(start, i))
        lineFeed()
        start = i + 1
      } else if (ch === '\r') {
        writeText(run.slice(start, i))
        col = 0 // carriage return — the next text splices over this line
        start = i + 1
      }
    }
    writeText(run.slice(start))
  }

  ANSI_RE.lastIndex = 0
  let cursor = 0
  let m: RegExpExecArray | null
  while ((m = ANSI_RE.exec(input)) !== null) {
    if (m.index > cursor) writeRun(input.slice(cursor, m.index))
    const seq = m[0]
    if (m[1] !== undefined) {
      // SGR — the capture group participates only on that alternative.
      const params = m[1].split(';').filter(Boolean).map(Number)
      sgr = applySgr(sgr, params.length === 0 ? [0] : params)
    } else if (seq.startsWith('\x1B[') && !seq.includes('?')) {
      // CSI. Interpreted (§7): EL (K), CUU (A), CUD (B), CHA (G).
      // Private modes (?…h/l — alt-screen, cursor visibility) and all
      // other finals (2J, s/u save-restore, C/D/E/F/H/S/T/f) strip.
      const finalByte = seq[seq.length - 1]
      const parsed = Number.parseInt(seq.slice(2, -1), 10)
      const n = Number.isNaN(parsed) ? undefined : parsed
      if (finalByte === 'K') {
        eraseLine(n ?? 0)
      } else if (finalByte === 'A') {
        row = Math.max(0, row - Math.max(1, n ?? 1))
      } else if (finalByte === 'B') {
        row = Math.min(lines.length - 1, row + Math.max(1, n ?? 1))
      } else if (finalByte === 'G') {
        col = Math.max(0, (n ?? 1) - 1)
      }
    }
    // OSC and DEC save/restore (ESC 7 / ESC 8): stripped.
    cursor = m.index + seq.length
  }
  if (cursor < input.length) writeRun(input.slice(cursor))

  return { lines, cursorRow: row, cursorCol: col, sgr, pending }
}

/**
 * Enforce the per-block retention cap: keep the newest `maxLines`
 * lines, report how many were dropped. Same-reference when under cap.
 */
export function vtCapLines(
  state: VtState,
  maxLines: number
): { state: VtState; dropped: number } {
  if (state.lines.length <= maxLines) return { state, dropped: 0 }
  const dropped = state.lines.length - maxLines
  return {
    state: {
      ...state,
      lines: state.lines.slice(dropped),
      // Clamp — CUU may have parked the cursor on a dropped line.
      cursorRow: Math.max(0, state.cursorRow - dropped),
    },
    dropped,
  }
}

/** Visible plain text (exports, tests, model-free assertions). */
export function vtPlainText(state: VtState): string {
  return state.lines
    .map(line => line.segs.map(seg => seg.text).join(''))
    .join('\n')
}

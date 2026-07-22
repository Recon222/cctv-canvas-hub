/**
 * Shared ANSI byte fixtures for the ported VT-lite suite (plan 6.3A).
 *
 * Ported from the `processTerminal` test utils — the retained-surface
 * half only: the `PipelineMessage` factories fell with the discarded
 * dispatcher/feed model. Canned streams kept here so the vtEngine and
 * TextLane tests exercise the SAME bytes.
 */

const ESC = '\x1B'

const richBarFrame = (done: number, pct: string) =>
  `\r${ESC}[35m${'━'.repeat(done)}${' '.repeat(6 - done)}${ESC}[0m ${pct}`

/**
 * A Rich-style single progress bar: cursor hidden, three `\r`-rewrite
 * frames with SGR color (constant visible width, like a real bar),
 * cursor restored + final newline. Expected final visible text:
 * `RICH_BAR_FINAL` on ONE line (plus the empty line the trailing \n
 * opens).
 */
export const RICH_BAR_FRAMES: string[] = [
  `${ESC}[?25l${richBarFrame(1, ' 10%')}`,
  richBarFrame(3, ' 50%'),
  richBarFrame(6, '100%'),
  `${ESC}[?25h\n`,
]
export const RICH_BAR_FINAL = '━━━━━━ 100%'

/**
 * An indicatif-style two-bar redraw: print both bars, then twice
 * `CUU 2` + per-line `EL 2` + `\r` rewrite. Both bars must update
 * IN PLACE — three lines total (two bars + trailing empty), never six.
 */
export const MULTI_BAR_CUU: string[] = [
  'bar1 [##----]  33%\nbar2 [#-----]  16%\n',
  `${ESC}[2A${ESC}[2K\rbar1 [####--]  66%\n${ESC}[2K\rbar2 [###---]  50%\n`,
  `${ESC}[2A${ESC}[2K\rbar1 [######] 100%\n${ESC}[2K\rbar2 [######] 100%\n`,
]

/**
 * EL 0/1/2 over a styled six-char line, cursor positioned via CHA.
 * `expected` is the visible plain text after the erase.
 */
export const EL_VARIANTS = {
  /** cursor col 3 (ESC[4G), EL0 erases col→end: prefix survives. */
  el0: {
    input: `${ESC}[31mabcdef${ESC}[0m${ESC}[4G${ESC}[0K`,
    expected: 'abc',
  },
  /** cursor col 2 (ESC[3G), EL1 blanks start→col inclusive. */
  el1: {
    input: `${ESC}[31mabcdef${ESC}[0m${ESC}[3G${ESC}[1K`,
    expected: '   def',
  },
  /** EL2 blanks the whole line. */
  el2: { input: `abcdef${ESC}[2K`, expected: '' },
} as const

/**
 * Escape sequences split at every awkward chunk boundary: a bare ESC
 * tail, a CSI split mid-params (twice — once inside a CUU, once inside
 * an SGR), an EL split from its `\r`. Expected: 'TOPred' (red 'red')
 * over the first line; 'bar 10%' untouched on the second.
 */
export const PATHOLOGICAL_SPLIT: string[] = [
  `a\nbar 10%${ESC}`,
  `[1A${ESC}[`,
  `2K\rTOP${ESC}[3`,
  '1mred',
]

/** Color opened in chunk 1, closed in chunk 2 — SGR state carry-over. */
export const SGR_CARRYOVER_SPLIT: string[] = [
  `${ESC}[32mgreen start`,
  ` and finish${ESC}[0m plain\n`,
]

/**
 * Strict-index-safe element access for specs (noUncheckedIndexedAccess
 * without banned non-null assertions): throws with a useful message
 * instead of returning undefined.
 */
export function at<T>(arr: readonly T[], index: number): T {
  const v = arr[index]
  if (v === undefined) {
    throw new Error(`expected element at index ${index} (length ${arr.length})`)
  }
  return v
}

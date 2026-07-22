/**
 * vtEngine — the full VT-lite suite (ported `processTerminal`
 * retained-surface test file, plan 6.3A — excluded from the numbered
 * count).
 *
 * M2 shipped the final interface with V1-equivalent internals; M3
 * swapped the internals to real line-model VT semantics (Architecture
 * §7): column-tracked splice writes, `\r` in-place rewrite, EL 0/1/2,
 * CUU/CUD bounded to the state's own lines, CHA, chunk-boundary
 * safety, and the strip-list. The SGR golden-parity table protects
 * the 95% plain-stream case across the swap.
 */

import { describe, it, expect } from 'vitest'
import {
  createVtState,
  vtWrite,
  vtCapLines,
  vtFlushPending,
  vtPlainText,
} from '../services/vtEngine'
import {
  at,
  RICH_BAR_FRAMES,
  RICH_BAR_FINAL,
  MULTI_BAR_CUU,
  EL_VARIANTS,
  PATHOLOGICAL_SPLIT,
  SGR_CARRYOVER_SPLIT,
} from './test-utils'
import { chunksToLines } from '../services/ansiParser'

/** Visible text of one line. */
function lineText(s: ReturnType<typeof createVtState>, i: number): string {
  return at(s.lines, i)
    .segs.map(seg => seg.text)
    .join('')
}

function writeAll(chunks: readonly string[]) {
  let s = createVtState()
  for (const c of chunks) s = vtWrite(s, c)
  return s
}

const ESC = '\x1B'
const LF = '\n'
const BEL = '\x07'

describe('SGR parity (V1-equivalent)', () => {
  it('plain text splits into lines on \\n; trailing partial stays on the open line', () => {
    let s = createVtState()
    s = vtWrite(s, 'one\ntwo\npart')
    expect(s.lines.map(l => l.segs.map(x => x.text).join(''))).toEqual([
      'one',
      'two',
      'part',
    ])
    s = vtWrite(s, 'ial\n')
    expect(vtPlainText(s)).toContain('partial')
  })

  it('16-color SGR styles the following text and reset clears it', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[31mred${ESC}[0m plain\n`)
    const line = at(s.lines, 0)
    const redSeg = line.segs.find(seg => seg.text === 'red')
    expect(redSeg?.style?.color).toBe('#cd3131')
    const plainSeg = line.segs.find(seg => seg.text.includes('plain'))
    expect(plainSeg?.style ?? null).toBeNull()
  })

  it('SGR state carries across chunks AND lines', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[32mgreen-start`)
    s = vtWrite(s, ' still-green\nnext-line-green')
    const seg0 = at(at(s.lines, 0).segs, 0)
    const seg1 = at(at(s.lines, 1).segs, 0)
    expect(seg0.style?.color).toBe('#0dbc79')
    expect(seg1.style?.color).toBe('#0dbc79')
  })

  it('truecolor + bold render as style attrs', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[1m${ESC}[38;2;255;100;0mhot${ESC}[0m\n`)
    const seg = at(s.lines, 0).segs.find(x => x.text === 'hot')
    expect(seg?.style?.color).toBe('rgb(255,100,0)')
    expect(seg?.style?.fontWeight).toBe(600)
  })
})

describe('carriage return', () => {
  it('\\r + rewrite replaces the line prefix and keeps the unwritten suffix', () => {
    let s = createVtState()
    s = vtWrite(s, 'hello world')
    s = vtWrite(s, '\rHELLO')
    expect(vtPlainText(s)).toBe('HELLO world')
  })

  it('RICH_BAR_FRAMES ends with only the final frame visible, one line', () => {
    const s = writeAll(RICH_BAR_FRAMES)
    // One content line + the empty line the trailing \n opened.
    expect(s.lines).toHaveLength(2)
    expect(vtPlainText(s)).toBe(`${RICH_BAR_FINAL}\n`)
    // The bar glyphs kept their SGR color through the rewrites.
    const barSeg = at(s.lines, 0).segs.find(seg => seg.text.includes('━'))
    expect(barSeg?.style?.color).toBe('#bc3fbc')
  })

  it('line version increments on rewrite; untouched lines keep version AND identity', () => {
    let s = createVtState()
    s = vtWrite(s, 'stable\nbar 10%')
    const before = s
    const after = vtWrite(before, '\rbar 90%')
    expect(after.lines[0]).toBe(before.lines[0])
    expect(at(after.lines, 0).version).toBe(at(before.lines, 0).version)
    expect(after.lines[1]).not.toBe(before.lines[1])
    expect(at(after.lines, 1).version).toBeGreaterThan(
      at(before.lines, 1).version
    )
    expect(lineText(after, 1)).toBe('bar 90%')
  })
})

describe('erase line', () => {
  it('EL0 erases from the cursor to end of line (segs + plain text)', () => {
    const s = vtWrite(createVtState(), EL_VARIANTS.el0.input)
    expect(vtPlainText(s)).toBe(EL_VARIANTS.el0.expected)
    // The surviving prefix keeps its style, cut at the column edge.
    expect(at(s.lines, 0).segs).toEqual([
      { text: 'abc', style: { color: '#cd3131' } },
    ])
  })

  it('EL1 blanks from start through the cursor, keeping the styled suffix', () => {
    const s = vtWrite(createVtState(), EL_VARIANTS.el1.input)
    expect(vtPlainText(s)).toBe(EL_VARIANTS.el1.expected)
    const segs = at(s.lines, 0).segs
    expect(at(segs, 0)).toEqual({ text: '   ', style: null })
    expect(at(segs, 1).text).toBe('def')
    expect(at(segs, 1).style?.color).toBe('#cd3131')
  })

  it('EL2 blanks the whole line but keeps the cursor column for the next write', () => {
    let s = vtWrite(createVtState(), EL_VARIANTS.el2.input)
    expect(vtPlainText(s)).toBe(EL_VARIANTS.el2.expected)
    expect(at(s.lines, 0).segs).toEqual([])
    // Cursor stayed at col 6 — a following write pads to position.
    s = vtWrite(s, 'z')
    expect(vtPlainText(s)).toBe('      z')
  })

  it('a no-op erase (EL0 at end of line) does not bump the line version', () => {
    let s = vtWrite(createVtState(), 'abc')
    const before = s
    s = vtWrite(before, `${ESC}[K`)
    expect(s.lines[0]).toBe(before.lines[0])
  })
})

describe('cursor moves', () => {
  it('CUU redraws an earlier line (MULTI_BAR_CUU: both bars update in place)', () => {
    const s = writeAll(MULTI_BAR_CUU)
    expect(s.lines).toHaveLength(3) // two bars + trailing empty — never six
    expect(lineText(s, 0)).toBe('bar1 [######] 100%')
    expect(lineText(s, 1)).toBe('bar2 [######] 100%')
    expect(lineText(s, 2)).toBe('')
  })

  it("CUU clamps at the state's first line; CUD at the last", () => {
    let s = createVtState()
    s = vtWrite(s, 'top\nbottom')
    s = vtWrite(s, `${ESC}[99A\rTOP`) // 99 up clamps to row 0
    expect(lineText(s, 0)).toBe('TOP')
    s = vtWrite(s, `${ESC}[99B\r!`) // 99 down clamps to row 1 (the last)
    expect(vtPlainText(s)).toBe('TOP\n!ottom')
  })

  it('\\n below the last line opens a new line; \\n mid-buffer only moves down', () => {
    let s = createVtState()
    s = vtWrite(s, 'one\ntwo\n')
    expect(s.lines).toHaveLength(3)
    // Move up two, then \n twice: walks back down over EXISTING lines.
    s = vtWrite(s, `${ESC}[2A\n\nthree`)
    expect(s.lines).toHaveLength(3)
    expect(vtPlainText(s)).toBe('one\ntwo\nthree')
  })

  it('CHA positions the column for the next write (splice and pad)', () => {
    let s = createVtState()
    s = vtWrite(s, 'abcdef')
    s = vtWrite(s, `${ESC}[3GXY`)
    expect(vtPlainText(s)).toBe('abXYef')
    s = vtWrite(s, `${ESC}[10Gz`) // past end — pads with spaces
    expect(vtPlainText(s)).toBe('abXYef   z')
  })
})

describe('chunk boundaries', () => {
  it('escape sequences split across chunks parse correctly (PATHOLOGICAL_SPLIT)', () => {
    const s = writeAll(PATHOLOGICAL_SPLIT)
    expect(vtPlainText(s)).toBe('TOPred\nbar 10%')
    const redSeg = at(s.lines, 0).segs.find(seg => seg.text === 'red')
    expect(redSeg?.style?.color).toBe('#cd3131')
  })

  it('SGR state carries across chunks and lines (SGR_CARRYOVER_SPLIT)', () => {
    const s = writeAll(SGR_CARRYOVER_SPLIT)
    const green = at(s.lines, 0).segs.filter(
      seg => seg.style?.color === '#0dbc79'
    )
    expect(green.map(seg => seg.text).join('')).toBe('green start and finish')
    const plain = at(s.lines, 0).segs.find(seg => seg.text === ' plain')
    expect(plain?.style ?? null).toBeNull()
  })
})

describe('strip list', () => {
  it('alt-screen / 2J / cursor save-restore / OSC are stripped without corrupting text', () => {
    let s = createVtState()
    s = vtWrite(
      s,
      `${ESC}[?1049hkeep1${ESC}[2J${ESC}7keep2${ESC}8${ESC}[skeep3${ESC}[u` +
        `${ESC}]0;title\x07keep4${ESC}[?25l${ESC}[?1049l\n`
    )
    expect(vtPlainText(s)).toBe('keep1keep2keep3keep4\n')
  })
})

describe('structural sharing (same contract as the reducer)', () => {
  it('vtWrite returns a NEW state and never mutates the input', () => {
    const before = createVtState()
    const frozenLines = before.lines
    const after = vtWrite(before, 'hello\n')
    expect(after).not.toBe(before)
    expect(after.lines).not.toBe(before.lines)
    expect(before.lines).toBe(frozenLines)
    expect(before.lines).toHaveLength(1) // pristine empty state
  })

  it('untouched lines keep reference identity; the touched line is a fresh object with a bumped version', () => {
    let s = createVtState()
    s = vtWrite(s, 'one\ntwo\nthree')
    const before = s
    const after = vtWrite(before, ' more')
    // Lines 0 and 1 untouched — memo-skip guarantee.
    expect(after.lines[0]).toBe(before.lines[0])
    expect(after.lines[1]).toBe(before.lines[1])
    // Line 2 (the open line) was appended to — fresh object, version bump.
    expect(after.lines[2]).not.toBe(before.lines[2])
    expect(at(after.lines, 2).version).toBeGreaterThan(
      at(before.lines, 2).version
    )
  })

  it('rewrite paths (\\r / EL / CUU splices) never mutate the input state (deep)', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[33mhello world${ESC}[0m\nsecond line`)
    const snapshot = JSON.parse(JSON.stringify(s))
    vtWrite(s, `${ESC}[1A\rHELLO${ESC}[K${ESC}[3G${ESC}[1K`)
    expect(JSON.parse(JSON.stringify(s))).toEqual(snapshot)
  })

  it('vtCapLines keeps the cursor inside the retained window', () => {
    let s = createVtState()
    s = vtWrite(s, 'a\nb\nc\nd\ne')
    s = vtWrite(s, `${ESC}[99A`) // cursor to row 0
    const { state, dropped } = vtCapLines(s, 2)
    expect(dropped).toBe(3)
    expect(state.cursorRow).toBe(0) // clamped — was on a dropped line
    expect(vtPlainText(state)).toBe('d\ne')
  })
})

describe('vtPlainText', () => {
  it('returns the visible text joined by newlines', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[31mcolored${ESC}[0m\nplain`)
    expect(vtPlainText(s)).toBe('colored\nplain')
  })
})

describe('golden parity vs V1 chunksToLines (review F-6, doc 03 Phase 9)', () => {
  // chunksToLines still drives the LEGACY export path while vtEngine
  // drives the live view — drift on uncommon SGR diverges the two
  // silently TODAY, and this suite is the safety net for the M3
  // internals swap. Fixtures cover the SGR surface V1 supported.
  const FIXTURES: [string, string[]][] = [
    ['plain multiline', ['alpha' + LF, 'beta' + LF + 'gamma']],
    [
      '16-color fg/bg + reset',
      [ESC + '[31mred ' + ESC + '[44mon-blue' + ESC + '[0m plain' + LF],
    ],
    ['bright 16-color', [ESC + '[92mbright-green' + ESC + '[0m' + LF]],
    [
      '256-color cube + grayscale',
      [ESC + '[38;5;196mred256 ' + ESC + '[38;5;244mgray' + ESC + '[0m' + LF],
    ],
    ['truecolor', [ESC + '[38;2;12;200;99mtruecolor' + ESC + '[0m' + LF]],
    [
      'bold dim italic underline strike inverse',
      [
        ESC +
          '[1mB' +
          ESC +
          '[2mD' +
          ESC +
          '[3mI' +
          ESC +
          '[4mU' +
          ESC +
          '[9mS' +
          ESC +
          '[7mV' +
          ESC +
          '[0m' +
          LF,
      ],
    ],
    [
      'attr resets 22/23/24/27/29',
      [
        ESC +
          '[1;3;4;7;9mall' +
          ESC +
          '[22m' +
          ESC +
          '[23m' +
          ESC +
          '[24m' +
          ESC +
          '[27m' +
          ESC +
          '[29mnone' +
          LF,
      ],
    ],
    ['multi-param single sequence', [ESC + '[1;31;44mloud' + ESC + '[0m' + LF]],
    [
      'state carries across chunk boundary',
      [ESC + '[35mmag', 'enta continues' + LF + 'next line too' + ESC + '[0m'],
    ],
    [
      'split escape across chunks',
      ['pre' + ESC, '[36mcyan' + ESC + '[0m' + LF],
    ],
    // NOTE (M3): the old 'cursor + OSC stripped' fixture left the table —
    // V1 strips EL/CUU while VT-lite INTERPRETS them, so cursor codes
    // diverge from chunksToLines by design (test-spec Phase 9 scopes
    // parity to "plain SGR streams"). OSC stripping still matches.
    ['OSC stripped', ['a' + ESC + ']0;title' + BEL + 'd' + LF]],
    [
      'default fg/bg via 39/49',
      [ESC + '[31;44mset' + ESC + '[39;49mdefaults' + LF],
    ],
  ]

  function v1Lines(chunks: string[]) {
    // V1 shape: ReactNode[][] — flatten each line to [text, style] pairs.
    return chunksToLines(chunks).map(line =>
      line.map(node => {
        if (typeof node === 'string') return { text: node, style: null }
        const el = node as {
          props: { style?: Record<string, unknown>; children: string }
        }
        return { text: el.props.children, style: el.props.style ?? null }
      })
    )
  }

  /** V1 joins-then-parses, merging runs V2 keeps as separate segs —
   *  identical rendering; normalize both sides for comparison. */
  function mergeRuns(
    lines: { text: string; style: Record<string, unknown> | null }[][]
  ) {
    return lines.map(line => {
      const merged: { text: string; style: Record<string, unknown> | null }[] =
        []
      for (const seg of line) {
        const prev = merged[merged.length - 1]
        if (prev && JSON.stringify(prev.style) === JSON.stringify(seg.style)) {
          prev.text += seg.text
        } else {
          merged.push({ ...seg })
        }
      }
      return merged
    })
  }

  function v2Lines(chunks: string[]) {
    let s = createVtState()
    for (const c of chunks) s = vtWrite(s, c)
    return s.lines.map(line =>
      line.segs.map(seg => ({ text: seg.text, style: seg.style ?? null }))
    )
  }

  for (const [name, chunks] of FIXTURES) {
    it('parity: ' + name, () => {
      const v1 = v1Lines(chunks)
      const v2 = v2Lines(chunks)
      // Same visible text per line…
      expect(v2.map(l => l.map(x => x.text).join(''))).toEqual(
        v1.map(l => l.map(x => x.text).join(''))
      )
      // …and identical style attributes on each (merged) segment run.
      expect(mergeRuns(v2 as never)).toEqual(mergeRuns(v1 as never))
    })
  }
})

describe('parameter defaults + degenerate inputs', () => {
  it('an empty chunk with nothing pending is a same-reference no-op', () => {
    const s = vtWrite(createVtState(), 'abc')
    expect(vtWrite(s, '')).toBe(s)
  })

  it('empty CSI [m acts as a full SGR reset (per ANSI spec)', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[31mred${ESC}[m plain`)
    const segs = at(s.lines, 0).segs
    expect(at(segs, 0).style?.color).toBe('#cd3131')
    expect(at(segs, 1).style ?? null).toBeNull()
  })

  it('a chunk that is ONLY a partial escape is held whole — no visible change', () => {
    let s = createVtState()
    s = vtWrite(s, 'abc')
    s = vtWrite(s, ESC)
    expect(s.pending).toBe(ESC)
    expect(vtPlainText(s)).toBe('abc')
  })

  it('bare CSI A / B / G default their parameter to 1', () => {
    let s = createVtState()
    s = vtWrite(s, 'one\ntwo\nthree')
    s = vtWrite(s, `${ESC}[A\rTWO`) // up one → line 1 rewrite
    expect(lineText(s, 1)).toBe('TWO')
    s = vtWrite(s, `${ESC}[B${ESC}[G!`) // down one, column → 1st col
    expect(lineText(s, 2)).toBe('!hree')
  })

  it('EL 1/2 on an already-empty line is a no-op that keeps line identity', () => {
    const before = vtWrite(createVtState(), 'x\n') // cursor on the empty line
    const after = vtWrite(before, `${ESC}[2K${ESC}[1K`)
    expect(after.lines[1]).toBe(before.lines[1])
    expect(vtPlainText(after)).toBe('x\n')
  })
})

describe('pending holdback bounds (review round-2 N-1)', () => {
  it('force-renders an oversized never-terminated escape tail instead of swallowing it', () => {
    let s = createVtState()
    // An OSC opener with no BEL/ST — pre-fix, EVERYTHING after this
    // accumulated invisibly in `pending`, unbounded.
    s = vtWrite(s, `before${LF}${ESC}]0;x`)
    s = vtWrite(s, 'A'.repeat(300))
    expect(vtPlainText(s)).toContain('A'.repeat(300))
    expect(s.pending).toBe('')
  })

  it('vtFlushPending renders a held fragment as literal text and clears pending', () => {
    let s = createVtState()
    s = vtWrite(s, `tail-text${ESC}]0;title-with-no-terminator`)
    // Held while the stream is live (legitimate split-escape safety)…
    expect(s.pending).not.toBe('')
    s = vtFlushPending(s)
    // …but surfaced as literal text once the stream/block ends.
    expect(s.pending).toBe('')
    expect(vtPlainText(s)).toContain('title-with-no-terminator')
  })

  it('vtFlushPending is a same-reference no-op when nothing is pending', () => {
    let s = createVtState()
    s = vtWrite(s, `clean${LF}`)
    expect(vtFlushPending(s)).toBe(s)
  })

  it('a genuinely split escape still reassembles under the cap (F-6 behavior preserved)', () => {
    let s = createVtState()
    s = vtWrite(s, `${ESC}[3`)
    s = vtWrite(s, `1mred${ESC}[0m${LF}`)
    const line = s.lines[0]
    const redSeg = line?.segs.find(seg => seg.text === 'red')
    expect(redSeg?.style?.color).toBe('#cd3131')
  })
})

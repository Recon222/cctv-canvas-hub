import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { chunksToLines } from '../services/ansiParser'

/**
 * ANSI parser unit tests (ported `processTerminal` retained-surface
 * test file, plan 6.3A — excluded from the numbered count).
 *
 * The parser was extracted from ProcessTerminal.tsx into its own
 * service file partly to make it testable in isolation. These tests
 * exercise the SGR-code paths that real-world tools emit:
 *
 *   • plain text passthrough
 *   • 16-color foreground / background
 *   • 256-color palette (CSI 38;5;N)
 *   • truecolor RGB (CSI 38;2;R;G;B)
 *   • bold / dim / italic / underline / inverse / strike
 *   • SGR reset (CSI 0m)
 *   • cursor-positioning sequences silently stripped
 *   • multi-line chunks (state carries between lines)
 *
 * Each test renders the parser's React-node output into the DOM via
 * testing-library/react and inspects either the text content or the
 * `style` attribute on the resulting <span>s.
 */

const ESC = '\x1B'

/** Test harness: wrap parser output in a div for DOM-based inspection. */
function renderLines(chunks: string[]) {
  const lines = chunksToLines(chunks)
  // Each "line" is a React.ReactNode[]. Render each line as its own
  // <div> so we can still inspect line-boundary state if needed.
  const { container } = render(
    <div data-testid="root">
      {lines.map((line, i) => (
        <div key={i} data-line={i}>
          {line.length === 0 ? ' ' : line}
        </div>
      ))}
    </div>
  )
  const root = container.querySelector('[data-testid="root"]')
  if (!(root instanceof HTMLElement)) {
    throw new Error('render harness root missing')
  }
  return root
}

describe('chunksToLines — plain text', () => {
  it('passes plain text through with no styling', () => {
    const root = renderLines(['hello world'])
    expect(root.textContent).toBe('hello world')
    // No styled <span> children — the parser pushes a plain string
    // when there's no active SGR state.
    expect(root.querySelector('span')).toBeNull()
  })

  it('splits multi-line chunks into per-line containers', () => {
    const root = renderLines(['line one\nline two\nline three'])
    const lineEls = root.querySelectorAll('[data-line]')
    expect(lineEls).toHaveLength(3)
    expect(lineEls[0]?.textContent).toBe('line one')
    expect(lineEls[1]?.textContent).toBe('line two')
    expect(lineEls[2]?.textContent).toBe('line three')
  })
})

describe('chunksToLines — 16-color SGR', () => {
  it('renders foreground red (CSI 31m) as a span with red color', () => {
    const root = renderLines([`${ESC}[31mred${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe('red')
    // BASE_16[1] === '#cd3131' (the red entry).
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*#cd3131|color:\s*rgb\(205,\s*49,\s*49\)/i
    )
  })

  it('renders background green (CSI 42m) as a span with green bg', () => {
    const root = renderLines([`${ESC}[42m bg ${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span).not.toBeNull()
    expect(span?.textContent).toBe(' bg ')
    // BASE_16[2] === '#0dbc79'.
    expect(span?.getAttribute('style')).toMatch(
      /background-color:\s*#0dbc79|background-color:\s*rgb\(13,\s*188,\s*121\)/i
    )
  })

  it('renders bright color via the 90-97 range (foreground bright red = CSI 91m)', () => {
    const root = renderLines([`${ESC}[91mbright${ESC}[0m`])
    const span = root.querySelector('span')
    // BASE_16[1 + 8] === '#f14c4c'.
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*#f14c4c|color:\s*rgb\(241,\s*76,\s*76\)/i
    )
  })
})

describe('chunksToLines — 256-color palette (CSI 38;5;N)', () => {
  it('renders a palette entry from the 16-color block (N < 16)', () => {
    // 38;5;3 — the standard yellow from the base 16.
    const root = renderLines([`${ESC}[38;5;3m256-yellow${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.textContent).toBe('256-yellow')
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*#e5e510|color:\s*rgb\(229,\s*229,\s*16\)/i
    )
  })

  it('renders a 6×6×6 cube color (16 ≤ N < 232)', () => {
    // 38;5;196 — bright red from the cube. Index 180 in the cube
    // (n - 16 = 180), which decomposes to r=5,g=0,b=0.
    // conv(5) = 55 + 5*40 = 255; conv(0) = 0. → rgb(255,0,0).
    const root = renderLines([`${ESC}[38;5;196mcube-red${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*rgb\(255,\s*0,\s*0\)/i
    )
  })

  it('renders a grayscale entry (N >= 232)', () => {
    // 38;5;240 — grayscale step 8. v = (240 - 232) * 10 + 8 = 88.
    const root = renderLines([`${ESC}[38;5;240mgray${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*rgb\(88,\s*88,\s*88\)/i
    )
  })
})

describe('chunksToLines — truecolor RGB (CSI 38;2;R;G;B)', () => {
  it('renders a truecolor foreground', () => {
    const root = renderLines([`${ESC}[38;2;100;200;50mtruecolor${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.textContent).toBe('truecolor')
    expect(span?.getAttribute('style')).toMatch(
      /color:\s*rgb\(100,\s*200,\s*50\)/i
    )
  })

  it('renders a truecolor background', () => {
    const root = renderLines([`${ESC}[48;2;10;20;30mbg${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(
      /background-color:\s*rgb\(10,\s*20,\s*30\)/i
    )
  })
})

describe('chunksToLines — formatting attributes', () => {
  it('renders bold (CSI 1m) as font-weight 600', () => {
    const root = renderLines([`${ESC}[1mbold${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.textContent).toBe('bold')
    expect(span?.getAttribute('style')).toMatch(/font-weight:\s*600/i)
  })

  it('renders italic (CSI 3m) as font-style italic', () => {
    const root = renderLines([`${ESC}[3mitalic${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(/font-style:\s*italic/i)
  })

  it('renders underline (CSI 4m) as text-decoration: underline', () => {
    const root = renderLines([`${ESC}[4munderline${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(
      /text-decoration:\s*[^;]*underline/i
    )
  })

  it('renders strike (CSI 9m) as text-decoration: line-through', () => {
    const root = renderLines([`${ESC}[9mstrike${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.getAttribute('style')).toMatch(
      /text-decoration:\s*[^;]*line-through/i
    )
  })

  it('stacks bold + colored text (CSI 1;31m) into one span', () => {
    const root = renderLines([`${ESC}[1;31mbold red${ESC}[0m`])
    const span = root.querySelector('span')
    expect(span?.textContent).toBe('bold red')
    const style = span?.getAttribute('style') ?? ''
    expect(style).toMatch(/font-weight:\s*600/i)
    expect(style).toMatch(/color:\s*#cd3131|color:\s*rgb\(205,\s*49,\s*49\)/i)
  })
})

describe('chunksToLines — SGR reset', () => {
  it('clears all attributes after CSI 0m', () => {
    const root = renderLines([`${ESC}[31mred${ESC}[0m plain`])
    // Two text segments: a styled "red" span and a plain " plain" string.
    expect(root.textContent).toBe('red plain')
    // The plain segment should NOT be wrapped in a styled span.
    // Easiest check: there's exactly ONE span (the "red" one).
    expect(root.querySelectorAll('span')).toHaveLength(1)
  })

  it('treats empty CSI [m as a full reset (per ANSI spec)', () => {
    const root = renderLines([`${ESC}[31mred${ESC}[m plain`])
    expect(root.textContent).toBe('red plain')
    expect(root.querySelectorAll('span')).toHaveLength(1)
  })
})

describe('chunksToLines — cursor / OSC stripping', () => {
  it('silently strips cursor-up sequence (CSI 5A)', () => {
    const root = renderLines([`before${ESC}[5Aafter`])
    expect(root.textContent).toBe('beforeafter')
  })

  it('silently strips clear-screen (CSI 2J)', () => {
    const root = renderLines([`a${ESC}[2Jb`])
    expect(root.textContent).toBe('ab')
  })

  it('silently strips OSC sequences (terminated by BEL)', () => {
    const root = renderLines([`x${ESC}]0;Some Title\x07y`])
    expect(root.textContent).toBe('xy')
  })

  it('silently strips private-mode set/reset (alt-screen, cursor visibility)', () => {
    // Rich emits ?25l/?25h around every Live render; full-screen TUIs
    // emit ?1049h/l. Pre-M3 these leaked as literal "[?25l" text.
    const root = renderLines([
      `${ESC}[?1049ha${ESC}[?25lb${ESC}[?25hc${ESC}[?1049ld`,
    ])
    expect(root.textContent).toBe('abcd')
  })

  it('silently strips DEC cursor save/restore (ESC 7 / ESC 8)', () => {
    const root = renderLines([`a${ESC}7b${ESC}8c`])
    expect(root.textContent).toBe('abc')
  })
})

describe('chunksToLines — state continuity across lines', () => {
  it('SGR state carries from one chunk into the next when not reset', () => {
    // No reset between "red" and "still red" — both should be the same color.
    const root = renderLines([`${ESC}[31mred\nstill red${ESC}[0m\nplain`])
    const lineEls = root.querySelectorAll('[data-line]')
    expect(lineEls).toHaveLength(3)
    // Line 0: "red" inside a styled span.
    expect(lineEls[0]?.querySelector('span')?.textContent).toBe('red')
    // Line 1: "still red" should also be styled (state carried across \n).
    const line1Span = lineEls[1]?.querySelector('span')
    expect(line1Span?.textContent).toBe('still red')
    expect(line1Span?.getAttribute('style')).toMatch(
      /color:\s*#cd3131|color:\s*rgb\(205,\s*49,\s*49\)/i
    )
    // Line 2: "plain" should not be styled (post-reset).
    expect(lineEls[2]?.querySelector('span')).toBeNull()
    expect(lineEls[2]?.textContent).toBe('plain')
  })
})

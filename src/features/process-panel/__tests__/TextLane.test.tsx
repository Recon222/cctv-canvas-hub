/**
 * TextLane — VT line rendering + the row memo contract (ported
 * `processTerminal` retained-surface test file, plan 6.3A — excluded
 * from the numbered count).
 * Pure render: everything via props (ADR-4); no store mocking.
 */

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TextLane } from '../components/TextLane'
import { createVtState, vtWrite } from '../services/vtEngine'
import { RICH_BAR_FRAMES, RICH_BAR_FINAL, at } from './test-utils'

function stateOf(...chunks: string[]) {
  let s = createVtState()
  for (const c of chunks) s = vtWrite(s, c)
  return s
}

describe('TextLane', () => {
  it('renders nothing for a pristine (never-written) state', () => {
    const { container } = render(<TextLane text={createVtState()} />)
    expect(container.firstChild).toBeNull()
  })

  it('renders one row per line, stamped with data-vt-version = line.version (the memo key)', () => {
    const s = stateOf('one\ntwo')
    const { container } = render(<TextLane text={s} />)
    const rows = container.querySelectorAll('[data-vt-version]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-vt-version')).toBe(
      String(at(s.lines, 0).version)
    )
    expect(rows[1]?.getAttribute('data-vt-version')).toBe(
      String(at(s.lines, 1).version)
    )
  })

  it('a \\r-rewritten bar renders as its single final frame with a bumped version', () => {
    const s = stateOf(...RICH_BAR_FRAMES)
    const { container } = render(<TextLane text={s} />)
    expect(container.textContent).toContain(RICH_BAR_FINAL)
    const rows = container.querySelectorAll('[data-vt-version]')
    expect(rows).toHaveLength(2) // bar + trailing empty line
    // Three frames rewrote the same line — the version reflects that.
    expect(Number(rows[0]?.getAttribute('data-vt-version'))).toBeGreaterThan(1)
  })

  it('styled segments render as spans; unstyled text renders bare', () => {
    const s = stateOf('\x1B[31mred\x1B[0m plain\n')
    const { container } = render(<TextLane text={s} />)
    const span = container.querySelector('span')
    expect(span?.textContent).toBe('red')
    expect(container.textContent).toContain(' plain')
  })

  it('preserves the whitespace-pre horizontal-scroll contract', () => {
    const s = stateOf('D:\\Some Very Long\\Path\n')
    const { container } = render(<TextLane text={s} />)
    const lane = container.querySelector('[data-testid="terminal-text-lane"]')
    expect(lane?.className).toContain('whitespace-pre')
  })
})

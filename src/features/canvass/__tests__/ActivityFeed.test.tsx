import { screen, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { ActivityFeed } from '../components/ActivityFeed'
import {
  useCanvassStore,
  resetCanvassStore,
  ATTENTION_TTL_MS,
} from '../store/canvass-store'
import type { ActivityEntry } from '../types'
import { SEED_CASE_ID } from './fixtures'

/**
 * Phase 5.1A (test #89 + arms): the poured feed renders the ring
 * newest-first with HH:MM:SS timestamps and the 12 s freshness tint.
 * Home-agnostic — the host owns scrolling and case-scoping (#90 pins
 * the scoping at the dashboard host).
 */

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: `e-${String(Math.random())}`,
    at: new Date(2026, 6, 20, 14, 32, 7).getTime(),
    caseId: SEED_CASE_ID,
    kind: 'location-status',
    locationId: 'l-1',
    summary: 'QuickMart Convenience — status → WORKING',
    ...overrides,
  }
}

beforeEach(() => {
  resetCanvassStore()
})

describe('ActivityFeed (Phase 5.1A)', () => {
  // Test #89
  it('renders the feed most-recent-first', () => {
    // Through the real pipeline: the ring PREPENDS, so pushing older
    // then newer leaves the newest at index 0 — and the feed must keep
    // that order in the DOM.
    act(() => {
      const store = useCanvassStore.getState()
      store.pushActivity(
        entry({ id: 'e-older', at: 1_000, summary: 'Older entry' })
      )
      store.pushActivity(
        entry({ id: 'e-newer', at: 2_000, summary: 'Newer entry' })
      )
    })

    renderWithFeatureProviders(
      <ActivityFeed entries={useCanvassStore.getState().activity} />
    )

    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.textContent).toContain('Newer entry')
    expect(rows[1]?.textContent).toContain('Older entry')
  })

  // Rule 6 arm: every row timestamp carries seconds.
  it('renders row timestamps with seconds', () => {
    renderWithFeatureProviders(<ActivityFeed entries={[entry()]} />)
    expect(screen.getByText('14:32:07')).toBeInTheDocument()
  })

  // Freshness tint arm: derived from the host's ticking `now`, never
  // from Date.now() in render (React Compiler purity rule).
  it('tints fresh rows only when the host provides a clock', () => {
    const at = new Date(2026, 6, 20, 14, 32, 7).getTime()
    const fresh = entry({ id: 'e-f', at, summary: 'Fresh row' })
    const old = entry({
      id: 'e-o',
      at: at - ATTENTION_TTL_MS - 1,
      summary: 'Old row',
    })

    const { rerender } = renderWithFeatureProviders(
      <ActivityFeed entries={[fresh, old]} now={at + 1_000} />
    )
    const rowOf = (text: string) => screen.getByText(text).closest('li')
    expect(rowOf('Fresh row')?.className).toContain('bg-hub-working/5')
    expect(rowOf('Old row')?.className).not.toContain('bg-hub-working/5')

    // No clock ⇒ no tint window at all.
    rerender(<ActivityFeed entries={[fresh, old]} />)
    expect(rowOf('Fresh row')?.className).not.toContain('bg-hub-working/5')
  })

  it('renders the designed empty state, never a blank column', () => {
    renderWithFeatureProviders(<ActivityFeed entries={[]} />)
    expect(screen.getByText('Awaiting first activity')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Everything that happens on this case lands here, newest first.'
      )
    ).toBeInTheDocument()
  })
})

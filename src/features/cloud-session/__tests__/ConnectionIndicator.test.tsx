import { screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import {
  ConnectionIndicator,
  ConnectionBanner,
} from '../components/ConnectionIndicator'
import type { HealthState } from '@/store/health-store'

/**
 * Phase 5.2 (tests #93–95, G4 honest liveness): the persistent chip
 * renders the state plus the last CONFIRMED server time with seconds,
 * and STALE/OFFLINE escalate to the unmissable banner. The banner
 * self-nulls everywhere else so hosts mount it unconditionally under
 * the header.
 */

// Local-time construction keeps the HH:MM:SS assertion timezone-proof.
const CONFIRMED_AT = new Date(2026, 6, 20, 14, 32, 7).getTime()

describe('ConnectionIndicator (Phase 5.2)', () => {
  // Test #93
  it('shows the state dot + last-updated time in live/connecting states', () => {
    const { rerender } = renderWithFeatureProviders(
      <ConnectionIndicator state="live" lastConfirm={CONFIRMED_AT} />
    )
    expect(screen.getByText('Live')).toBeInTheDocument()
    // Rule 6: seconds always — the sub-label is the last CONFIRMED
    // contact (max of event/fetch marks — the host derives it).
    expect(screen.getByText('Updated 14:32:07')).toBeInTheDocument()

    // Connecting before any confirmation: honest "awaiting", never a
    // fabricated time and never "updated —".
    rerender(<ConnectionIndicator state="connecting" lastConfirm={null} />)
    expect(screen.getByText('Connecting')).toBeInTheDocument()
    expect(screen.getByText('Awaiting first confirm')).toBeInTheDocument()

    // Reconnecting keeps the last confirmed time on the chip — the
    // operator sees exactly how old the board is while it retries.
    rerender(
      <ConnectionIndicator state="reconnecting" lastConfirm={CONFIRMED_AT} />
    )
    expect(screen.getByText('Reconnecting')).toBeInTheDocument()
    expect(screen.getByText('Updated 14:32:07')).toBeInTheDocument()
  })

  // Test #94
  it('escalates to banner mode when stale, with the since timestamp', () => {
    renderWithFeatureProviders(
      <>
        <ConnectionIndicator state="stale" lastConfirm={CONFIRMED_AT} />
        <ConnectionBanner state="stale" lastConfirm={CONFIRMED_AT} />
      </>
    )
    // The chip flips its sub-label to the harder "last confirmed" copy…
    expect(screen.getByText('Last confirmed 14:32:07')).toBeInTheDocument()
    // …and the banner is a real alert carrying the since-time (G4).
    const banner = screen.getByRole('alert')
    expect(banner.textContent).toContain('14:32:07')
    expect(banner.textContent).toMatch(/stale/i)
  })

  // Test #95
  it('escalates to banner mode when offline, and self-nulls otherwise', () => {
    const { rerender } = renderWithFeatureProviders(
      <ConnectionBanner state="offline" lastConfirm={CONFIRMED_AT} />
    )
    expect(screen.getByRole('alert').textContent).toMatch(/offline/i)

    // Unconditional-mount contract: every non-escalated state renders
    // nothing — the host never wraps the banner in its own condition.
    for (const state of ['live', 'connecting', 'reconnecting'] as const) {
      rerender(
        <ConnectionBanner state={state as HealthState} lastConfirm={null} />
      )
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    }
  })
})

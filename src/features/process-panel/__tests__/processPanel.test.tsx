import { act, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { commands } from '@/lib/tauri-bindings'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { useUIStore } from '@/store/ui-store'
import { resetHealthStore, useHealthStore } from '@/store/health-store'
// Cross-feature RELATIVE import, test-only: this file plays
// CanvassRoot's role — the host composes <ActivityFeed /> into the
// panel's activitySlot (plan 6.3A(c): composition at the mount site;
// the panel itself imports nothing from canvass).
import { ActivityFeed } from '../../canvass/components/ActivityFeed'
import { ProcessPanel } from '../components/ProcessPanel'
import { usePanelPosture } from '../hooks/usePanelPosture'
import type { ActivityEntry } from '../../canvass/types'

/**
 * Phase 6.3 — the ProcessPanel (#120, #122–125). The two Rust-backed
 * sources ride the setup.ts command mocks (6.3F); the health store is
 * the real global store, reset per test.
 */

function entry(id: string, at: number, summary: string): ActivityEntry {
  return {
    id,
    at,
    caseId: 'case-1',
    kind: 'location-status',
    summary,
  }
}

/** The host side of #125's contract: CanvassRoot calls usePanelPosture
 * with its view + per-view default (expanded everywhere except map). */
function PostureHarness({ view }: { view: 'cases' | 'case' | 'map' }) {
  usePanelPosture(view, view !== 'map')
  return <ProcessPanel activitySlot={<div>slot</div>} />
}

async function openSystemLane(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'System' }))
}

describe('ProcessPanel (6.3)', () => {
  beforeEach(() => {
    resetHealthStore()
    useUIStore.setState({ rightSidebarVisible: true })
    vi.mocked(commands.readLogTail).mockResolvedValue({
      status: 'ok',
      data: '',
    })
    vi.mocked(commands.vaultStatus).mockResolvedValue({
      status: 'ok',
      data: {
        config_present: true,
        vault_present: true,
        keyring_key_present: true,
        vault_mtime_ms: null,
      },
    })
  })

  afterEach(() => {
    resetHealthStore()
  })

  // Test #120 (R4, reassigned to 6.3 by A2 — panel, not window)
  it('renders diagnostics content in the SYSTEM lane', async () => {
    const user = userEvent.setup()
    vi.mocked(commands.readLogTail).mockResolvedValue({
      status: 'ok',
      data: '2026-07-21 INFO boot ok\n2026-07-21 INFO map ready',
    })
    vi.mocked(commands.vaultStatus).mockResolvedValue({
      status: 'ok',
      data: {
        config_present: true,
        vault_present: true,
        keyring_key_present: true,
        vault_mtime_ms: 1_753_000_000_000,
      },
    })
    renderWithFeatureProviders(
      <ProcessPanel
        activitySlot={<div>activity</div>}
        footerMeta={['V 0.1.0', 'SCHEMA 1']}
      />
    )

    // Poll discipline: on the (default) ACTIVITY lane, the disk/IPC
    // sources never run — a kiosk session is measured in days.
    await act(async () => {
      await Promise.resolve()
    })
    expect(vi.mocked(commands.readLogTail)).not.toHaveBeenCalled()
    expect(vi.mocked(commands.vaultStatus)).not.toHaveBeenCalled()

    await openSystemLane(user)

    // Log tail lines, source-tagged, via the diagnostics service (the
    // dim `HH:MM:SS [source]` tag is its own styled span; the body is
    // the row's direct text).
    expect(await screen.findByText(/boot ok/)).toBeInTheDocument()
    expect(screen.getByText(/map ready/)).toBeInTheDocument()
    expect(screen.getAllByText(/\[log\]/).length).toBeGreaterThanOrEqual(2)
    expect(vi.mocked(commands.readLogTail)).toHaveBeenCalled()

    // Vault/keyring status (presence words, never decrypted content).
    expect(
      screen.getByText(/config present · vault present · keyring key present/)
    ).toBeInTheDocument()
    expect(
      screen.getByText(/vault sealed \d{4}-\d{2}-\d{2}/)
    ).toBeInTheDocument()

    // Health detail: the lane Footer renders the live state cell
    // (transitions get their own source-tagged rows — #123).
    const footer = screen.getByTestId('process-monitor-footer')
    expect(within(footer).getByText('Connecting')).toBeInTheDocument()

    // App + schema versions (host-supplied footer chips).
    expect(screen.getByText('V 0.1.0')).toBeInTheDocument()
    expect(screen.getByText('SCHEMA 1')).toBeInTheDocument()
  })

  // Test #122
  it('renders canvass activity in the ACTIVITY lane', () => {
    const entries = [
      entry('e2', 2_000, 'Newest — Golden Dragon → WORKING'),
      entry('e1', 1_000, 'Oldest — QuickMart → COMPLETE'),
    ]
    renderWithFeatureProviders(
      <ProcessPanel activitySlot={<ActivityFeed entries={entries} />} />
    )

    const newest = screen.getByText('Newest — Golden Dragon → WORKING')
    const oldest = screen.getByText('Oldest — QuickMart → COMPLETE')
    expect(newest).toBeInTheDocument()
    // Newest-first DOM order (the ring is newest-first; the lane
    // renders the slot verbatim).
    expect(
      newest.compareDocumentPosition(oldest) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
  })

  // Test #123
  it('feeds the SYSTEM lane from health transitions + the log tail', async () => {
    const user = userEvent.setup()
    vi.mocked(commands.readLogTail).mockRejectedValue(
      new Error('log file missing')
    )
    renderWithFeatureProviders(
      <div>
        <p>board content stays</p>
        <ProcessPanel activitySlot={<div>activity</div>} />
      </div>
    )
    await openSystemLane(user)

    // A real health transition (connecting → live) renders a
    // source-tagged row — the adapter diffs state.state, so the
    // recordFetchOk envelope alone must not add noise rows.
    act(() => {
      useHealthStore.getState().channelStatus('subscribed')
      useHealthStore.getState().recordFetchOk()
    })
    expect(
      await screen.findByText(/health connecting → live/)
    ).toBeInTheDocument()
    expect(screen.getAllByText(/\[health\]/).length).toBeGreaterThanOrEqual(1)

    // A failed tail read is an inline error row — board unaffected.
    expect(
      await screen.findByText(/log tail unavailable — log file missing/)
    ).toBeInTheDocument()
    expect(screen.getByText('board content stays')).toBeInTheDocument()
  })

  it('renders a vault_status failure as an explicit error row, never "no key present"', async () => {
    const user = userEvent.setup()
    vi.mocked(commands.vaultStatus).mockResolvedValue({
      status: 'error',
      error: 'Keychain unavailable: locked',
    })
    renderWithFeatureProviders(
      <ProcessPanel activitySlot={<div>activity</div>} />
    )
    await openSystemLane(user)

    expect(
      await screen.findByText(
        /vault status unavailable — Keychain unavailable: locked/
      )
    ).toBeInTheDocument()
    // Never the all-false absent rendering (would send an operator to
    // re-enroll a healthy install).
    expect(screen.queryByText(/keyring key absent/)).not.toBeInTheDocument()
  })

  // Test #124
  it('toggles lanes and collapses to the SYS tab', async () => {
    const user = userEvent.setup()
    renderWithFeatureProviders(
      <ProcessPanel activitySlot={<div>activity lane content</div>} />
    )

    // ACTIVITY default: slot content visible, SYSTEM chrome absent.
    expect(screen.getByText('activity lane content')).toBeInTheDocument()
    expect(
      screen.queryByTestId('process-monitor-footer')
    ).not.toBeInTheDocument()

    // Toggle to SYSTEM: content swaps.
    await openSystemLane(user)
    expect(screen.getByTestId('process-monitor-footer')).toBeInTheDocument()
    expect(screen.queryByText('activity lane content')).not.toBeInTheDocument()

    // Collapse: the slim SYS tab renders, lanes unmount.
    await user.click(
      screen.getByRole('button', { name: 'Close process monitor' })
    )
    expect(
      screen.getByRole('button', { name: 'Open process monitor' })
    ).toHaveTextContent('Sys')
    expect(
      screen.queryByTestId('process-monitor-footer')
    ).not.toBeInTheDocument()

    // Expand: the SYSTEM lane selection survived the collapse.
    await user.click(
      screen.getByRole('button', { name: 'Open process monitor' })
    )
    expect(screen.getByTestId('process-monitor-footer')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'System' })).toHaveAttribute(
      'aria-selected',
      'true'
    )
  })

  // Test #125
  it('defaults the panel posture per view, with user toggles winning', async () => {
    const user = userEvent.setup()
    const { rerender } = renderWithFeatureProviders(
      <PostureHarness view="cases" />
    )

    // Fresh mount on cases ⇒ expanded, ACTIVITY active.
    const aside = screen.getByRole('complementary', {
      name: 'Process monitor',
    })
    expect(aside).toBeInTheDocument()
    // Overlay posture: absolutely positioned — map and stack NEVER
    // reflow when the panel expands (AD14).
    expect(aside.className).toContain('absolute')
    expect(screen.getByRole('tab', { name: 'Activity' })).toHaveAttribute(
      'aria-selected',
      'true'
    )

    // First entry to map ⇒ auto-collapse to the SYS tab.
    rerender(<PostureHarness view="map" />)
    expect(
      screen.getByRole('button', { name: 'Open process monitor' })
    ).toBeInTheDocument()

    // Manual expand on map (explicit user toggle)…
    await user.click(
      screen.getByRole('button', { name: 'Open process monitor' })
    )
    expect(
      screen.getByRole('complementary', { name: 'Process monitor' })
    ).toBeInTheDocument()

    // …survives map → case → map (views already seen: the view-derived
    // posture applies on FIRST entry only — fix-delta 2 precedence).
    rerender(<PostureHarness view="case" />)
    expect(
      screen.getByRole('complementary', { name: 'Process monitor' })
    ).toBeInTheDocument()
    rerender(<PostureHarness view="map" />)
    expect(
      screen.getByRole('complementary', { name: 'Process monitor' })
    ).toBeInTheDocument()
  })
})

import type { ReactNode } from 'react'
import { screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'
import Map, { useMap } from 'react-map-gl/mapbox'
import { usePreferences } from '@/features/preferences'
import { getSupabase } from '@/lib/supabase/client'
import type { AppPreferences } from '@/lib/tauri-bindings'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { CanvassRoot } from '../components/CanvassRoot'
import { MapCanvas, CANVASS_MAP_ID } from '../components/MapCanvas'
import { fetchCases } from '../services/canvassService'
import { toCanvassCase } from '../services/mappers'
import { resetCanvassStore, useCanvassStore } from '../store/canvass-store'
import { caseRow, SEED_CASE_ID } from './fixtures'

/**
 * Phase 3.2 (tests #68–69): the token gate is a designed state, and a
 * configured token mounts a real `<Map>` with the token + style props.
 * mapbox-gl needs WebGL, which jsdom lacks — the react-map-gl module is
 * mocked at its entrypoint and the recorded props are the assertion
 * surface (doc 03 preamble: mock at the choke point).
 */

vi.mock('react-map-gl/mapbox', () => ({
  __esModule: true,
  default: vi.fn(({ children }: { children?: ReactNode }) => (
    <div data-testid="mapbox-map">{children}</div>
  )),
  useMap: vi.fn(() => ({ current: undefined })),
  MapProvider: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Source: ({ children }: { children?: ReactNode }) => <>{children}</>,
  Layer: () => null,
}))
vi.mock('mapbox-gl', () => ({ default: { Marker: vi.fn() } }))
vi.mock('@/features/preferences', () => ({ usePreferences: vi.fn() }))
vi.mock('@/lib/supabase/client')
vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(() => Promise.resolve([])),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchLocationCounts: vi.fn(() => Promise.resolve({})),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))

const MockMap = vi.mocked(Map)
const mockUsePreferences = vi.mocked(usePreferences)

function preferencesResult(overrides: Partial<AppPreferences>) {
  return {
    data: {
      theme: 'system',
      quick_pane_shortcut: null,
      language: null,
      mapbox_token: null,
      map_style: null,
      idle_lock_minutes: null,
      ...overrides,
    },
    isPending: false,
  } as UseQueryResult<AppPreferences>
}

/** Every recorded render's props for the mocked `<Map>`. */
function mapProps() {
  return MockMap.mock.calls.map(call => call[0])
}

/** Board-mount plumbing shared by the CanvassRoot-based tests: the
 * realtime channel fake (casesView precedent) + a keyed map for the
 * furniture's provider seam. */
function stubBoardSeams() {
  const channel = { on: vi.fn(), subscribe: vi.fn() }
  channel.on.mockReturnValue(channel)
  vi.mocked(getSupabase).mockReturnValue({
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  } as unknown as ReturnType<typeof getSupabase>)
  const zoomIn = vi.fn()
  vi.mocked(useMap).mockReturnValue({
    [CANVASS_MAP_ID]: { zoomIn, zoomOut: vi.fn(), fitBounds: vi.fn() },
  } as unknown as ReturnType<typeof useMap>)
  return { zoomIn }
}

beforeEach(() => {
  vi.clearAllMocks()
  resetCanvassStore()
  useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'map' })
  vi.mocked(fetchCases).mockResolvedValue(
    [toCanvassCase(caseRow())].filter(c => c !== null)
  )
})

describe('MapCanvas (Phase 3.2)', () => {
  // Test #68
  it('shows the token gate when no Mapbox token is configured', () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: null })
    )

    renderWithFeatureProviders(<MapCanvas />)

    expect(
      screen.getByText("A Mapbox token hasn't been set")
    ).toBeInTheDocument()
    expect(
      screen.getByText('Preferences → Map → Mapbox access token')
    ).toBeInTheDocument()
    // The designed state, not a broken map: no <Map> ever mounts.
    expect(MockMap).not.toHaveBeenCalled()
    expect(screen.queryByTestId('mapbox-map')).not.toBeInTheDocument()
  })

  // Test #69
  it('mounts the map with token + style props when a token exists', () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: 'pk.test-fake-token' })
    )

    renderWithFeatureProviders(<MapCanvas />)

    expect(screen.getByTestId('mapbox-map')).toBeInTheDocument()
    const props = mapProps().at(-1)
    expect(props?.mapboxAccessToken).toBe('pk.test-fake-token')
    // A2 design binding: satellite is the default style (night preset is
    // applied via setConfigProperty on style load — live-verified, not
    // unit-testable through the mock).
    expect(props?.mapStyle).toBe('mapbox://styles/mapbox/standard-satellite')
    expect(
      screen.queryByText("A Mapbox token hasn't been set")
    ).not.toBeInTheDocument()
  })

  // PR #6 review M2: an errored preferences query used to fall through
  // to `token === null` and render the token-MISSING gate — "add a
  // token in Preferences" is a lie when the settings file couldn't be
  // read (the token may be fine), and MapPane's disabled empty field is
  // a dead end.
  it('renders the preferences-unreadable state — not the token gate — when preferences fail to load', () => {
    mockUsePreferences.mockReturnValue({
      data: undefined,
      isPending: false,
      isError: true,
    } as UseQueryResult<AppPreferences>)

    renderWithFeatureProviders(<MapCanvas />)

    expect(screen.getByText('Settings could not be read')).toBeInTheDocument()
    // The truth, not the token lie:
    expect(
      screen.queryByText("A Mapbox token hasn't been set")
    ).not.toBeInTheDocument()
    expect(MockMap).not.toHaveBeenCalled()
  })

  it('honors the map_style preference', () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({
        mapbox_token: 'pk.test-fake-token',
        map_style: 'dark-v11',
      })
    )

    renderWithFeatureProviders(<MapCanvas />)

    expect(mapProps().at(-1)?.mapStyle).toBe('mapbox://styles/mapbox/dark-v11')
  })
})

describe('map furniture (M3 live-smoke fix round)', () => {
  // Regression pin for the layering defect: legend + zoom/fit controls
  // used to render inside the UNSCALED full-window map layer, where the
  // scaled opaque NavRail (86 design-px × scale) painted over their
  // inline-start band — obscured AND click-dead at any scale ≠ their
  // static offset. The fix homes them in the scaled chrome layer's
  // <main> (laid out AFTER the rail in the flex row — the rail can
  // never cover them) and drives the map through react-map-gl's
  // MapProvider seam.
  it('mounts legend + zoom controls in the chrome layer, driving the map through the provider seam', async () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: 'pk.test-fake-token' })
    )
    const { zoomIn } = stubBoardSeams()

    const user = userEvent.setup()
    renderWithFeatureProviders(<CanvassRoot />)

    // Furniture lives in the chrome <main> — beside the rail, never
    // under it.
    const fitAll = await screen.findByRole('button', {
      name: 'Fit all locations',
    })
    expect(fitAll.closest('main')).not.toBeNull()
    expect(screen.getByText('Incident').closest('main')).not.toBeNull()
    // The map itself stays in the unscaled sibling layer (3.2D/AD15).
    expect(screen.getByTestId('mapbox-map').closest('main')).toBeNull()

    // And it is CLICKABLE: the instruments drive the map via the seam.
    await user.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoomIn).toHaveBeenCalledTimes(1)
  })
})

describe('style-load failure state (PR #6 H1)', () => {
  // mapbox-gl 3.26 fetches the style DOCUMENT once, with no retry (only
  // tiles retry) — a terminal style failure used to leave a permanently
  // blank map with live-looking furniture and one log line. The fix
  // surfaces a persistent designed state and pulls the instruments.
  const fireMapError = (status: number) => {
    const onError = mapProps().at(-1)?.onError
    if (onError === undefined) {
      throw new Error('mock <Map> captured no onError prop')
    }
    act(() => {
      onError({
        error: Object.assign(new Error('style fetch failed'), { status }),
      } as never)
    })
  }
  const fireMapLoad = () => {
    const onLoad = mapProps().at(-1)?.onLoad
    if (onLoad === undefined) {
      throw new Error('mock <Map> captured no onLoad prop')
    }
    act(() => {
      onLoad({} as never)
    })
  }

  it('surfaces the style-error state and pulls the furniture on a pre-load failure', async () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: 'pk.test-fake-token' })
    )
    stubBoardSeams()
    renderWithFeatureProviders(<CanvassRoot />)
    // Furniture is live before the failure…
    await screen.findByRole('button', { name: 'Fit all locations' })

    // …then the style document fetch dies (offline / 402 / 429 / bad
    // style id → 404) while the style never loaded.
    fireMapError(500)

    expect(
      screen.getByText(
        'Map error — style failed to load · board stays live in the card list'
      )
    ).toBeInTheDocument()
    // No live-looking instruments over a dead map.
    expect(
      screen.queryByRole('button', { name: 'Fit all locations' })
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Zoom in' })
    ).not.toBeInTheDocument()
  })

  it('keeps the rejected-token gate — not styleError — for auth failures', () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: 'pk.test-fake-token' })
    )
    renderWithFeatureProviders(<MapCanvas />)

    fireMapError(401)

    expect(
      screen.getByText('Map error — token rejected · check Preferences')
    ).toBeInTheDocument()
    expect(
      screen.queryByText(
        'Map error — style failed to load · board stays live in the card list'
      )
    ).not.toBeInTheDocument()
  })

  it('stays silent for errors after a successful style load (tiles retry)', () => {
    mockUsePreferences.mockReturnValue(
      preferencesResult({ mapbox_token: 'pk.test-fake-token' })
    )
    renderWithFeatureProviders(<MapCanvas />)

    fireMapLoad()
    fireMapError(503)

    // Transient exemption: mapbox retries tiles on its own.
    expect(
      screen.queryByText(
        'Map error — style failed to load · board stays live in the card list'
      )
    ).not.toBeInTheDocument()
  })
})

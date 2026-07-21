import type { ReactNode } from 'react'
import { screen } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { UseQueryResult } from '@tanstack/react-query'
import Map from 'react-map-gl/mapbox'
import { usePreferences } from '@/features/preferences'
import type { AppPreferences } from '@/lib/tauri-bindings'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { MapCanvas } from '../components/MapCanvas'
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

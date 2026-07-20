import { screen, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderWithFeatureProviders } from '@/test/feature-test-utils'
import { useSessionStore } from '@/features/cloud-session'
import { LocationCard } from '../components/LocationCard'
import { LocationCardStack } from '../components/LocationCardStack'
import { toCanvassLocation } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type { CanvassLocation, LocationRow } from '../types'
import { locationRow, SEED_CASE_ID } from './fixtures'

// Component tests mock the service layer (testing.md convention).
vi.mock('../services/canvassService', () => ({
  fetchCases: vi.fn(() => Promise.resolve([])),
  fetchLocations: vi.fn(() => Promise.resolve([])),
  fetchMedia: vi.fn(() => Promise.resolve([])),
}))
// The realtime seam under CanvassRoot consumers never runs here, but the
// client module must not be touched by accident either.
vi.mock('@/lib/supabase/client')

function mapped(row: LocationRow): CanvassLocation {
  const location = toCanvassLocation(row)
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

beforeEach(() => {
  resetCanvassStore()
  useSessionStore.setState({ state: 'active' })
})

describe('LocationCard', () => {
  // Test #57
  it('renders card fields from the view-model', () => {
    renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    expect(screen.getAllByText('QuickMart Convenience').length).toBeGreaterThan(
      0
    )
    expect(
      screen.getByText('17600 Yonge St, Newmarket, ON')
    ).toBeInTheDocument()
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Det. A. Morgan')).toBeInTheDocument()
    expect(screen.getByText(/Arrived/)).toBeInTheDocument()
    // A row without GPS shows its designed chip instead of a marker.
    renderWithFeatureProviders(
      <LocationCard
        location={mapped(locationRow({ id: 'l-nofix', location: null }))}
      />
    )
    expect(screen.getByText('No GPS fix')).toBeInTheDocument()
  })

  // Test #58
  it('renders DVR credentials plainly, always — in every session state', () => {
    const { container, rerender } = renderWithFeatureProviders(
      <LocationCard location={mapped(locationRow())} />
    )

    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('QuickM@rt2024')).toBeInTheDocument()
    const unlockedText = container.textContent

    // Locking the session alters NOTHING on the card (AD6 + owner
    // directive: credentials are ordinary strings; lock changes no content).
    act(() => {
      useSessionStore.setState({ state: 'locked' })
    })
    rerender(<LocationCard location={mapped(locationRow())} />)
    expect(screen.getByText('admin')).toBeInTheDocument()
    expect(screen.getByText('QuickM@rt2024')).toBeInTheDocument()
    expect(container.textContent).toBe(unlockedText)
  })

  // Test #59
  it('reflects status with distinct styling per state', () => {
    renderWithFeatureProviders(
      <div>
        <LocationCard
          location={mapped(locationRow({ id: 'l-s', status: 'started' }))}
        />
        <LocationCard
          location={mapped(locationRow({ id: 'l-w', status: 'working' }))}
        />
        <LocationCard
          location={mapped(locationRow({ id: 'l-c', status: 'complete' }))}
        />
      </div>
    )

    const started = screen.getByText('Started').className
    const working = screen.getByText('Working').className
    const complete = screen.getByText('Complete').className
    expect(started).not.toBe(working)
    expect(working).not.toBe(complete)
    expect(started).not.toBe(complete)
  })

  // Test #60
  it('renders designed empty states, never a blank screen', async () => {
    useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'case' })

    renderWithFeatureProviders(<LocationCardStack />)

    expect(await screen.findByText('No locations yet')).toBeInTheDocument()
    expect(
      screen.getByText(
        'Locations appear as investigators add them to this case.'
      )
    ).toBeInTheDocument()
  })
})

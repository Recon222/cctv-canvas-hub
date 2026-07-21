import React, { type RefObject } from 'react'
import { renderHook, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { MapRef } from 'react-map-gl/mapbox'
import { LOCATIONS_KEY } from '@/store/health-store'
import { useFlyTo, cameraPadding } from '../hooks/useFlyTo'
import { toCanvassLocation } from '../services/mappers'
import { resetCanvassStore, useCanvassStore } from '../store/canvass-store'
import type { CanvassLocation } from '../types'
import { locationRow, SEED_CASE_ID, SEED_LOCATION_ID } from './fixtures'

/**
 * Phase 3.3C (tests #73–74): the two-way selection contract has ONE
 * owner — useFlyTo watches `selectedLocationId` and, whatever set it
 * (card click or marker click), flies the map to the coord AND scrolls
 * the card into view. Card and marker never call map methods
 * themselves.
 */

function mapped(): CanvassLocation {
  const location = toCanvassLocation(locationRow())
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

function fakeMapRef() {
  const flyTo = vi.fn()
  const mapRef = { current: { flyTo } } as unknown as RefObject<MapRef | null>
  return { mapRef, flyTo }
}

function setup(seedLocations = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  if (seedLocations) {
    queryClient.setQueryData([LOCATIONS_KEY, SEED_CASE_ID], [mapped()])
  }
  const wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children)
  const { mapRef, flyTo } = fakeMapRef()
  renderHook(() => useFlyTo(mapRef), { wrapper })
  return { queryClient, flyTo }
}

/** A stand-in card in the document carrying the hook's scroll target. */
function mountCard(locationId: string) {
  const card = document.createElement('article')
  card.setAttribute('data-location-id', locationId)
  const scrollIntoView = vi.fn()
  card.scrollIntoView = scrollIntoView
  document.body.appendChild(card)
  return { card, scrollIntoView }
}

beforeEach(() => {
  resetCanvassStore()
  useCanvassStore.setState({ selectedCaseId: SEED_CASE_ID, view: 'map' })
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('useFlyTo (Phase 3.3C)', () => {
  // Test #73
  it('flies to a location when its card is selected', () => {
    const { flyTo } = setup()
    mountCard(SEED_LOCATION_ID)

    act(() => {
      useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    })

    expect(flyTo).toHaveBeenCalledTimes(1)
    const options = flyTo.mock.calls[0]?.[0] as {
      center: [number, number]
    }
    expect(options.center[0]).toBeCloseTo(-79.4663, 4)
    expect(options.center[1]).toBeCloseTo(44.0501, 4)
  })

  // Test #74
  it('scrolls the card into view when its marker selects it', () => {
    const { flyTo } = setup()
    const { scrollIntoView } = mountCard(SEED_LOCATION_ID)

    // A marker click's only contract is selectLocation (MarkerLayer) —
    // the hook owns the scroll side of the sync.
    act(() => {
      useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    })

    expect(useCanvassStore.getState().selectedLocationId).toBe(SEED_LOCATION_ID)
    expect(scrollIntoView).toHaveBeenCalled()
    expect(flyTo).toHaveBeenCalled()
  })

  it('never flies for a no-fix location — the card still scrolls', () => {
    const { queryClient, flyTo } = setup(false)
    const noFix = toCanvassLocation(
      locationRow({ id: 'l-nofix', location: null })
    )
    queryClient.setQueryData([LOCATIONS_KEY, SEED_CASE_ID], [noFix])
    const { scrollIntoView } = mountCard('l-nofix')

    act(() => {
      useCanvassStore.getState().selectLocation('l-nofix')
    })

    expect(flyTo).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
  })

  it('clearing the selection does nothing', () => {
    const { flyTo } = setup()

    act(() => {
      useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    })
    flyTo.mockClear()
    act(() => {
      useCanvassStore.getState().selectLocation(null)
    })

    expect(flyTo).not.toHaveBeenCalled()
  })

  // PR #6 review M1: re-selecting the already-selected location was a
  // dead interaction (same primitive id ⇒ Zustand no-op ⇒ the effect
  // never re-ran). Concrete: click marker A, pan far away, click A
  // again — nothing. The selectionTick nonce makes every selectLocation
  // call re-fire the sync.
  it('re-fires fly-to when the SAME location is selected again', () => {
    const { flyTo } = setup()
    mountCard(SEED_LOCATION_ID)

    act(() => {
      useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    })
    expect(flyTo).toHaveBeenCalledTimes(1)

    // The coordinator pans away, then clicks the same marker/card again.
    act(() => {
      useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    })
    expect(flyTo).toHaveBeenCalledTimes(2)
  })
})

describe('cameraPadding (PR #6 review L4)', () => {
  afterEach(() => {
    document.documentElement.dir = ''
  })

  it('flips the stack/rail padding sides under RTL', () => {
    document.documentElement.dir = 'ltr'
    const ltr = cameraPadding()
    document.documentElement.dir = 'rtl'
    const rtl = cameraPadding()

    // LTR: stack clearance on the right, rail on the left; RTL mirrors.
    expect(ltr.right).toBeGreaterThan(ltr.left)
    expect(rtl.left).toBe(ltr.right)
    expect(rtl.right).toBe(ltr.left)
  })
})

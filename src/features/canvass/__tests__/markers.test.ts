import { describe, it, expect, vi } from 'vitest'
import {
  createLocationMarker,
  updateLocationMarker,
  createIncidentMarker,
  type LocationMarkerState,
} from '../components/map/markers'

/**
 * PR #6 review M3 (tests #132–134): the pure DOM marker factories were
 * shipped untested despite being jsdom-testable — the marker-click
 * dispatch (the marker half of #74's contract), the dataset toggles
 * `updateLocationMarker` owns, and the MARKER-BINDING rule (the root
 * handed to `new mapboxgl.Marker({element})` must never carry its own
 * position/transform/transition — the exact bug that bit the field
 * app) were all unpinned.
 */

function state(
  overrides: Partial<LocationMarkerState> = {}
): LocationMarkerState {
  return {
    status: 'started',
    label: 'QuickMart',
    selected: false,
    attention: false,
    ...overrides,
  }
}

describe('marker factories (PR #6 review M3)', () => {
  // Test #132
  it('dispatches onSelect from a marker click', () => {
    const onSelect = vi.fn()
    const root = createLocationMarker(state(), onSelect)

    root.dispatchEvent(new MouseEvent('click', { bubbles: true }))

    expect(onSelect).toHaveBeenCalledTimes(1)
  })

  // Test #133
  it('flips selection/attention/status datasets idempotently on update', () => {
    const root = createLocationMarker(state(), vi.fn())
    expect(root.dataset.status).toBe('started')
    expect('selected' in root.dataset).toBe(false)
    expect('attention' in root.dataset).toBe(false)

    updateLocationMarker(root, state({ selected: true, attention: true }))
    // Idempotent: a second identical update changes nothing.
    updateLocationMarker(root, state({ selected: true, attention: true }))
    expect('selected' in root.dataset).toBe(true)
    expect('attention' in root.dataset).toBe(true)

    updateLocationMarker(
      root,
      state({ status: 'complete', selected: false, attention: false })
    )
    expect(root.dataset.status).toBe('complete')
    expect('selected' in root.dataset).toBe(false)
    expect('attention' in root.dataset).toBe(false)
    // The trio language: COMPLETE dots carry the check glyph.
    expect(root.querySelector('.hub-marker-dot')?.textContent).toBe('✓')
    updateLocationMarker(root, state({ status: 'working' }))
    expect(root.querySelector('.hub-marker-dot')?.textContent).toBe('')
    expect(root.querySelector('.hub-marker-label')?.textContent).toBe(
      'QuickMart'
    )
  })

  // Test #134
  it('never puts position/transform/transition on the marker ROOT (binding rule)', () => {
    // MARKER-BINDING-FIX: Mapbox writes transform: translate(...) onto
    // the root every move frame — any of these on the root makes
    // markers swim on pan. All visuals live on child elements.
    const root = createLocationMarker(state(), vi.fn())
    expect(root.style.transform).toBe('')
    expect(root.style.transition).toBe('')
    expect(root.style.position).toBe('')

    // …and updates never sneak one on either.
    updateLocationMarker(
      root,
      state({ status: 'complete', selected: true, attention: true })
    )
    expect(root.style.transform).toBe('')
    expect(root.style.transition).toBe('')
    expect(root.style.position).toBe('')

    const incident = createIncidentMarker('INCIDENT · QUICKMART')
    expect(incident.style.transform).toBe('')
    expect(incident.style.transition).toBe('')
    expect(incident.style.position).toBe('')
  })
})

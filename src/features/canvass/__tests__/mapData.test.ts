import { describe, it, expect } from 'vitest'
import {
  locationsToGeoJson,
  incidentFeature,
  clusterLayer,
  clusterCountLayer,
  CANVASS_SOURCE_ID,
} from '../services/mapData'
import { toCanvassCase, toCanvassLocation } from '../services/mappers'
import { ATTENTION_TTL_MS } from '../store/canvass-store'
import type { CanvassCase, CanvassLocation, LocationRow } from '../types'
import { caseRow, locationRow } from './fixtures'

/**
 * Phase 3.3A (tests #70–72): the pure GeoJSON boundary. `coord: null`
 * rows never become features (they live on cards + the "no fix" chip);
 * features carry the status + attention props the layers style on; the
 * incident is its own feature, never mixed into the location source.
 */

function mapped(row: LocationRow): CanvassLocation {
  const location = toCanvassLocation(row)
  if (location === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return location
}

function mappedCase(): CanvassCase {
  const canvassCase = toCanvassCase(caseRow())
  if (canvassCase === null) {
    throw new Error('fixture case unexpectedly soft-deleted')
  }
  return canvassCase
}

describe('mapData (Phase 3.3A)', () => {
  // Test #70
  it('builds GeoJSON only from locations with coordinates', () => {
    const locations = [
      mapped(locationRow()),
      mapped(locationRow({ id: 'l-nofix', location: null })),
      mapped(locationRow({ id: 'l-nullisland', location: null })),
    ]

    const collection = locationsToGeoJson(locations, {}, 0)

    expect(collection.type).toBe('FeatureCollection')
    expect(collection.features).toHaveLength(1)
    const feature = collection.features[0]
    expect(feature?.properties.id).toBe(locationRow().id)
    // lng-first GeoJSON order, from the parsed WKB.
    expect(feature?.geometry.coordinates[0]).toBeCloseTo(-79.4663, 4)
    expect(feature?.geometry.coordinates[1]).toBeCloseTo(44.0501, 4)
  })

  // Test #71
  it('carries status and attention props on features', () => {
    const now = 1_000_000
    const locations = [
      mapped(locationRow({ id: 'l-fresh', status: 'working' })),
      mapped(locationRow({ id: 'l-stale', status: 'started' })),
      mapped(locationRow({ id: 'l-none', status: 'complete' })),
    ]
    const attention = {
      'l-fresh': now - 1_000, // inside the TTL ⇒ attention
      'l-stale': now - ATTENTION_TTL_MS - 1, // expired ⇒ no attention
    }

    const byId = new Map(
      locationsToGeoJson(locations, attention, now).features.map(f => [
        f.properties.id,
        f.properties,
      ])
    )

    expect(byId.get('l-fresh')).toMatchObject({
      status: 'working',
      attention: true,
    })
    expect(byId.get('l-stale')).toMatchObject({
      status: 'started',
      attention: false,
    })
    expect(byId.get('l-none')).toMatchObject({
      status: 'complete',
      attention: false,
    })
  })

  // Test #72
  it('emits a distinct incident feature when the case has coords', () => {
    const withCoords = incidentFeature(mappedCase())
    expect(withCoords).not.toBeNull()
    expect(withCoords?.geometry.coordinates[0]).toBeCloseTo(-79.4663, 4)
    expect(withCoords?.geometry.coordinates[1]).toBeCloseTo(44.0501, 4)
    expect(withCoords?.properties.kind).toBe('incident')

    // No incident coords ⇒ no feature — never a null-island marker.
    const bare = toCanvassCase(
      caseRow({ incident_latitude: null, incident_longitude: null })
    )
    expect(bare === null ? null : incidentFeature(bare)).toBeNull()

    // The incident never leaks into the clustered location source.
    const collection = locationsToGeoJson([mapped(locationRow())], {}, 0)
    expect(
      collection.features.some(
        f => (f.properties as { kind?: string }).kind === 'incident'
      )
    ).toBe(false)
  })

  it('pins the cluster layer specs to the shared source', () => {
    // Mapbox built-in GeoJSON clustering (AD4 — no supercluster dep):
    // both layers render clusters only; single points are HTML markers.
    expect(clusterLayer.source).toBe(CANVASS_SOURCE_ID)
    expect(clusterCountLayer.source).toBe(CANVASS_SOURCE_ID)
    expect(clusterLayer.filter).toEqual(['has', 'point_count'])
    expect(clusterCountLayer.filter).toEqual(['has', 'point_count'])
  })
})

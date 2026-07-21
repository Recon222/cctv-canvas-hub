import type {
  CircleLayerSpecification,
  SymbolLayerSpecification,
} from 'mapbox-gl'
import { ATTENTION_TTL_MS } from '../store/canvass-store'
import type { CanvassCase, CanvassLocation } from '../types'

/**
 * Pure GeoJSON boundary for the map (Phase 3.3A). `coord: null` rows
 * NEVER reach GeoJSON — they live on cards + the "no fix" chip
 * (trap §5.5.2). Clustering is Mapbox GL's built-in GeoJSON clustering
 * (AD4 — no supercluster dep): the source clusters, the two GL layers
 * below render CLUSTERS ONLY, and unclustered points render as the HTML
 * marker factories (MarkerLayer reconciles the two).
 *
 * Minimal structural GeoJSON types on purpose: `@types/geojson` is not
 * installed and M3's only allowed new deps are mapbox-gl + react-map-gl;
 * mapbox-gl's `data` prop is structurally typed, so these satisfy it.
 */

export interface PointFeature<P> {
  type: 'Feature'
  geometry: { type: 'Point'; coordinates: [number, number] }
  properties: P
}

export interface PointFeatureCollection<P> {
  type: 'FeatureCollection'
  features: PointFeature<P>[]
}

export interface LocationFeatureProperties {
  id: string
  status: CanvassLocation['status']
  /** Fresh within ATTENTION_TTL_MS of the last update (doc 01 §5.4). */
  attention: boolean
  name: string
}

export interface IncidentFeatureProperties {
  kind: 'incident'
  name: string
}

/**
 * Locations with a fix → point features carrying the status + attention
 * props (#71). `now` comes from the caller's ticking clock (`useNow`) —
 * never `Date.now()` during a render.
 */
export function locationsToGeoJson(
  locations: CanvassLocation[],
  attentionByLocation: Record<string, number>,
  now: number
): PointFeatureCollection<LocationFeatureProperties> {
  const features: PointFeature<LocationFeatureProperties>[] = []
  for (const location of locations) {
    if (location.coord === null) {
      continue
    }
    const stampedAt = attentionByLocation[location.id]
    features.push({
      type: 'Feature',
      geometry: {
        type: 'Point',
        coordinates: [location.coord.lng, location.coord.lat],
      },
      properties: {
        id: location.id,
        status: location.status,
        attention:
          stampedAt !== undefined && now - stampedAt < ATTENTION_TTL_MS,
        name: location.name,
      },
    })
  }
  return { type: 'FeatureCollection', features }
}

/** The incident as its own feature — never part of the clustered
 * location source (#72). Null when the case has no incident coords. */
export function incidentFeature(
  canvassCase: CanvassCase
): PointFeature<IncidentFeatureProperties> | null {
  if (canvassCase.incidentCoord === null) {
    return null
  }
  return {
    type: 'Feature',
    geometry: {
      type: 'Point',
      coordinates: [
        canvassCase.incidentCoord.lng,
        canvassCase.incidentCoord.lat,
      ],
    },
    properties: {
      kind: 'incident',
      name: canvassCase.incidentBusinessName,
    },
  }
}

export const CANVASS_SOURCE_ID = 'canvass-locations'
export const CLUSTER_LAYER_ID = 'canvass-clusters'
export const CLUSTER_COUNT_LAYER_ID = 'canvass-cluster-count'
/** Built-in clustering knobs (Source props). */
export const CLUSTER_MAX_ZOOM = 14
export const CLUSTER_RADIUS = 50

/**
 * Cluster bubble — chip ground with the accent ring (GL paint can't
 * read CSS vars; values mirror --hub-chip / --hub-accent / --hub-heading
 * from the Case File tokens).
 */
export const clusterLayer: CircleLayerSpecification = {
  id: CLUSTER_LAYER_ID,
  type: 'circle',
  source: CANVASS_SOURCE_ID,
  filter: ['has', 'point_count'],
  paint: {
    'circle-color': '#1a2d44',
    'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 25, 28],
    'circle-stroke-width': 2,
    'circle-stroke-color': '#99badd',
  },
}

export const clusterCountLayer: SymbolLayerSpecification = {
  id: CLUSTER_COUNT_LAYER_ID,
  type: 'symbol',
  source: CANVASS_SOURCE_ID,
  filter: ['has', 'point_count'],
  layout: {
    'text-field': ['get', 'point_count_abbreviated'],
    // Mapbox-hosted font stack — served by the style's glyphs endpoint
    // for both Standard-family and classic styles.
    'text-font': ['DIN Pro Medium', 'Arial Unicode MS Bold'],
    'text-size': 13,
  },
  paint: {
    'text-color': '#f0f4f8',
  },
}

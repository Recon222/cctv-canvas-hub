import { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import mapboxgl from 'mapbox-gl'
import { Source, Layer, useMap } from 'react-map-gl/mapbox'
import type { GeoJSONSource, MapMouseEvent } from 'mapbox-gl'
import { useCanvassStore, ATTENTION_TTL_MS } from '../store/canvass-store'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useNow } from '../hooks/useNow'
import {
  locationsToGeoJson,
  incidentFeature,
  clusterLayer,
  clusterCountLayer,
  CANVASS_SOURCE_ID,
  CLUSTER_LAYER_ID,
  CLUSTER_MAX_ZOOM,
  CLUSTER_RADIUS,
} from '../services/mapData'
import {
  createLocationMarker,
  updateLocationMarker,
  createIncidentMarker,
  type LocationMarkerState,
} from './map/markers'

/**
 * Markers + clustering (Phase 3.3B). Two rendering paths, reconciled:
 *
 * - The clustered GeoJSON source + the two GL layers render CLUSTER
 *   BUBBLES only (Mapbox built-in clustering — AD4, no supercluster).
 * - Every individual location renders as an HTML marker from the poured
 *   factories (`new mapboxgl.Marker({ element, anchor: 'center' })` —
 *   the design needs per-marker DOM: status dots, label pills, ping
 *   rings, the selection scale).
 * - Reconciliation: on moveend/zoom/source updates, the currently
 *   UNCLUSTERED point ids are read back via `querySourceFeatures`, and
 *   HTML markers whose point got absorbed into a cluster are hidden
 *   (visibility on the root — allowed; the binding rule only forbids
 *   position/transform/transition there, see MARKER-BINDING-FIX).
 *
 * Markers are created once per location and kept in sync via
 * `updateLocationMarker` (the update-don't-rebuild contract) — never
 * rebuilt on state change. Marker click ⇒ `selectLocation`; the
 * fly-to/scroll sync is useFlyTo's job (one owner, 3.3C).
 *
 * ponytail: the 1 s `useNow` tick re-sends source data and re-syncs
 * marker elements every second so attention pings expire on time —
 * trivial at canvass scale (tens of points); switch to a store-driven
 * expiry sweep if a case ever carries hundreds.
 */

interface MarkerRecord {
  marker: mapboxgl.Marker
  root: HTMLElement
}

/** Show HTML markers only for points the source reports as unclustered. */
function reconcileClusterVisibility(
  map: mapboxgl.Map,
  markers: Map<string, MarkerRecord>
): void {
  if (map.getSource(CANVASS_SOURCE_ID) === undefined) {
    return
  }
  const features = map.querySourceFeatures(CANVASS_SOURCE_ID)
  if (features.length === 0) {
    // Tiles not loaded yet (or everything offscreen) — leave as-is.
    return
  }
  const unclustered = new Set<string>()
  for (const feature of features) {
    const id = (feature.properties as { id?: unknown } | null)?.id
    if (typeof id === 'string') {
      unclustered.add(id)
    }
  }
  for (const [id, record] of markers) {
    record.root.style.visibility = unclustered.has(id) ? '' : 'hidden'
  }
}

export function MarkerLayer() {
  const { t } = useTranslation()
  const { current: map } = useMap()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const selectedLocationId = useCanvassStore(state => state.selectedLocationId)
  const attentionByLocation = useCanvassStore(
    state => state.attentionByLocation
  )
  const now = useNow(1_000)
  const { data: cases } = useCases()
  const { data: locations } = useCaseLocations(selectedCaseId)
  const markersRef = useRef(new Map<string, MarkerRecord>())
  const incidentRef = useRef<mapboxgl.Marker | null>(null)

  const selectedCase = cases?.find(c => c.id === selectedCaseId) ?? null
  const geojson = locationsToGeoJson(locations ?? [], attentionByLocation, now)

  // Location marker sync: create once, update in place, remove the gone.
  useEffect(() => {
    if (map === undefined) {
      return
    }
    const mapbox = map.getMap()
    const markers = markersRef.current
    const seen = new Set<string>()
    for (const location of locations ?? []) {
      if (location.coord === null) {
        continue
      }
      seen.add(location.id)
      const stampedAt = attentionByLocation[location.id]
      const state: LocationMarkerState = {
        status: location.status,
        label: location.name,
        selected: selectedLocationId === location.id,
        attention:
          stampedAt !== undefined && now - stampedAt < ATTENTION_TTL_MS,
      }
      const existing = markers.get(location.id)
      if (existing !== undefined) {
        updateLocationMarker(existing.root, state)
        existing.marker.setLngLat([location.coord.lng, location.coord.lat])
      } else {
        const locationId = location.id
        const root = createLocationMarker(state, () => {
          useCanvassStore.getState().selectLocation(locationId)
        })
        const marker = new mapboxgl.Marker({ element: root, anchor: 'center' })
          .setLngLat([location.coord.lng, location.coord.lat])
          .addTo(mapbox)
        markers.set(location.id, { marker, root })
      }
    }
    for (const [id, record] of markers) {
      if (!seen.has(id)) {
        record.marker.remove()
        markers.delete(id)
      }
    }
    reconcileClusterVisibility(mapbox, markers)
  }, [map, locations, selectedLocationId, attentionByLocation, now])

  // Cluster-membership reconciliation on map/source movement.
  useEffect(() => {
    if (map === undefined) {
      return
    }
    const mapbox = map.getMap()
    const sync = () => {
      reconcileClusterVisibility(mapbox, markersRef.current)
    }
    mapbox.on('moveend', sync)
    mapbox.on('zoomend', sync)
    mapbox.on('sourcedata', sync)
    mapbox.on('idle', sync)
    return () => {
      mapbox.off('moveend', sync)
      mapbox.off('zoomend', sync)
      mapbox.off('sourcedata', sync)
      mapbox.off('idle', sync)
    }
  }, [map])

  // Incident marker: red crosshair + pulsing halo + label pill (factory).
  const incident = selectedCase === null ? null : incidentFeature(selectedCase)
  const incidentLng = incident?.geometry.coordinates[0]
  const incidentLat = incident?.geometry.coordinates[1]
  const incidentName = incident?.properties.name
  useEffect(() => {
    if (map === undefined) {
      return
    }
    incidentRef.current?.remove()
    incidentRef.current = null
    if (incidentLng === undefined || incidentLat === undefined) {
      return
    }
    const root = createIncidentMarker(
      t('canvass.map.incidentLabel', { name: incidentName ?? '' })
    )
    incidentRef.current = new mapboxgl.Marker({
      element: root,
      anchor: 'center',
    })
      .setLngLat([incidentLng, incidentLat])
      .addTo(map.getMap())
  }, [map, incidentLng, incidentLat, incidentName, t])

  // Cluster interactions: click expands, cursor signals clickability.
  useEffect(() => {
    if (map === undefined) {
      return
    }
    const mapbox = map.getMap()
    const onClusterClick = (event: MapMouseEvent) => {
      const feature = event.features?.[0]
      const clusterId = (feature?.properties as { cluster_id?: number } | null)
        ?.cluster_id
      const source = mapbox.getSource<GeoJSONSource>(CANVASS_SOURCE_ID)
      if (clusterId === undefined || source === undefined) {
        return
      }
      source.getClusterExpansionZoom(clusterId, (error, zoom) => {
        if (error != null || zoom == null || feature === undefined) {
          return
        }
        const geometry = feature.geometry as {
          type: string
          coordinates: [number, number]
        }
        mapbox.easeTo({ center: geometry.coordinates, zoom })
      })
    }
    const onEnter = () => {
      mapbox.getCanvas().style.cursor = 'pointer'
    }
    const onLeave = () => {
      mapbox.getCanvas().style.cursor = ''
    }
    mapbox.on('click', CLUSTER_LAYER_ID, onClusterClick)
    mapbox.on('mouseenter', CLUSTER_LAYER_ID, onEnter)
    mapbox.on('mouseleave', CLUSTER_LAYER_ID, onLeave)
    return () => {
      mapbox.off('click', CLUSTER_LAYER_ID, onClusterClick)
      mapbox.off('mouseenter', CLUSTER_LAYER_ID, onEnter)
      mapbox.off('mouseleave', CLUSTER_LAYER_ID, onLeave)
    }
  }, [map])

  // Unmount: the markers die with the layer (the map itself persists —
  // 3.2D — but a signed-out board must not leave marker DOM behind).
  useEffect(() => {
    const markers = markersRef.current
    return () => {
      for (const record of markers.values()) {
        record.marker.remove()
      }
      markers.clear()
      incidentRef.current?.remove()
      incidentRef.current = null
    }
  }, [])

  return (
    <Source
      id={CANVASS_SOURCE_ID}
      type="geojson"
      data={geojson}
      cluster
      clusterMaxZoom={CLUSTER_MAX_ZOOM}
      clusterRadius={CLUSTER_RADIUS}
    >
      <Layer {...clusterLayer} />
      <Layer {...clusterCountLayer} />
    </Source>
  )
}

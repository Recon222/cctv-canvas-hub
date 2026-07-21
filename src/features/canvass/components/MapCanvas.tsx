import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import Map, { type MapRef } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { usePreferences } from '@/features/preferences'
import { logger } from '@/lib/logger'
import { useCanvassStore } from '../store/canvass-store'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useFlyTo, cameraPadding } from '../hooks/useFlyTo'
import { MapTokenGate } from './map/MapTokenGate'
import { MapLegend } from './map/MapLegend'
import { MapZoomControls } from './map/MapZoomControls'

/**
 * The Mapbox canvas (Phase 3.2B). Mounted ONCE for the life of the
 * board by CanvassRoot (3.2D — hoisted above the view switch, hidden by
 * visibility when `view ≠ 'map'`), so the WebGL context and tile cache
 * survive view flips. Token absent is a designed state (MapTokenGate),
 * never an error; token rejected overlays the gate's toast posture.
 *
 * A2 bindings: satellite is the default style; Standard-family styles
 * get `setConfigProperty('basemap','lightPreset','night')` on every
 * style load (the preset does not survive a setStyle).
 */

/** Style ids the Preferences select offers (A2 pin). Any other stored
 * string is passed through as-is — forward-tolerant. */
const MAP_STYLE_URLS: Record<string, string> = {
  'standard-satellite': 'mapbox://styles/mapbox/standard-satellite',
  standard: 'mapbox://styles/mapbox/standard',
  'dark-v11': 'mapbox://styles/mapbox/dark-v11',
}
const DEFAULT_MAP_STYLE = 'standard-satellite'
/** Street-level framing when jumping to a case's incident. */
const INCIDENT_ZOOM = 15

export function MapCanvas() {
  const { t } = useTranslation()
  const mapRef = useRef<MapRef>(null)
  const { data: preferences, isPending } = usePreferences()
  const view = useCanvassStore(state => state.view)
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const { data: cases } = useCases()
  const { data: locations } = useCaseLocations(selectedCaseId)
  // Rejection is keyed by the token that was rejected: a fresh token in
  // Preferences clears the gate by derivation (no reset effect), and the
  // toast fires once per rejected token.
  const [rejectedToken, setRejectedToken] = useState<string | null>(null)
  const rejectionToastFor = useRef<string | null>(null)
  useFlyTo(mapRef)

  const selectedCase = cases?.find(c => c.id === selectedCaseId) ?? null
  const incidentLat = selectedCase?.incidentCoord?.lat
  const incidentLng = selectedCase?.incidentCoord?.lng

  const rawToken = preferences?.mapbox_token
  const token =
    rawToken == null || rawToken.trim() === '' ? null : rawToken.trim()
  const styleId = preferences?.map_style ?? DEFAULT_MAP_STYLE
  const styleIdRef = useRef(styleId)
  useEffect(() => {
    styleIdRef.current = styleId
  }, [styleId])

  const tokenRejected = rejectedToken !== null && rejectedToken === token

  // Viewport from the incident coord (plan 3.2B). Keyed on the case id
  // and the coordinate VALUES — a reconcile refetch returns equal
  // coords and must not yank the coordinator's pan every 60 s.
  const caseKey = selectedCase?.id ?? null
  useEffect(() => {
    if (caseKey !== null && incidentLat !== undefined) {
      mapRef.current?.jumpTo({
        center: [incidentLng ?? 0, incidentLat],
        zoom: INCIDENT_ZOOM,
      })
    }
  }, [caseKey, incidentLat, incidentLng])

  // 3.2D resize triggers, exhaustive: switch to the map view + window
  // resize. (mapbox's own trackResize observes the container too — the
  // explicit calls make the plan's trigger set unconditional.)
  useEffect(() => {
    if (view === 'map') {
      mapRef.current?.resize()
    }
  }, [view])
  useEffect(() => {
    const onWindowResize = () => mapRef.current?.resize()
    window.addEventListener('resize', onWindowResize)
    return () => {
      window.removeEventListener('resize', onWindowResize)
    }
  }, [])

  const handleMapLoad = () => {
    const map = mapRef.current?.getMap()
    if (map === undefined) {
      return
    }
    const applyNightPreset = () => {
      // Standard-family styles only — classic styles (dark-v11) have no
      // basemap config and would log an error.
      if (styleIdRef.current.startsWith('standard')) {
        map.setConfigProperty('basemap', 'lightPreset', 'night')
      }
    }
    applyNightPreset()
    // A later style switch (Preferences) reloads the style and drops the
    // config — reapply on every style load.
    map.on('style.load', applyNightPreset)
  }

  const handleMapError = (event: { error?: { message?: string } }) => {
    const status = (event.error as { status?: number } | undefined)?.status
    if (status === 401 || status === 403) {
      // Bad token: the gate's toast posture + one sonner toast (3.2B).
      setRejectedToken(token)
      if (rejectionToastFor.current !== token) {
        rejectionToastFor.current = token
        toast.error(t('canvass.map.tokenRejected'))
      }
      return
    }
    // Other load errors (offline tiles, transient fetch failures):
    // mapbox retries on its own; the board's card list keeps working.
    logger.error('map: load error', { message: event.error?.message })
  }

  const handleFitAll = () => {
    const coords = (locations ?? []).map(l => l.coord).filter(c => c !== null)
    if (selectedCase?.incidentCoord) {
      coords.push(selectedCase.incidentCoord)
    }
    if (coords.length === 0) {
      return
    }
    let minLng = Infinity
    let minLat = Infinity
    let maxLng = -Infinity
    let maxLat = -Infinity
    for (const c of coords) {
      minLng = Math.min(minLng, c.lng)
      minLat = Math.min(minLat, c.lat)
      maxLng = Math.max(maxLng, c.lng)
      maxLat = Math.max(maxLat, c.lat)
    }
    mapRef.current?.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      { padding: cameraPadding(), maxZoom: 16.5 }
    )
  }

  if (isPending) {
    // Preferences still loading — calm ground, never a flash of the gate.
    return <div className="hub-grid-paper h-full" />
  }
  if (token === null) {
    return (
      <div className="relative h-full">
        <MapTokenGate variant="missing" />
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <Map
        ref={mapRef}
        mapboxAccessToken={token}
        mapStyle={MAP_STYLE_URLS[styleId] ?? styleId}
        initialViewState={
          // First mount happens at board mount, usually before any case
          // is selected — the incident-jump effect owns the real camera.
          incidentLat !== undefined
            ? {
                longitude: incidentLng ?? 0,
                latitude: incidentLat,
                zoom: INCIDENT_ZOOM,
              }
            : { longitude: 0, latitude: 30, zoom: 1.5 }
        }
        style={{ width: '100%', height: '100%' }}
        onLoad={handleMapLoad}
        onError={handleMapError}
        attributionControl={false}
      />
      <MapLegend />
      <MapZoomControls
        onZoomIn={() => mapRef.current?.zoomIn()}
        onZoomOut={() => mapRef.current?.zoomOut()}
        onFitAll={handleFitAll}
      />
      {tokenRejected && <MapTokenGate variant="rejected" />}
    </div>
  )
}

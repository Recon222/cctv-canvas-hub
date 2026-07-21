import { useEffect, type RefObject } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { MapRef } from 'react-map-gl/mapbox'
import { LOCATIONS_KEY } from '@/store/health-store'
import { useCanvassStore } from '../store/canvass-store'
import type { CanvassLocation } from '../types'

/**
 * The two-way selection sync, one owner (Phase 3.3C, spec §4): whatever
 * set `selectedLocationId` — card click or marker click — this hook
 * flies the map to the location's coord (padded clear of the floating
 * stack and rail) AND scrolls its card into view. Neither surface calls
 * map methods itself; a card click's scrollIntoView on an
 * already-visible card is a no-op by `block: 'nearest'`.
 *
 * Locations are read from the query cache at selection time (no extra
 * observer): by the time anything is selectable, the stack/markers have
 * the list mounted.
 */
export function useFlyTo(mapRef: RefObject<MapRef | null>): void {
  const queryClient = useQueryClient()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const selectedLocationId = useCanvassStore(state => state.selectedLocationId)

  useEffect(() => {
    if (selectedLocationId === null) {
      return
    }
    const locations = queryClient.getQueryData<CanvassLocation[]>([
      LOCATIONS_KEY,
      selectedCaseId,
    ])
    const location = locations?.find(l => l.id === selectedLocationId)
    if (location?.coord != null) {
      mapRef.current?.flyTo({
        center: [location.coord.lng, location.coord.lat],
        padding: cameraPadding(),
      })
    }
    // A no-fix location still gets its card focused (it has no marker).
    document
      .querySelector(`[data-location-id="${CSS.escape(selectedLocationId)}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [selectedLocationId, selectedCaseId, queryClient, mapRef])
}

/**
 * Camera padding that keeps the target clear of the floating card stack
 * (inline-end) and the NavRail (inline-start). Physical sides on
 * purpose — the map is screen-space — flipped for RTL, and scaled with
 * the AD15 chrome scale (the stack is 408 design-px wide × the shell
 * scale). ponytail: constants eyeballed from the 1920 design canvas;
 * the AD15 live check tunes them.
 */
export function cameraPadding() {
  const scale = window.innerWidth / 1920
  const rtl = document.documentElement.dir === 'rtl'
  const stackSide = Math.round(470 * scale)
  const railSide = Math.round(140 * scale)
  return {
    top: 96,
    bottom: 96,
    left: rtl ? stackSide : railSide,
    right: rtl ? railSide : stackSide,
  }
}

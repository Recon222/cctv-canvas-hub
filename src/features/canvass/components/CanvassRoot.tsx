import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { MapProvider, useMap } from 'react-map-gl/mapbox'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import {
  isCaseDataKey,
  lastConfirmAt,
  resetHealthStore,
  useHealthStore,
} from '@/store/health-store'
import { cn } from '@/lib/utils'
import { useUIStore } from '@/store/ui-store'
import {
  APP_REQUIRED_SCHEMA_VERSION,
  ConnectionIndicator,
  ConnectionBanner,
} from '@/features/cloud-session'
import { ProcessPanel, usePanelPosture } from '@/features/process-panel'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { resetViewWindows } from '../services/viewWindows'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { useViewWindowBridge } from '../hooks/useViewWindowBridge'
import { useCases } from '../hooks/useCases'
import { useCaseLocations } from '../hooks/useCaseLocations'
import { useMediaPolling } from '../hooks/useMediaPolling'
import { cameraPadding } from '../hooks/useFlyTo'
import { NavRail } from './NavRail'
import { CasesView } from './CasesView'
import { CaseDashboard } from './CaseDashboard'
import { LocationCardStack } from './LocationCardStack'
import { PanelActivityLane } from './PanelActivityLane'
import { MapCanvas, CANVASS_MAP_ID } from './MapCanvas'
import { MapLegend } from './map/MapLegend'
import { MapZoomControls } from './map/MapZoomControls'
import { BoardHeader, CaseHeading, LiveClock } from './chrome/BoardHeader'
import { MonitorToggle } from './chrome/MonitorToggle'
import './canvass.css'

/**
 * The live board (Phase 2.4B): NavRail + the active A1 view. Mounted by
 * MainWindowContent only while the session is active/locked — so the
 * realtime subscription lives and dies with the session (D12), and a
 * locked board keeps flowing unchanged (doc 01 §5.4).
 *
 * 3.2D — the map div persists: `MapCanvas` is hoisted ABOVE the view
 * switch, mounted once for the life of the board and hidden with
 * `visibility: hidden` when `view ≠ 'map'` (the container keeps real
 * dimensions; `display: none` would make a later `map.resize()` measure
 * 0×0 and collapse the canvas).
 *
 * 3.2E — AD15 scale-to-fit: the 1920-wide design canvas scales by
 * `boardWidth / 1920` on the CHROME children only; the hoisted map div
 * is their sibling, outside every transformed ancestor (Mapbox GL under
 * a CSS transform has pointer-math and tile-crispness pitfalls). Chrome
 * height is compensated (`height / scale`) so the scaled canvas still
 * fills the window on non-16:9 displays. The whole-shell fallback stays
 * one switch away (AD15_MODE) — the M3 live check owns the final call.
 */

/** AD15 mechanics switch: 'chrome-scaled' (as-built default) or the
 * 'whole-shell' fallback (everything, map included, under one scaled
 * wrapper) — flip only from the live check's verdict. */
const AD15_MODE: 'chrome-scaled' | 'whole-shell' = 'chrome-scaled'
/** The design canvas width (design_handoff: 1920×1080, origin 0 0). */
const DESIGN_WIDTH = 1920

export function CanvassRoot() {
  const { t } = useTranslation()
  const view = useCanvassStore(state => state.view)
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const queryClient = useQueryClient()
  useCaseRealtime(selectedCaseId)
  // Flow D: the 20 s media freshness poll rides the board lifecycle —
  // the hook itself gates on session (active/locked) + health (canPoll).
  useMediaPolling(selectedCaseId)
  useConnectionHealth()
  // M7 (7.3B): answer secondary-ready with the view-context half of the
  // handshake + clear the rail's popped flag when a pop-out closes.
  useViewWindowBridge()
  // 6.3C posture: view-derived default (open everywhere, SYS tab on
  // map) applies on FIRST entry per view; user toggles win thereafter.
  usePanelPosture(view, view !== 'map')
  // Module-scoped state outlives sign-out; unmount IS the session exit
  // (active/locked → anything else), so reset EVERYTHING session-scoped
  // here: the canvass store (selection/view/activity), the health marks
  // (operator B's `live` must come from their own confirmations, not
  // operator A's — and a dead-socket 'subscribed' carcass would skip
  // the resubscribe catch-up), and the case-data query cache (a cached
  // list inside staleTime would suppress the sign-in refetch)
  // (fix-delta review MEDIUM: only the canvass store reset here).
  useEffect(() => {
    return () => {
      resetCanvassStore()
      resetHealthStore()
      // PR #10 M1: the pop-out registry is per-session module state too
      // — left stale, a re-sign-in reopen would focus a dead window and
      // could seed operator A's case into operator B's handshake.
      resetViewWindows()
      queryClient.removeQueries({
        predicate: query => isCaseDataKey(query.queryKey[0]),
      })
    }
  }, [queryClient])

  // Attention TTL sweep (doc 01 §5.4): stamps expire ON THE STORE, so
  // presence ≡ fresh for every consumer — the stack's attention-first
  // sort (#76), the card flash, the marker ping — without each surface
  // running its own clock.
  useEffect(() => {
    const id = setInterval(() => {
      useCanvassStore.getState().clearExpiredAttention()
    }, 1_000)
    return () => {
      clearInterval(id)
    }
  }, [])

  // Board size drives the AD15 scale. jsdom has no ResizeObserver — the
  // guard leaves tests (and any exotic webview) at scale 1.
  const rootRef = useRef<HTMLDivElement>(null)
  const [boardSize, setBoardSize] = useState<{
    width: number
    height: number
  } | null>(null)
  useEffect(() => {
    const node = rootRef.current
    if (node === null || typeof ResizeObserver === 'undefined') {
      return
    }
    const measure = () => {
      setBoardSize({ width: node.clientWidth, height: node.clientHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => {
      observer.disconnect()
    }
  }, [])

  const scale =
    boardSize === null || boardSize.width === 0
      ? 1
      : boardSize.width / DESIGN_WIDTH
  const scaleStyle =
    boardSize === null
      ? undefined
      : {
          width: DESIGN_WIDTH,
          height: boardSize.height / scale,
          transform: `scale(${String(scale)})`,
          // Physical corner on purpose: with width scaled to exactly fit,
          // origin left/right is equivalent — and transforms are physical.
          transformOrigin: '0 0',
        }

  // H1: MapCanvas reports a terminal style-load failure up here — the
  // chrome-side furniture must not render live-looking instruments over
  // a dead map (the two live in sibling layers; this is their parent).
  const [mapStyleFailed, setMapStyleFailed] = useState(false)

  // 3.2D: laid-out-but-invisible off the map view — NEVER display:none.
  const mapLayer = (
    <div
      className="absolute inset-0"
      style={{ visibility: view === 'map' ? 'visible' : 'hidden' }}
    >
      <MapCanvas onStyleFailedChange={setMapStyleFailed} />
    </div>
  )

  // On the map view the chrome is a transparent overlay: the wrapper
  // drops pointer events so the map underneath pans/zooms; interactive
  // chrome (rail, floating stack) re-enables its own.
  const chromeLayer = (
    <div
      className={cn(
        'absolute top-0 left-0 flex h-full w-full',
        view === 'map' && 'pointer-events-none'
      )}
      style={AD15_MODE === 'chrome-scaled' ? scaleStyle : undefined}
    >
      <div className={cn(view === 'map' && 'pointer-events-auto')}>
        <NavRail />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header chrome is opaque and always present (design §1) — it
            re-enables pointer events on the map view so clicks never
            fall through it into the map. */}
        <div className={cn(view === 'map' && 'pointer-events-auto')}>
          <HeaderChrome />
        </div>
        <main className="relative min-w-0 flex-1 overflow-hidden">
          {view === 'cases' && <CasesView />}
          {/* AD12: the case view IS the dashboard (5.3A) — the stack
              remains the MAP view's floating overlay below. */}
          {view === 'case' && <CaseDashboard />}
          {view === 'map' && (
            <>
              {!mapStyleFailed && <MapFurniture />}
              {/* 3.4A: the floating stack over the map — clear of every
                  edge, transparent column (never a full-height rail, spec
                  §4). It overlays the unscaled map from inside the scaled
                  chrome. */}
              <div className="pointer-events-auto absolute inset-y-4 end-4 w-[408px]">
                <LocationCardStack floating />
              </div>
            </>
          )}
          {/* 6.3C: the ProcessPanel in the right-edge chrome position —
              an OVERLAY inside the board tree (absolute in this
              relative main): expanding on the map view floats over the
              card stack; map and stack never reflow (AD14). ACTIVITY
              lane content is host-composed (activitySlot — the panel
              imports nothing from canvass); the version/schema chips
              are host-supplied strings for the same reason. */}
          <div className={cn(view === 'map' && 'pointer-events-auto')}>
            <ProcessPanel
              activitySlot={<PanelActivityLane />}
              footerMeta={[
                t('canvass.panel.versionChip', { version: __APP_VERSION__ }),
                t('canvass.panel.schemaChip', {
                  version: APP_REQUIRED_SCHEMA_VERSION,
                }),
              ]}
            />
          </div>
        </main>
      </div>
    </div>
  )

  if (AD15_MODE === 'whole-shell') {
    // Fallback mechanics: one scaled wrapper around everything, map
    // included (the simpler option if the live check shows no pointer or
    // crispness issues on the target display).
    return (
      <MapProvider>
        <div
          ref={rootRef}
          className="relative h-full overflow-hidden bg-hub-ground font-inter text-hub-body"
        >
          <div
            className="absolute top-0 left-0 h-full w-full"
            style={scaleStyle}
          >
            {mapLayer}
            {chromeLayer}
          </div>
        </div>
      </MapProvider>
    )
  }

  return (
    // MapProvider: the chrome-side furniture reaches the map (which
    // lives in the sibling unscaled layer) via useMap()[CANVASS_MAP_ID].
    <MapProvider>
      <div
        ref={rootRef}
        className="relative h-full overflow-hidden bg-hub-ground font-inter text-hub-body"
      >
        {mapLayer}
        {chromeLayer}
      </div>
    </MapProvider>
  )
}

/**
 * Header chrome (Phase 5.2, design §1 — D15): the poured BoardHeader
 * hosting CaseHeading, the connection chip, and the live clock, with
 * the escalation banner mounted UNCONDITIONALLY beneath (it self-nulls
 * unless stale/offline). This is the surface D15 demanded: the health
 * machine has computed degradation since M2 and rendered it nowhere.
 *
 * `lastConfirm` is the §5.4 A2 binding — max(lastEventAt, lastFetchOkAt)
 * via the store's `lastConfirmAt`, never `lastEventAt` alone (a silent
 * overnight board confirms through reconciles only).
 *
 * MonitorToggle mounts here as of 6.3C (deferred from M5 so it never
 * shipped as a dead affordance): its active state mirrors the panel's
 * expanded boolean — the same `rightSidebarVisible` the Cmd/Ctrl+2
 * shortcut and both palette commands drive.
 */
function HeaderChrome() {
  const { t } = useTranslation()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const healthState = useHealthStore(state => state.state)
  const lastConfirm = useHealthStore(state => lastConfirmAt(state.marks))
  const panelExpanded = useUIStore(state => state.rightSidebarVisible)
  const { data: cases } = useCases()
  const selectedCase = cases?.find(c => c.id === selectedCaseId) ?? null

  return (
    <>
      <BoardHeader>
        {selectedCase === null ? (
          <CaseHeading
            tag={t('canvass.header.appTag')}
            title={t('canvass.header.commandCentre')}
          />
        ) : (
          <CaseHeading
            tag={selectedCase.caseNumber}
            title={
              selectedCase.displayName ?? selectedCase.incidentBusinessName
            }
          />
        )}
        <ConnectionIndicator state={healthState} lastConfirm={lastConfirm} />
        <MonitorToggle
          active={panelExpanded}
          onToggle={() => {
            useUIStore.getState().toggleRightSidebar()
          }}
        />
        <LiveClock />
      </BoardHeader>
      <ConnectionBanner state={healthState} lastConfirm={lastConfirm} />
    </>
  )
}

/**
 * Map furniture (legend + zoom instruments) — CHROME, not map layer
 * (M3 live-smoke finding): in the unscaled full-window map layer the
 * furniture sat in the exact inline-start band the scaled opaque
 * NavRail paints over (rail visual width = 86 × scale while the
 * furniture was unscaled — no static offset can track that), leaving it
 * obscured and click-dead. Hosted here in the chrome layer's <main> it
 * is laid out AFTER the rail in the flex row (the rail can never cover
 * it) and scales with the shell like the rest of the design.
 */
function MapFurniture() {
  const maps = useMap()
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const { data: cases } = useCases()
  const { data: locations } = useCaseLocations(selectedCaseId)
  const map = maps[CANVASS_MAP_ID]

  if (map === undefined) {
    // Token gate showing (no Map mounted) — no instruments to offer.
    return null
  }

  const handleFitAll = () => {
    const selectedCase = cases?.find(c => c.id === selectedCaseId) ?? null
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
    map.fitBounds(
      [
        [minLng, minLat],
        [maxLng, maxLat],
      ],
      // L3 fix: padding scale from the map's own container (matches the
      // chrome scale source; correct in any hosting).
      { padding: cameraPadding(map.getContainer().clientWidth), maxZoom: 16.5 }
    )
  }

  return (
    // The chrome wrapper is pointer-events-none on the map view — the
    // instruments re-enable their own subtree.
    <div className="pointer-events-auto">
      <MapLegend />
      <MapZoomControls
        onZoomIn={() => map.zoomIn()}
        onZoomOut={() => map.zoomOut()}
        onFitAll={handleFitAll}
      />
    </div>
  )
}

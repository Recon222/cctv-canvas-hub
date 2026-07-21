import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useConnectionHealth } from '@/hooks/useConnectionHealth'
import { isCaseDataKey, resetHealthStore } from '@/store/health-store'
import { cn } from '@/lib/utils'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import { useCaseRealtime } from '../hooks/useCaseRealtime'
import { NavRail } from './NavRail'
import { CasesView } from './CasesView'
import { LocationCardStack } from './LocationCardStack'
import { MapCanvas } from './MapCanvas'
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
  const view = useCanvassStore(state => state.view)
  const selectedCaseId = useCanvassStore(state => state.selectedCaseId)
  const queryClient = useQueryClient()
  useCaseRealtime(selectedCaseId)
  useConnectionHealth()
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
      queryClient.removeQueries({
        predicate: query => isCaseDataKey(query.queryKey[0]),
      })
    }
  }, [queryClient])

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

  // 3.2D: laid-out-but-invisible off the map view — NEVER display:none.
  const mapLayer = (
    <div
      className="absolute inset-0"
      style={{ visibility: view === 'map' ? 'visible' : 'hidden' }}
    >
      <MapCanvas />
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
      <main className="relative min-w-0 flex-1 overflow-hidden">
        {view === 'cases' && <CasesView />}
        {view === 'case' && <LocationCardStack />}
      </main>
    </div>
  )

  if (AD15_MODE === 'whole-shell') {
    // Fallback mechanics: one scaled wrapper around everything, map
    // included (the simpler option if the live check shows no pointer or
    // crispness issues on the target display).
    return (
      <div
        ref={rootRef}
        className="relative h-full overflow-hidden bg-hub-ground font-inter text-hub-body"
      >
        <div className="absolute top-0 left-0 h-full w-full" style={scaleStyle}>
          {mapLayer}
          {chromeLayer}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={rootRef}
      className="relative h-full overflow-hidden bg-hub-ground font-inter text-hub-body"
    >
      {mapLayer}
      {chromeLayer}
    </div>
  )
}

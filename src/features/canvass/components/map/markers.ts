import type { CanvassLocation } from '../../types'

/**
 * Marker element factories (design_handoff §4). Agents attach these via
 * `new mapboxgl.Marker({ element, anchor: 'center' })` (MarkerLayer,
 * Phase 3.3B). Visual classes live in ../canvass.css.
 *
 * ⚠ BINDING RULE (MARKER-BINDING-FIX, hard-won): the ROOT element
 * returned here must never carry `position`, `transform`, or
 * `transition` — Mapbox owns those per frame; any of them on the root
 * makes markers swim on pan or slide against the ground on zoom. Every
 * visual effect (scale, ping, halo) lives on CHILD elements only.
 */

export interface LocationMarkerState {
  status: CanvassLocation['status']
  /** Short label under the dot (uppercased business name). */
  label: string
  selected: boolean
  /** Within ATTENTION_TTL_MS of the last update ⇒ gold ping ring. */
  attention: boolean
}

const STATUS_MARKER_VARS: Record<
  CanvassLocation['status'],
  { color: string; glow: string }
> = {
  started: { color: 'var(--hub-started)', glow: 'rgb(43 140 193 / 70%)' },
  working: { color: 'var(--hub-working)', glow: 'rgb(255 217 61 / 60%)' },
  complete: { color: 'var(--hub-complete)', glow: 'rgb(78 205 196 / 60%)' },
}

/** COMPLETE dots carry a check glyph (status trio language). */
const COMPLETE_GLYPH = '✓'

/** Create the element once per location; keep it updated via
 * `updateLocationMarker` — never rebuild on state change (selection and
 * attention flip often; rebuilding drops the marker mid-animation). */
export function createLocationMarker(
  state: LocationMarkerState,
  onSelect: () => void
): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'hub-marker'
  const ping = document.createElement('div')
  ping.className = 'hub-marker-ping'
  const dot = document.createElement('div')
  dot.className = 'hub-marker-dot'
  const label = document.createElement('div')
  label.className = 'hub-marker-label'
  root.append(ping, dot, label)
  root.addEventListener('click', event => {
    event.stopPropagation()
    onSelect()
  })
  updateLocationMarker(root, state)
  return root
}

/** Sync an existing marker element to new state (idempotent). */
export function updateLocationMarker(
  root: HTMLElement,
  state: LocationMarkerState
): void {
  const vars =
    state.status in STATUS_MARKER_VARS
      ? STATUS_MARKER_VARS[state.status]
      : // Unmodeled wire status: render in the accent color, never vanish
        // (the stack's drift posture, applied to the map).
        { color: 'var(--hub-accent)', glow: 'rgb(153 186 221 / 60%)' }
  root.dataset.status = state.status
  root.style.setProperty('--marker-color', vars.color)
  root.style.setProperty('--marker-glow', vars.glow)
  if (state.selected) {
    root.dataset.selected = ''
  } else {
    delete root.dataset.selected
  }
  if (state.attention) {
    root.dataset.attention = ''
  } else {
    delete root.dataset.attention
  }
  const dot = root.querySelector('.hub-marker-dot')
  if (dot !== null) {
    dot.textContent = state.status === 'complete' ? COMPLETE_GLYPH : ''
  }
  const label = root.querySelector('.hub-marker-label')
  if (label !== null) {
    label.textContent = state.label
  }
}

/** The incident crosshair + pulsing halo + label pill (one per case). */
export function createIncidentMarker(labelText: string): HTMLDivElement {
  const root = document.createElement('div')
  root.className = 'hub-incident'
  const halo = document.createElement('div')
  halo.className = 'hub-incident-halo'
  const x = document.createElement('div')
  x.className = 'hub-incident-x'
  const core = document.createElement('div')
  core.className = 'hub-incident-core'
  x.append(core)
  const label = document.createElement('div')
  label.className = 'hub-incident-label'
  label.textContent = labelText
  root.append(halo, x, label)
  return root
}

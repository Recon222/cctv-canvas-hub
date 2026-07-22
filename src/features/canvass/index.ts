/**
 * Canvass Feature - Public API
 *
 * Outside code MUST import from this file, never from internal paths.
 */

export { CanvassRoot } from './components/CanvassRoot'
// The secondary-window host (M7, 7.3A) — mounted by window-main.tsx.
export { SecondaryRoot } from './components/SecondaryRoot'
// Board view/selection state — consumed by the palette's go-to-view
// commands (5.3B); M7 secondary windows reuse the same surface.
export { useCanvassStore, resetCanvassStore } from './store/canvass-store'
export type { CanvassView } from './store/canvass-store'

/**
 * Board timestamp formatting (doc 01 rule 6, pinned): every time carries
 * seconds; dates are always explicit `yyyy-mm-dd` — never "today",
 * never locale-elided. Shared by every canvass surface.
 */

const pad = (n: number): string => String(n).padStart(2, '0')

/** `yyyy-mm-dd HH:MM:SS`; returns the raw string when unparseable. */
export function formatBoardTimestamp(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return iso
  }
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** `HH:MM:SS` (same-day contexts: arrivals, feed rows, clock). */
export function formatClockTime(iso: string | number | Date): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) {
    return typeof iso === 'string' ? iso : ''
  }
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

import type { ActivityEntry, CanvassMedia } from '../types'

/**
 * Media attention (Phase 4.2A, G3): media rows ride no realtime event —
 * freshness is manufactured by the 20 s poll and this diff. Inputs are
 * already-mapped `CanvassMedia[]` (the 2.2A boundary filtered
 * soft-deleted), so a tombstoned row can never be "news".
 */

/** New rows by id — reorders and refetched object identities are not
 * additions; removals are not reported. */
export function diffMedia(
  prev: CanvassMedia[],
  next: CanvassMedia[]
): CanvassMedia[] {
  const known = new Set(prev.map(row => row.id))
  return next.filter(row => !known.has(row.id))
}

/** The `media-new` feed entry for a freshly arrived row. Pushing it
 * through `pushActivity` stamps attention on its location (Flow D2). */
export function mediaEntry(row: CanvassMedia): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    at: Date.now(),
    caseId: row.caseId,
    kind: 'media-new',
    locationId: row.locationId,
    summary: row.filename,
  }
}

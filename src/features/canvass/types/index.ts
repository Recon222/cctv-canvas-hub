/**
 * Canvass feature types — raw cloud rows (re-exported from the pinned
 * Database contract) and the clean view-models the mappers produce.
 * Raw rows never enter a query cache (trap §5.5.1); everything the UI
 * touches is a `Canvass*` view-model.
 */

export type {
  CaseRow,
  LocationRow,
  MediaRow,
  CaseMetadata,
  LocationFormData,
} from '@/lib/supabase/database-types'

import type {
  CaseRow,
  LocationRow,
  MediaRow,
  LocationFormData,
} from '@/lib/supabase/database-types'

export interface Coordinate {
  lat: number
  lng: number
}

export interface CanvassCase {
  id: string
  caseNumber: string
  displayName: string | null
  status: CaseRow['status']
  incidentBusinessName: string
  incidentAddress: string
  /** Null when unset or `(0,0)` — GPS no-fix (trap §5.5.2). */
  incidentCoord: Coordinate | null
  createdAt: string
  updatedAt: string
}

export interface CanvassLocation {
  id: string
  caseId: string
  userId: string
  name: string
  status: LocationRow['status']
  businessName: string
  address: string
  /** Null ⇒ card-only, no marker, counted in the "no fix" chip (§5.5.2). */
  coord: Coordinate | null
  /** `requester_name`, falling back to a shortened `user_id` (AD8). */
  investigator: string
  /** Latest `arrivalDateTime` across visits; null when never recorded. */
  arrivedAt: string | null
  /** DVR block, rendered plainly always — ordinary strings (owner directive). */
  dvr: NonNullable<LocationFormData['dvrInformation']> | null
  updatedAt: string
}

/**
 * Consumer-side media kind (PR #6 L2 hardening, adopted at PR #7 M1):
 * the RAW `MediaRow.type` stays an open `string` (forward-tolerance);
 * the mapper narrows to this union at the boundary. `'unknown'` is the
 * explicit drift bucket — such rows render as non-renderable-but-visible
 * fallback tiles (sign-on-demand open), never a silent never-sign.
 */
export type MediaKind = 'image' | 'video' | 'audio' | 'unknown'

export interface CanvassMedia {
  id: string
  caseId: string
  locationId: string
  type: MediaKind
  category: string | null
  filename: string
  mime: string
  bucket: MediaRow['storage_bucket']
  path: string
  createdAt: string
}

export type ActivityKind =
  | 'location-new'
  | 'location-status'
  | 'location-updated'
  | 'media-new'
  | 'case-updated'

/** In-memory attention feed entry (ring cap 200, AD7). */
export interface ActivityEntry {
  id: string
  /** Epoch millis. */
  at: number
  caseId: string
  kind: ActivityKind
  locationId?: string
  summary: string
}

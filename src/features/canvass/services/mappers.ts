import type {
  CanvassCase,
  CanvassLocation,
  CanvassMedia,
  CaseRow,
  Coordinate,
  LocationFormData,
  LocationRow,
  MediaKind,
  MediaRow,
} from '../types'
import { parseWkbPoint } from './geo'

/**
 * The mapper choke point (trap list §5.5): every cache boundary — fetch,
 * realtime patch, media — maps through these. Raw rows never enter a
 * query cache; soft-deleted rows never come out; malformed `form_data`
 * degrades to absent, never a throw.
 */

/** §5.5.1 — a SET `deleted_at` ⇒ row invisible, everywhere. Loose
 * `!= null` on purpose: a partial wire row WITHOUT the field carries no
 * tombstone marker and is alive (review LOW: strict `!== null` read
 * `undefined` as tombstoned). */
export function visibleRows<T extends { deleted_at: string | null }>(
  rows: T[]
): T[] {
  return rows.filter(row => row.deleted_at == null)
}

/** The wire can carry null despite the contract — treat as absent. */
function wireString(value: string | null | undefined): string {
  return value ?? ''
}

/** §5.5.4 — `requester_name`, falling back to a shortened `user_id` (AD8). */
export function investigatorLabel(row: LocationRow): string {
  const name = wireString(row.requester_name).trim()
  return name !== '' ? name : wireString(row.user_id).slice(0, 8)
}

/**
 * §5.5.3 — latest `arrivalDateTime` across all visits. ISO-8601 UTC
 * strings compare lexicographically; malformed shapes ⇒ null, no throw.
 */
export function latestArrival(fd: LocationFormData): string | null {
  const arrivals: unknown = fd.arrivalDepartures
  if (!Array.isArray(arrivals)) {
    return null
  }
  let latest: string | null = null
  for (const visit of arrivals as unknown[]) {
    if (typeof visit !== 'object' || visit === null) {
      continue
    }
    const at = (visit as { arrivalDateTime?: unknown }).arrivalDateTime
    if (
      typeof at === 'string' &&
      at !== '' &&
      (latest === null || at > latest)
    ) {
      latest = at
    }
  }
  return latest
}

/** `(0,0)` and half-null numeric pairs ⇒ no fix (§5.5.2). Out-of-range
 * values ⇒ null too, mirroring the WKB path (geo.ts) — a mis-keyed
 * manual incident coord must not become an off-planet marker in M3. */
function numericCoord(
  lat: number | null,
  lng: number | null
): Coordinate | null {
  if (lat === null || lng === null || (lat === 0 && lng === 0)) {
    return null
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null
  }
  return { lat, lng }
}

export function toCanvassCase(row: CaseRow): CanvassCase | null {
  if (row.deleted_at != null) {
    return null
  }
  return {
    id: row.id,
    caseNumber: row.case_number,
    displayName: row.display_name,
    status: row.status,
    incidentBusinessName: row.incident_business_name,
    incidentAddress: row.incident_address,
    incidentCoord: numericCoord(row.incident_latitude, row.incident_longitude),
    createdAt: row.created_at,
    // Guarded: the cases-list sort derefs this on every broadcast patch
    // (review LOW: a null updated_at threw inside the cache updater).
    updatedAt: wireString(row.updated_at),
  }
}

export function toCanvassLocation(row: LocationRow): CanvassLocation | null {
  if (row.deleted_at != null) {
    return null
  }
  // The row type is honest about nullability; degrade to empty.
  const fd: LocationFormData = row.form_data ?? {}
  return {
    id: row.id,
    caseId: row.case_id,
    userId: row.user_id,
    name: row.location_name,
    status: row.status,
    businessName: row.business_name,
    address: row.full_address,
    coord: parseWkbPoint(row.location),
    investigator: investigatorLabel(row),
    arrivedAt: latestArrival(fd),
    dvr: fd.dvrInformation ?? null,
    updatedAt: row.updated_at,
  }
}

/** PR #7 M1 — the wire's open `type` narrows to the MediaKind union
 * here, at the choke point; drift lands in the explicit bucket. */
function toMediaKind(value: string): MediaKind {
  return value === 'image' || value === 'video' || value === 'audio'
    ? value
    : 'unknown'
}

export function toCanvassMedia(row: MediaRow): CanvassMedia | null {
  if (row.deleted_at != null) {
    return null
  }
  return {
    id: row.id,
    caseId: row.case_id,
    locationId: row.location_id,
    type: toMediaKind(row.type),
    category: row.category,
    filename: row.filename,
    mime: row.mime_type,
    bucket: row.storage_bucket,
    path: row.storage_path,
    createdAt: row.created_at,
  }
}

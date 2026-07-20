/**
 * Hand-written minimal `Database` type for the agency cloud, pinned to
 * doc 01 §5.1 — the contract source of truth (provisioning SQL + live
 * verification). Deliberately NOT CLI-generated: `select('*')` + the
 * schema gate is the drift strategy (AD10), so the types must state what
 * the app understands, not whatever a project happens to serve.
 *
 * V1 is read-only (G5/T8): `Insert`/`Update` are `never`, so a cloud
 * write path cannot compile.
 */

export interface CaseMetadata {
  oicName?: string
  oicBadgeNumber?: string
  videoCoordinatorName?: string
  videoCoordinatorBadgeNumber?: string
  unit?: string
  completedBy?: string
}

/**
 * `form_data` — camelCase inside (mobile LocationFormData passthrough).
 * ALL fields optional: older rows predate newer keys (trap §5.5.3).
 * Deliberate subset — unmodeled keys pass through untouched (doc 01 §5.1).
 */
export interface LocationFormData {
  arrivalDepartures?: {
    id?: string
    arrivalDateTime?: string
    departureDateTime?: string
  }[]
  scopes?: {
    id?: string
    startDateTime?: string
    endDateTime?: string
    isActualTime?: boolean
    cameras?: string
  }[]
  cameras?: {
    id?: string
    cameraName?: string
    resolution?: string
    recordingFps?: string
    latitude?: number
    longitude?: number
    coordinateAccuracy?: number
  }[]
  dvrInformation?: {
    dvrLocation?: string
    dvrTypeBrand?: string
    serialModelNumber?: string
    dvrUsername?: string
    /**
     * An ordinary string like an address (owner directive 2026-07-20):
     * rendered plainly ALWAYS, never masked — no secrecy semantics at
     * any layer.
     */
    dvrPassword?: string
    numberOfChannels?: string
    activeCameras?: string
    recordingSchedule?: string
    resolution?: string
    recordingFps?: string
    firstRecordedDate?: string
    totalDvrRetention?: string
    daysUntilOverwritten?: string
  }
  timeOffset?: {
    dvrDateTime?: string
    actualDateTime?: string
    timeDifference?: string
    dvrAppliesDST?: boolean
  }
  exportInformation?: {
    exportMedia?: string
    fileType?: string
    sizeGb?: string
    mediaPlayerIncluded?: string
    mediaProvidedVia?: string
  }
  notes?: string
  dateTimeCompleted?: string
  completedBy?: string
}

export interface CaseRow {
  id: string
  user_id: string
  case_number: string
  display_name: string | null
  status: 'draft' | 'complete' | 'archived'
  notes: string | null
  metadata: CaseMetadata | null
  incident_business_name: string
  incident_street_address: string
  incident_city: string
  incident_address: string
  incident_latitude: number | null
  incident_longitude: number | null
  incident_coordinate_accuracy: number | null
  incident_coordinate_source: 'gps' | 'manual' | 'geocoded' | null
  created_at: string
  updated_at: string
  synced_at: string
  /** Non-null ⇒ hidden, everywhere (trap §5.5.1). */
  deleted_at: string | null
}

export interface LocationRow {
  id: string
  case_id: string
  user_id: string
  location_name: string
  status: 'started' | 'working' | 'complete'
  business_name: string
  street_address: string
  city: string
  full_address: string
  /** PostGIS geography → WKB hex via PostgREST; parse client-side (AD2). */
  location: string | null
  coordinate_accuracy: number | null
  coordinate_source: string | null
  location_contact: string
  location_phone: string
  /** The investigator at this location — drives the roster (AD8). */
  requester_name: string
  requester_badge_number: string
  requester_unit: string
  requester_phone: string
  requester_email: string
  duplicated_from: string | null
  /** The wire can carry null despite the mobile contract — consumers
   * must degrade to empty, never dereference (trap §5.5.3). */
  form_data: LocationFormData | null
  content_hash: string | null
  created_at: string
  updated_at: string
  synced_at: string
  deleted_at: string | null
}

export interface MediaRow {
  id: string
  case_id: string
  location_id: string
  user_id: string
  /** 'image' | 'video' | 'audio' today — left open: under the
   * `select('*')` drift strategy an unmodeled value must not become a
   * type the compiler calls impossible. */
  type: string
  /** 'dvr-original' | 'dvr-cropped' are per-location singletons. */
  category: string | null
  filename: string
  mime_type: string
  size_bytes: number
  /** 'images' | 'video' | 'audio' today — open for the same reason. */
  storage_bucket: string
  /** `{userId}/{caseId}/{locationId}/{filename}` */
  storage_path: string
  metadata: Record<string, unknown>
  created_at: string
  synced_at: string
  deleted_at: string | null
}

/** Key/value table — `schema_version` row: `value = { version: n }` (live-verified). */
export interface AppMetaRow {
  key: string
  value: unknown
}

/**
 * Mapped-type shim: interfaces lack the implicit index signature that
 * postgrest-js's `GenericTable` constraint (`Row: Record<string,
 * unknown>`) requires; a mapped copy is structurally identical but
 * carries one.
 */
type TableRow<T> = { [K in keyof T]: T[K] }

interface ReadOnlyTable<Row extends Record<string, unknown>> {
  Row: Row
  Insert: never
  Update: never
  Relationships: []
}

export interface Database {
  public: {
    Tables: {
      app_meta: ReadOnlyTable<TableRow<AppMetaRow>>
      cloud_cases: ReadOnlyTable<TableRow<CaseRow>>
      cloud_locations: ReadOnlyTable<TableRow<LocationRow>>
      cloud_media_files: ReadOnlyTable<TableRow<MediaRow>>
    }
    // `Record<never, never>` — NOT `Record<string, never>`: a string
    // index signature widens postgrest-js's relation-name union to
    // `string`, so a typo'd table name compiles end-to-end and only
    // fails as a runtime 404 (review MEDIUM, typecheck-probed).
    Views: Record<never, never>
    Functions: Record<never, never>
  }
}

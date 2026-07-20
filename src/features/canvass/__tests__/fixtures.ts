import type { CaseRow, LocationRow, MediaRow } from '../types'

/**
 * Row factories shaped from real canvas-hub-dev seed rows (2026-07-20).
 * Shared by the canvass suites so every test exercises the live shapes.
 */

export const SEED_CASE_ID = '17a195e3-18e7-4cac-b40f-e17c415336cc'
export const SEED_LOCATION_ID = 'd96628f4-003f-4a0c-99e3-d594b815ba50'
/** Real hex — parses to { lat: 44.0501, lng: -79.4663 }. */
export const QUICKMART_WKB =
  '0101000020E6100000FD87F4DBD7DD53C0CAC342AD69064640'

export function caseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: SEED_CASE_ID,
    user_id: 'a67a5ded-4204-46de-a0e7-31b6a57c417a',
    case_number: '24-CANVASS-0417',
    display_name: 'QuickMart Robbery — Yonge St Canvass',
    status: 'draft',
    notes: null,
    metadata: { oicName: 'D/Sgt. R. Vance', unit: 'Break & Enter Unit' },
    incident_business_name: 'QuickMart Convenience',
    incident_street_address: '17600 Yonge St',
    incident_city: 'Newmarket',
    incident_address: '17600 Yonge St, Newmarket, ON',
    incident_latitude: 44.0501,
    incident_longitude: -79.4663,
    incident_coordinate_accuracy: null,
    incident_coordinate_source: 'manual',
    created_at: '2026-07-17T12:00:00+00:00',
    updated_at: '2026-07-18T16:35:00+00:00',
    synced_at: '2026-07-18T16:35:00+00:00',
    deleted_at: null,
    ...overrides,
  }
}

export function locationRow(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    id: SEED_LOCATION_ID,
    case_id: SEED_CASE_ID,
    user_id: 'f1232b36-099e-4074-b92e-7587b86e7179',
    location_name: 'QuickMart Convenience',
    status: 'complete',
    business_name: 'QuickMart Convenience',
    street_address: '17600 Yonge St',
    city: 'Newmarket',
    full_address: '17600 Yonge St, Newmarket, ON',
    location: QUICKMART_WKB,
    coordinate_accuracy: null,
    coordinate_source: 'gps',
    location_contact: 'Store manager',
    location_phone: '905-555-0100',
    requester_name: 'Det. A. Morgan',
    requester_badge_number: '4411',
    requester_unit: 'B&E',
    requester_phone: '',
    requester_email: '',
    duplicated_from: null,
    form_data: {
      // The real multi-visit shape: the later arrival must win.
      arrivalDepartures: [
        {
          id: 'a1',
          arrivalDateTime: '2026-07-17T13:05:00Z',
          departureDateTime: '2026-07-17T14:20:00Z',
        },
        {
          id: 'a2',
          arrivalDateTime: '2026-07-17T16:40:00Z',
          departureDateTime: '2026-07-17T17:10:00Z',
        },
      ],
      dvrInformation: {
        dvrLocation: 'Back office, under counter',
        dvrTypeBrand: 'Hikvision DS-7208',
        dvrUsername: 'admin',
        dvrPassword: 'QuickM@rt2024',
      },
      dateTimeCompleted: '2026-07-17T17:10:00Z',
      completedBy: 'Det. A. Morgan',
    },
    content_hash: null,
    created_at: '2026-07-17T13:00:00+00:00',
    updated_at: '2026-07-17T17:10:00+00:00',
    synced_at: '2026-07-17T17:10:00+00:00',
    deleted_at: null,
    ...overrides,
  }
}

export function mediaRow(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: 'm-1',
    case_id: SEED_CASE_ID,
    location_id: SEED_LOCATION_ID,
    user_id: 'f1232b36-099e-4074-b92e-7587b86e7179',
    type: 'image',
    category: null,
    filename: 'camera-01.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    storage_bucket: 'images',
    storage_path: `f1232b36-099e-4074-b92e-7587b86e7179/${SEED_CASE_ID}/${SEED_LOCATION_ID}/camera-01.jpg`,
    metadata: {},
    created_at: '2026-07-17T14:00:00+00:00',
    synced_at: '2026-07-17T14:00:00+00:00',
    deleted_at: null,
    ...overrides,
  }
}

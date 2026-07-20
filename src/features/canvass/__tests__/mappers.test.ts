import { describe, it, expect } from 'vitest'
import {
  toCanvassCase,
  toCanvassLocation,
  toCanvassMedia,
  latestArrival,
  investigatorLabel,
  visibleRows,
} from '../services/mappers'
import type { CaseRow, LocationRow, MediaRow } from '../types'

/** Row factories shaped from real canvas-hub-dev seed rows (2026-07-20). */
function caseRow(overrides: Partial<CaseRow> = {}): CaseRow {
  return {
    id: '17a195e3-18e7-4cac-b40f-e17c415336cc',
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

function locationRow(overrides: Partial<LocationRow> = {}): LocationRow {
  return {
    id: 'd96628f4-003f-4a0c-99e3-d594b815ba50',
    case_id: '17a195e3-18e7-4cac-b40f-e17c415336cc',
    user_id: 'f1232b36-099e-4074-b92e-7587b86e7179',
    location_name: 'QuickMart Convenience',
    status: 'complete',
    business_name: 'QuickMart Convenience',
    street_address: '17600 Yonge St',
    city: 'Newmarket',
    full_address: '17600 Yonge St, Newmarket, ON',
    // Live hex — parses to { lat: 44.0501, lng: -79.4663 }.
    location: '0101000020E6100000FD87F4DBD7DD53C0CAC342AD69064640',
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

function mediaRow(overrides: Partial<MediaRow> = {}): MediaRow {
  return {
    id: 'm-1',
    case_id: '17a195e3-18e7-4cac-b40f-e17c415336cc',
    location_id: 'd96628f4-003f-4a0c-99e3-d594b815ba50',
    user_id: 'f1232b36-099e-4074-b92e-7587b86e7179',
    type: 'image',
    category: null,
    filename: 'camera-01.jpg',
    mime_type: 'image/jpeg',
    size_bytes: 1024,
    storage_bucket: 'images',
    storage_path:
      'f1232b36-099e-4074-b92e-7587b86e7179/17a195e3-18e7-4cac-b40f-e17c415336cc/d96628f4-003f-4a0c-99e3-d594b815ba50/camera-01.jpg',
    metadata: {},
    created_at: '2026-07-17T14:00:00+00:00',
    synced_at: '2026-07-17T14:00:00+00:00',
    deleted_at: null,
    ...overrides,
  }
}

describe('mappers', () => {
  // Test #35
  it('excludes soft-deleted rows in visibleRows and at every mapper', () => {
    const deletedAt = '2026-07-17T18:00:00+00:00'
    expect(
      visibleRows([caseRow(), caseRow({ id: 'c2', deleted_at: deletedAt })])
    ).toHaveLength(1)
    expect(
      visibleRows([
        locationRow(),
        locationRow({ id: 'l2', deleted_at: deletedAt }),
      ])
    ).toHaveLength(1)
    expect(
      visibleRows([mediaRow(), mediaRow({ id: 'm2', deleted_at: deletedAt })])
    ).toHaveLength(1)
    // Belt and braces: the mappers themselves refuse soft-deleted rows.
    expect(toCanvassCase(caseRow({ deleted_at: deletedAt }))).toBeNull()
    expect(toCanvassLocation(locationRow({ deleted_at: deletedAt }))).toBeNull()
    expect(toCanvassMedia(mediaRow({ deleted_at: deletedAt }))).toBeNull()
  })

  // Test #36
  it('maps a full LocationRow to a CanvassLocation', () => {
    const loc = toCanvassLocation(locationRow())
    expect(loc).not.toBeNull()
    expect(loc?.id).toBe('d96628f4-003f-4a0c-99e3-d594b815ba50')
    expect(loc?.caseId).toBe('17a195e3-18e7-4cac-b40f-e17c415336cc')
    expect(loc?.name).toBe('QuickMart Convenience')
    expect(loc?.status).toBe('complete')
    expect(loc?.address).toBe('17600 Yonge St, Newmarket, ON')
    expect(loc?.investigator).toBe('Det. A. Morgan')
    expect(loc?.coord?.lat).toBeCloseTo(44.0501, 6)
    expect(loc?.coord?.lng).toBeCloseTo(-79.4663, 6)
    expect(loc?.arrivedAt).toBe('2026-07-17T16:40:00Z')
    // A no-fix location maps with coord: null, never dropped.
    const noFix = toCanvassLocation(locationRow({ location: null }))
    expect(noFix).not.toBeNull()
    expect(noFix?.coord).toBeNull()
    // The case mapper mirrors the same guard for the incident coord.
    const mappedCase = toCanvassCase(caseRow())
    expect(mappedCase?.incidentCoord?.lat).toBeCloseTo(44.0501, 6)
    expect(
      toCanvassCase(caseRow({ incident_latitude: null }))?.incidentCoord
    ).toBeNull()
    const media = toCanvassMedia(mediaRow())
    expect(media?.bucket).toBe('images')
    expect(media?.mime).toBe('image/jpeg')
  })

  // Test #37
  it('surfaces the latest arrival across multiple visits', () => {
    // The real QuickMart multi-visit shape.
    expect(latestArrival(locationRow().form_data)).toBe('2026-07-17T16:40:00Z')
    // Order in the array must not matter.
    expect(
      latestArrival({
        arrivalDepartures: [
          { id: 'a2', arrivalDateTime: '2026-07-17T16:40:00Z' },
          { id: 'a1', arrivalDateTime: '2026-07-17T13:05:00Z' },
        ],
      })
    ).toBe('2026-07-17T16:40:00Z')
    // Empty arrival strings (live "arrived, not departed" rows) are skipped.
    expect(
      latestArrival({ arrivalDepartures: [{ id: 'a1', arrivalDateTime: '' }] })
    ).toBeNull()
    expect(latestArrival({ arrivalDepartures: [] })).toBeNull()
  })

  // Test #38
  it('degrades gracefully on older-shape or empty form_data', () => {
    // The real legacy-import seed row: only notes/scopes keys exist.
    const legacy = toCanvassLocation(
      locationRow({
        form_data: { notes: 'imported from spreadsheet', scopes: [] },
      })
    )
    expect(legacy).not.toBeNull()
    expect(legacy?.arrivedAt).toBeNull()
    expect(legacy?.dvr).toBeNull()
    // Empty and null-ish form_data never throw.
    expect(toCanvassLocation(locationRow({ form_data: {} }))).not.toBeNull()
    expect(
      toCanvassLocation(
        locationRow({ form_data: null as unknown as LocationRow['form_data'] })
      )
    ).not.toBeNull()
    // Malformed arrivals shape ⇒ absent, not a crash or "undefined" text.
    expect(
      latestArrival({
        arrivalDepartures: 'boom' as unknown as [],
      })
    ).toBeNull()
  })

  // Test #39
  it('labels the investigator from requester_name with uid fallback', () => {
    expect(investigatorLabel(locationRow())).toBe('Det. A. Morgan')
    expect(investigatorLabel(locationRow({ requester_name: '' }))).toBe(
      'f1232b36'
    )
    expect(investigatorLabel(locationRow({ requester_name: '   ' }))).toBe(
      'f1232b36'
    )
  })

  // Test #40
  it('keeps DVR credentials present on the view-model — ordinary strings', () => {
    const loc = toCanvassLocation(locationRow())
    // Verbatim pass-through, no masking, no secrecy handling (owner directive).
    expect(loc?.dvr?.dvrUsername).toBe('admin')
    expect(loc?.dvr?.dvrPassword).toBe('QuickM@rt2024')
    expect(loc?.dvr?.dvrLocation).toBe('Back office, under counter')
    expect(loc?.dvr?.dvrTypeBrand).toBe('Hikvision DS-7208')
  })
})

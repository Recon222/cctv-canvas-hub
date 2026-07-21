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
import { caseRow, locationRow, mediaRow } from './fixtures'

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

  // PR #7 M1: the wire's `type` stays open string (forward-tolerance);
  // the view-model narrows to MediaKind at this boundary, with drifted
  // values bucketed explicitly — never silently carried.
  it('normalizes media type to the MediaKind union, bucketing unknowns', () => {
    expect(toCanvassMedia(mediaRow())?.type).toBe('image')
    expect(toCanvassMedia(mediaRow({ type: 'video' }))?.type).toBe('video')
    expect(toCanvassMedia(mediaRow({ type: 'audio' }))?.type).toBe('audio')
    expect(toCanvassMedia(mediaRow({ type: 'document' }))?.type).toBe('unknown')
    expect(toCanvassMedia(mediaRow({ type: '' }))?.type).toBe('unknown')
  })

  it('treats a partial row MISSING deleted_at as alive, never tombstoned', () => {
    // The absence of a tombstone marker means the row is alive — strict
    // `!== null` read `undefined` as deleted, so a partial broadcast row
    // silently vanished from the board (fix-delta review LOW).
    const { deleted_at: _c, ...partialCase } = caseRow()
    const { deleted_at: _l, ...partialLocation } = locationRow()
    const { deleted_at: _m, ...partialMedia } = mediaRow()
    expect(toCanvassCase(partialCase as CaseRow)).not.toBeNull()
    expect(toCanvassLocation(partialLocation as LocationRow)).not.toBeNull()
    expect(toCanvassMedia(partialMedia as MediaRow)).not.toBeNull()
    expect(visibleRows([partialLocation as LocationRow])).toHaveLength(1)
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
    expect(latestArrival(locationRow().form_data ?? {})).toBe(
      '2026-07-17T16:40:00Z'
    )
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
    // Empty and null form_data never throw — the row type admits null.
    expect(toCanvassLocation(locationRow({ form_data: {} }))).not.toBeNull()
    expect(toCanvassLocation(locationRow({ form_data: null }))).not.toBeNull()
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
    // The wire can carry null despite the contract: a broadcast row with
    // a null name must not throw in the dispatch path (review HIGH — the
    // throw died in phoenix's catch-less callback loop).
    expect(
      investigatorLabel(
        locationRow({ requester_name: null as unknown as string })
      )
    ).toBe('f1232b36')
    expect(
      toCanvassLocation(
        locationRow({ requester_name: null as unknown as string })
      )?.investigator
    ).toBe('f1232b36')
    expect(
      investigatorLabel(
        locationRow({
          requester_name: null as unknown as string,
          user_id: null as unknown as string,
        })
      )
    ).toBe('')
  })

  // 5.3A: the dashboard's OIC line derives from case metadata (AD8's
  // location-derived roster never covers the officer in charge).
  it('carries the OIC metadata onto the case view-model, absent as null', () => {
    const withOic = toCanvassCase(
      caseRow({
        metadata: { oicName: 'D/Sgt. R. Vance', oicBadgeNumber: '2201' },
      })
    )
    expect(withOic?.oicName).toBe('D/Sgt. R. Vance')
    expect(withOic?.oicBadgeNumber).toBe('2201')

    // Metadata is nullable on the wire, every field optional inside —
    // absent renders as absent, never `undefined` text (trap §5.5.3).
    expect(toCanvassCase(caseRow({ metadata: null }))?.oicName).toBeNull()
    expect(
      toCanvassCase(caseRow({ metadata: null }))?.oicBadgeNumber
    ).toBeNull()
    expect(toCanvassCase(caseRow({ metadata: {} }))?.oicName).toBeNull()
    // The seeded shape: name without badge.
    const seeded = toCanvassCase(caseRow())
    expect(seeded?.oicName).toBe('D/Sgt. R. Vance')
    expect(seeded?.oicBadgeNumber).toBeNull()
  })

  it('rejects out-of-range incident coordinates like the WKB path does', () => {
    // geo.ts range-guards WKB points; a mis-keyed manual incident coord
    // must not become an off-planet marker in M3 (review LOW).
    expect(
      toCanvassCase(caseRow({ incident_latitude: 91 }))?.incidentCoord
    ).toBeNull()
    expect(
      toCanvassCase(caseRow({ incident_longitude: -181 }))?.incidentCoord
    ).toBeNull()
    expect(
      toCanvassCase(
        caseRow({ incident_latitude: -90, incident_longitude: 180 })
      )?.incidentCoord
    ).toEqual({ lat: -90, lng: 180 })
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

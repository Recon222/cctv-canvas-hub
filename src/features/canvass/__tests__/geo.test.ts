import { describe, it, expect } from 'vitest'
import { parseWkbPoint } from '../services/geo'

/**
 * Fixtures captured LIVE from canvas-hub-dev (2026-07-20) — every hex is a
 * real `cloud_locations.location` value, and every expected lat/lng was
 * cross-verified against the `locations_for_case` RPC's server-computed
 * lat/lng for the same row (exact match). SRID-flagged (EWKB, SRID 4326),
 * little-endian, lng-first.
 */
const QUICKMART = {
  name: 'QuickMart Convenience',
  hex: '0101000020E6100000FD87F4DBD7DD53C0CAC342AD69064640',
  lat: 44.0501,
  lng: -79.4663,
}
const PETRO = {
  name: 'Petro-Canada Station',
  hex: '0101000020E6100000F6285C8FC2DD53C0E6AE25E483064640',
  lat: 44.0509,
  lng: -79.465,
}
const LIVE_POINTS = [
  QUICKMART,
  PETRO,
  {
    name: 'RBC ATM Vestibule',
    hex: '0101000020E61000008BFD65F7E4DD53C07593180456064640',
    lat: 44.0495,
    lng: -79.4671,
  },
  {
    name: 'Tim Hortons #4821',
    hex: '0101000020E610000068B3EA73B5DD53C011C7BAB88D064640',
    lat: 44.0512,
    lng: -79.4642,
  },
  {
    name: '45 Maple Ave (Ring doorbell)',
    hex: '0101000020E6100000CBA145B6F3DD53C0BC0512143F064640',
    lat: 44.0488,
    lng: -79.468,
  },
  {
    name: 'Esso Car Wash',
    hex: '0101000020E61000006F1283C0CADD53C066F7E461A1064640',
    lat: 44.0518,
    lng: -79.4655,
  },
  {
    name: 'Corner variety (legacy import)',
    hex: '0101000020E610000076711B0DE0DD53C01FF46C567D064640',
    lat: 44.0507,
    lng: -79.4668,
  },
  {
    name: 'DUPLICATE — wrong address (soft-deleted row)',
    hex: '0101000020E6100000BC74931804DE53C0CA32C4B12E064640',
    lat: 44.0483,
    lng: -79.469,
  },
]

// The seeded incident scene (17600 Yonge St) — the cluster centre.
const INCIDENT = { lat: 44.0501, lng: -79.4663 }

describe('parseWkbPoint', () => {
  // Test #29
  it('parses a live-format WKB hex point to lat/lng (lng-first order honored)', () => {
    const coord = parseWkbPoint(QUICKMART.hex)
    expect(coord).not.toBeNull()
    expect(coord?.lat).toBeCloseTo(44.0501, 6)
    expect(coord?.lng).toBeCloseTo(-79.4663, 6)
  })

  // Test #30
  it('parses the SRID-flagged geography variant and the plain point form', () => {
    // Every live value carries the 0x20000000 SRID flag (0101000020E6100000…).
    const srid = parseWkbPoint(PETRO.hex)
    expect(srid?.lat).toBeCloseTo(44.0509, 6)
    expect(srid?.lng).toBeCloseTo(-79.465, 6)
    // The same point without the SRID flag/value must parse identically.
    const plain = parseWkbPoint(
      '0101000000' + PETRO.hex.slice('0101000020E6100000'.length)
    )
    expect(plain?.lat).toBeCloseTo(44.0509, 6)
    expect(plain?.lng).toBeCloseTo(-79.465, 6)
  })

  // Test #31
  it('returns null for (0,0) — the GPS no-fix guard', () => {
    const zeros = '00000000000000000000000000000000'
    expect(parseWkbPoint('0101000020E6100000' + zeros)).toBeNull()
    expect(parseWkbPoint('0101000000' + zeros)).toBeNull()
  })

  // Test #32
  it('returns null for malformed or truncated hex, without throwing', () => {
    expect(parseWkbPoint('')).toBeNull()
    expect(parseWkbPoint('garbage-not-hex')).toBeNull()
    expect(parseWkbPoint('01')).toBeNull()
    // Truncated live value (coordinate bytes cut off).
    expect(parseWkbPoint(QUICKMART.hex.slice(0, 24))).toBeNull()
    // Odd-length hex.
    expect(parseWkbPoint(QUICKMART.hex.slice(0, 25))).toBeNull()
    // Big-endian marker — PostgREST always emits little-endian.
    expect(parseWkbPoint('00' + QUICKMART.hex.slice(2))).toBeNull()
    // Non-point geometry type (LINESTRING = 2).
    expect(
      parseWkbPoint('0102000020E6100000' + QUICKMART.hex.slice(18))
    ).toBeNull()
  })

  // Test #33
  it('returns null for a null location column', () => {
    expect(parseWkbPoint(null)).toBeNull()
    expect(parseWkbPoint(undefined)).toBeNull()
  })

  // Test #34
  it('keeps lat/lng within valid ranges on all 8 real seed coordinates', () => {
    for (const point of LIVE_POINTS) {
      const coord = parseWkbPoint(point.hex)
      expect(coord, point.name).not.toBeNull()
      expect(coord?.lat).toBeCloseTo(point.lat, 6)
      expect(coord?.lng).toBeCloseTo(point.lng, 6)
      // The seed clusters within ~400 m of the incident — a parser that
      // swapped byte order or lat/lng would land far outside this box.
      expect(Math.abs((coord?.lat ?? 0) - INCIDENT.lat)).toBeLessThan(0.01)
      expect(Math.abs((coord?.lng ?? 0) - INCIDENT.lng)).toBeLessThan(0.01)
    }
  })
})

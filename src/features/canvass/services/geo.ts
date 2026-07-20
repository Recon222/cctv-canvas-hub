import type { Coordinate } from '../types'

/**
 * Client-side WKB point parser (AD2). PostgREST serializes PostGIS
 * `geography` as EWKB hex — live format: little-endian, SRID-flagged
 * (`0101000020E6100000…`), X=lng first, Y=lat second. Verified against
 * real canvas-hub-dev rows cross-checked with the server RPC's lat/lng.
 *
 * Malformed input and `(0,0)` (GPS no-fix, trap §5.5.2) ⇒ `null` —
 * never a throw, never a null-island marker.
 */

const HEX_PAIRS = /^(?:[0-9a-fA-F]{2})+$/
const SRID_FLAG = 0x20000000
const WKB_POINT = 1

export function parseWkbPoint(
  hex: string | null | undefined
): Coordinate | null {
  if (typeof hex !== 'string' || hex === '' || !HEX_PAIRS.test(hex)) {
    return null
  }
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  // Byte 0: endianness — PostgREST emits little-endian only.
  if (bytes.length < 5 || bytes[0] !== 1) {
    return null
  }
  const view = new DataView(bytes.buffer)
  const type = view.getUint32(1, true)
  if ((type & 0xff) !== WKB_POINT) {
    return null
  }
  const coordsAt = (type & SRID_FLAG) !== 0 ? 9 : 5
  if (bytes.length < coordsAt + 16) {
    return null
  }
  const lng = view.getFloat64(coordsAt, true)
  const lat = view.getFloat64(coordsAt + 8, true)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null
  }
  if ((lat === 0 && lng === 0) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null
  }
  return { lat, lng }
}

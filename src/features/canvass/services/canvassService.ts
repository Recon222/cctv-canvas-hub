import { getSupabase } from '@/lib/supabase/client'
import type {
  CanvassCase,
  CanvassLocation,
  CanvassMedia,
  LocationRow,
} from '../types'
import {
  toCanvassCase,
  toCanvassLocation,
  toCanvassMedia,
  visibleRows,
} from './mappers'

/**
 * Case-partitioned PostgREST reads (Phase 2.2A). Every fetch maps at the
 * boundary (`visibleRows` + `toCanvass*`) — raw rows never enter a query
 * cache. `select('*')` + the schema gate is the deliberate drift
 * strategy (AD10); explicit column lists are the payload optimization if
 * it ever matters.
 */

function mapVisible<Row extends { deleted_at: string | null }, Out>(
  rows: Row[],
  map: (row: Row) => Out | null
): Out[] {
  const out: Out[] = []
  for (const row of visibleRows(rows)) {
    const mapped = map(row)
    if (mapped !== null) {
      out.push(mapped)
    }
  }
  return out
}

/**
 * Active cases — pinned server-side predicates: never soft-deleted,
 * never archived, newest first, bounded (never an unbounded
 * agency-archive pull).
 */
export async function fetchCases(): Promise<CanvassCase[]> {
  const { data, error } = await getSupabase()
    .from('cloud_cases')
    .select('*')
    .is('deleted_at', null)
    .neq('status', 'archived')
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) {
    throw new Error(error.message)
  }
  return mapVisible(data, toCanvassCase)
}

/**
 * Locations and media mirror the cases predicates: tombstones are
 * excluded server-side too (the mapper choke point still drops them
 * client-side — belt and braces), and a stable `created_at` order keeps
 * cards from reshuffling with heap order on every reconcile.
 */
export async function fetchLocations(
  caseId: string
): Promise<CanvassLocation[]> {
  const { data, error } = await getSupabase()
    .from('cloud_locations')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) {
    throw new Error(error.message)
  }
  return mapVisible(data, toCanvassLocation)
}

export type LocationStatusCounts = Record<LocationRow['status'], number>

/**
 * Landing-view status counts: ONE bounded two-column query for every
 * visible case — never one `select('*')` per card (review HIGH: the
 * per-card N+1 dragged full `form_data` jsonb agency-wide every render).
 */
export async function fetchLocationCounts(
  caseIds: string[]
): Promise<Record<string, LocationStatusCounts>> {
  if (caseIds.length === 0) {
    return {}
  }
  const { data, error } = await getSupabase()
    .from('cloud_locations')
    .select('case_id,status')
    .in('case_id', caseIds)
    .is('deleted_at', null)
  if (error) {
    throw new Error(error.message)
  }
  const counts: Record<string, LocationStatusCounts> = {}
  for (const row of data) {
    const perCase = (counts[row.case_id] ??= {
      started: 0,
      working: 0,
      complete: 0,
    })
    perCase[row.status] += 1
  }
  return counts
}

export async function fetchMedia(caseId: string): Promise<CanvassMedia[]> {
  const { data, error } = await getSupabase()
    .from('cloud_media_files')
    .select('*')
    .eq('case_id', caseId)
    .is('deleted_at', null)
    .order('created_at')
  if (error) {
    throw new Error(error.message)
  }
  return mapVisible(data, toCanvassMedia)
}

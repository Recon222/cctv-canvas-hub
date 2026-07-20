import { getSupabase } from '@/lib/supabase/client'
import type { CanvassCase, CanvassLocation, CanvassMedia } from '../types'
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

export async function fetchLocations(
  caseId: string
): Promise<CanvassLocation[]> {
  const { data, error } = await getSupabase()
    .from('cloud_locations')
    .select('*')
    .eq('case_id', caseId)
  if (error) {
    throw new Error(error.message)
  }
  return mapVisible(data, toCanvassLocation)
}

export async function fetchMedia(caseId: string): Promise<CanvassMedia[]> {
  const { data, error } = await getSupabase()
    .from('cloud_media_files')
    .select('*')
    .eq('case_id', caseId)
  if (error) {
    throw new Error(error.message)
  }
  return mapVisible(data, toCanvassMedia)
}

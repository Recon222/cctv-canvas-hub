import { useEffect } from 'react'
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useHealthStore } from '@/store/health-store'
import {
  subscribeToCaseActivity,
  type ActivityEvent,
} from '../services/realtimeService'
import { toCanvassCase, toCanvassLocation } from '../services/mappers'
import { useCanvassStore } from '../store/canvass-store'
import type {
  ActivityKind,
  CanvassCase,
  CanvassLocation,
  LocationRow,
} from '../types'

/**
 * Flow C — the seconds-loop. Incoming rows map through the SAME
 * `toCanvass*` choke point as the fetch path (a live-patched row must
 * render identically to a fetched one), then patch the TanStack cache
 * in place: no refetch, INSERT upserts by id (redelivery-safe),
 * soft-delete/DELETE removes. Every event feeds the activity ring,
 * stamps attention, invalidates the case's media, and confirms health.
 *
 * Teardown: the subscription lives and dies with the mount — CanvassRoot
 * mounts only while the session is active/locked, so the transition
 * active→signed-out unmounts and removes the channel (ledger D12).
 */
export function useCaseRealtime(caseId: string | null): void {
  const queryClient = useQueryClient()

  useEffect(() => {
    if (caseId === null) {
      return
    }
    return subscribeToCaseActivity(
      caseId,
      event => {
        handleEvent(queryClient, caseId, event)
      },
      status => {
        useHealthStore.getState().channelStatus(status)
      }
    )
  }, [caseId, queryClient])
}

function upsertById<T extends { id: string }>(
  list: T[],
  mapped: T | null,
  rowId: string,
  removed: boolean
): T[] {
  if (removed || mapped === null) {
    return list.filter(item => item.id !== rowId)
  }
  return list.some(item => item.id === mapped.id)
    ? list.map(item => (item.id === mapped.id ? mapped : item))
    : [...list, mapped]
}

function locationKind(
  event: ActivityEvent & { row: LocationRow }
): ActivityKind {
  if (event.op === 'INSERT') {
    return 'location-new'
  }
  if (event.old !== null && event.old.status !== event.row.status) {
    return 'location-status'
  }
  return 'location-updated'
}

function handleEvent(
  queryClient: QueryClient,
  caseId: string,
  event: ActivityEvent
): void {
  // A delivered broadcast is a positive liveness confirmation (G4).
  useHealthStore.getState().recordEvent()

  if (event.table === 'cloud_locations') {
    const mapped = toCanvassLocation(event.row)
    queryClient.setQueryData<CanvassLocation[]>(
      ['locations', caseId],
      previous =>
        upsertById(previous ?? [], mapped, event.row.id, event.op === 'DELETE')
    )
    useCanvassStore.getState().pushActivity({
      id: crypto.randomUUID(),
      at: Date.now(),
      caseId,
      kind: locationKind(event),
      locationId: event.row.id,
      summary:
        locationKind(event) === 'location-status'
          ? `${event.row.location_name} → ${event.row.status}`
          : event.row.location_name,
    })
    // Any location event may mean new media too (Flow D3, spec §3).
    void queryClient.invalidateQueries({ queryKey: ['media', caseId] })
    return
  }

  const mapped = toCanvassCase(event.row)
  queryClient.setQueryData<CanvassCase[]>(['cases'], previous =>
    upsertById(previous ?? [], mapped, event.row.id, event.op === 'DELETE')
  )
  useCanvassStore.getState().pushActivity({
    id: crypto.randomUUID(),
    at: Date.now(),
    caseId,
    kind: 'case-updated',
    summary: event.row.display_name ?? event.row.case_number,
  })
}

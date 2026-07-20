import { describe, it, expect, beforeEach } from 'vitest'
import {
  useCanvassStore,
  resetCanvassStore,
  ACTIVITY_RING_CAP,
  ATTENTION_TTL_MS,
} from '../store/canvass-store'
import type { ActivityEntry } from '../types'
import { SEED_CASE_ID, SEED_LOCATION_ID } from './fixtures'

function entry(overrides: Partial<ActivityEntry> = {}): ActivityEntry {
  return {
    id: crypto.randomUUID(),
    at: 1_000_000,
    caseId: SEED_CASE_ID,
    kind: 'location-status',
    locationId: SEED_LOCATION_ID,
    summary: 'QuickMart Convenience → working',
    ...overrides,
  }
}

beforeEach(() => {
  resetCanvassStore()
})

describe('canvass-store', () => {
  // Test #52
  it('selects a case and clears location selection', () => {
    useCanvassStore.getState().selectCase(SEED_CASE_ID)
    useCanvassStore.getState().selectLocation(SEED_LOCATION_ID)
    expect(useCanvassStore.getState().selectedLocationId).toBe(SEED_LOCATION_ID)

    useCanvassStore.getState().selectCase('another-case')
    expect(useCanvassStore.getState().selectedCaseId).toBe('another-case')
    expect(useCanvassStore.getState().selectedLocationId).toBeNull()
  })

  // Test #53
  it('caps the activity ring at 200 entries', () => {
    expect(ACTIVITY_RING_CAP).toBe(200)
    for (let i = 0; i < ACTIVITY_RING_CAP + 1; i++) {
      useCanvassStore.getState().pushActivity(entry({ id: `e-${i}`, at: i }))
    }
    const activity = useCanvassStore.getState().activity
    expect(activity).toHaveLength(ACTIVITY_RING_CAP)
    // Newest first; the oldest (e-0) was evicted by the 201st push.
    expect(activity[0]?.id).toBe(`e-${ACTIVITY_RING_CAP}`)
    expect(activity.some(e => e.id === 'e-0')).toBe(false)
  })

  // Test #54
  it('scopes activity entries to their case', () => {
    useCanvassStore.getState().pushActivity(entry({ id: 'mine' }))
    useCanvassStore
      .getState()
      .pushActivity(entry({ id: 'other', caseId: 'other-case' }))

    const activity = useCanvassStore.getState().activity
    // Entries carry their caseId — the feed filters on it (G6).
    const forSeedCase = activity.filter(e => e.caseId === SEED_CASE_ID)
    expect(forSeedCase.map(e => e.id)).toEqual(['mine'])
  })

  // Test #55
  it('stamps and expires attention marks', () => {
    const at = 500_000
    useCanvassStore.getState().pushActivity(entry({ at }))
    expect(
      useCanvassStore.getState().attentionByLocation[SEED_LOCATION_ID]
    ).toBe(at)
    // An entry with no location stamps nothing.
    useCanvassStore
      .getState()
      .pushActivity(entry({ id: 'no-loc', locationId: undefined }))
    expect(
      Object.keys(useCanvassStore.getState().attentionByLocation)
    ).toHaveLength(1)

    // Not yet expired: mark survives.
    useCanvassStore.getState().clearExpiredAttention(at + ATTENTION_TTL_MS - 1)
    expect(
      useCanvassStore.getState().attentionByLocation[SEED_LOCATION_ID]
    ).toBe(at)
    // Past the TTL: removed.
    useCanvassStore.getState().clearExpiredAttention(at + ATTENTION_TTL_MS + 1)
    expect(
      useCanvassStore.getState().attentionByLocation[SEED_LOCATION_ID]
    ).toBeUndefined()
  })

  // Test #56 (A1)
  it('navigates across the three views', () => {
    expect(useCanvassStore.getState().view).toBe('cases')
    useCanvassStore.getState().setView('case')
    expect(useCanvassStore.getState().view).toBe('case')
    useCanvassStore.getState().setView('map')
    expect(useCanvassStore.getState().view).toBe('map')
    useCanvassStore.getState().setView('cases')
    expect(useCanvassStore.getState().view).toBe('cases')
  })
})

import { describe, it, expect, beforeEach } from 'vitest'
import { diffMedia, mediaEntry } from '../services/attention'
import { toCanvassMedia } from '../services/mappers'
import { useCanvassStore, resetCanvassStore } from '../store/canvass-store'
import type { CanvassMedia, MediaRow } from '../types'
import { mediaRow, SEED_CASE_ID, SEED_LOCATION_ID } from './fixtures'

function media(overrides: Partial<MediaRow> = {}): CanvassMedia {
  const mapped = toCanvassMedia(mediaRow(overrides))
  if (mapped === null) {
    throw new Error('fixture row unexpectedly soft-deleted')
  }
  return mapped
}

beforeEach(() => {
  resetCanvassStore()
})

describe('diffMedia', () => {
  // Test #82
  it('detects newly arrived media rows by id', () => {
    const a = media({ id: 'm-a', filename: 'a.jpg' })
    const b = media({ id: 'm-b', filename: 'b.jpg' })
    const c = media({ id: 'm-c', filename: 'c.mp4', type: 'video' })

    const fresh = diffMedia([a, b], [a, b, c])

    expect(fresh).toHaveLength(1)
    expect(fresh[0]?.id).toBe('m-c')
    // From-empty is NOT special-cased here — the polling hook owns the
    // baseline rule; the diff just reports additions.
    expect(diffMedia([], [a])).toHaveLength(1)
    // Removals are not additions.
    expect(diffMedia([a, b], [a])).toHaveLength(0)
  })

  // Test #83
  it('diffs by id, not position — no re-report on reorder or refetch', () => {
    const a = media({ id: 'm-a' })
    const b = media({ id: 'm-b' })

    // Same membership, any order, fresh object identities (a refetch
    // returns NEW row objects) ⇒ nothing is news.
    expect(
      diffMedia([a, b], [media({ id: 'm-b' }), media({ id: 'm-a' })])
    ).toHaveLength(0)
    expect(diffMedia([a, b], [a, b])).toHaveLength(0)
  })
})

describe('mediaEntry', () => {
  // Test #84
  it('emits a media-new activity entry with location attribution', () => {
    const row = media({ filename: 'front-door.jpg' })

    const entry = mediaEntry(row)

    expect(entry.kind).toBe('media-new')
    expect(entry.caseId).toBe(SEED_CASE_ID)
    expect(entry.locationId).toBe(SEED_LOCATION_ID)
    expect(entry.summary).toContain('front-door.jpg')
    expect(entry.id).not.toBe('')
    expect(entry.at).toBeGreaterThan(0)

    // Pushing the entry stamps attention on its location (Flow D2) —
    // the marker pulse / card highlight feed off this stamp.
    useCanvassStore.getState().pushActivity(entry)
    expect(
      useCanvassStore.getState().attentionByLocation[SEED_LOCATION_ID]
    ).toBe(entry.at)
    expect(useCanvassStore.getState().activity[0]).toBe(entry)
  })
})

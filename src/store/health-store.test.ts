import { describe, it, expect, beforeEach } from 'vitest'
import {
  useHealthStore,
  evaluate,
  resetHealthStore,
  STALE_AFTER_MS,
  type HealthMarks,
} from './health-store'

function marks(overrides: Partial<HealthMarks> = {}): HealthMarks {
  return {
    online: true,
    channel: null,
    lastEventAt: null,
    lastFetchOkAt: null,
    lastFetchErrorAt: null,
    startedAt: 0,
    ...overrides,
  }
}

beforeEach(() => {
  resetHealthStore()
})

describe('health-store', () => {
  // Test #61
  it('reports live while confirmations are fresh', () => {
    const now = 1_000_000
    expect(
      evaluate(
        marks({ channel: 'subscribed', lastFetchOkAt: now - 1_000 }),
        now
      )
    ).toBe('live')
    expect(
      evaluate(marks({ channel: 'subscribed', lastEventAt: now - 5_000 }), now)
    ).toBe('live')

    // Store path: subscribe + a positive confirmation ⇒ live.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchOk()
    expect(useHealthStore.getState().state).toBe('live')
    useHealthStore.getState().recordEvent()
    expect(useHealthStore.getState().state).toBe('live')
  })

  // Test #62
  it('degrades to stale after the silence threshold', () => {
    expect(STALE_AFTER_MS).toBe(90_000)
    const now = 1_000_000
    // A confirm older than the threshold is no longer a confirm.
    expect(
      evaluate(
        marks({
          channel: 'subscribed',
          lastFetchOkAt: now - STALE_AFTER_MS - 1,
        }),
        now
      )
    ).toBe('stale')
    // Silence since boot with no confirmation at all goes stale too.
    expect(evaluate(marks({ startedAt: now - STALE_AFTER_MS - 1 }), now)).toBe(
      'stale'
    )

    // Store path: a live board left silent past the threshold degrades on
    // the next evaluate tick.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchOk()
    expect(useHealthStore.getState().state).toBe('live')
    useHealthStore.getState().reevaluate(Date.now() + STALE_AFTER_MS + 1)
    expect(useHealthStore.getState().state).toBe('stale')
  })

  // Test #65
  it('only upgrades on positive confirmation', () => {
    const now = 1_000_000
    // Channel SUBSCRIBED alone is not a confirmation — still connecting.
    expect(
      evaluate(marks({ channel: 'subscribed', startedAt: now }), now)
    ).toBe('connecting')
    // A dropped channel is reconnecting even with a fresh fetch — the live
    // badge requires the channel.
    expect(
      evaluate(marks({ channel: 'error', lastFetchOkAt: now - 1_000 }), now)
    ).toBe('reconnecting')
    expect(
      evaluate(marks({ channel: 'closed', lastFetchOkAt: now - 1_000 }), now)
    ).toBe('reconnecting')
    // Offline wins over everything.
    expect(
      evaluate(
        marks({ online: false, channel: 'subscribed', lastFetchOkAt: now }),
        now
      )
    ).toBe('offline')
    // A fetch error never upgrades: it stamps evidence, not confirmation.
    useHealthStore.getState().channelStatus('subscribed')
    useHealthStore.getState().recordFetchError()
    expect(useHealthStore.getState().state).toBe('connecting')
  })
})

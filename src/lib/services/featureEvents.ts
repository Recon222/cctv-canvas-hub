/**
 * Frontend-Only Event System
 *
 * Lightweight JS emitter for cross-feature communication that does NOT
 * involve the Rust backend. Uses a typed event map for safety.
 *
 * Decision rule:
 * - Does Rust need to know about this event? --> Use TauriEvents
 * - Is it purely React <-> React? --> Use FeatureEvents (this file)
 *
 * Using FeatureEvents for purely frontend communication avoids an
 * unnecessary IPC round-trip to Rust and back.
 */

import { logger } from '@/lib/logger'

type Handler<T = unknown> = (payload: T) => void

/**
 * Type-safe map of frontend-only events.
 * Add new events here as features are created.
 */
interface FrontendEventMap {
  'preferences:changed': { key: string; value: unknown }
}

const listeners = new Map<string, Set<Handler>>()

export const FeatureEvents = {
  emit<K extends keyof FrontendEventMap>(
    event: K,
    payload: FrontendEventMap[K]
  ) {
    listeners.get(event)?.forEach(fn => {
      try {
        fn(payload)
      } catch (error) {
        // Isolate subscribers: one throwing handler must not abort the rest
        logger.error('FeatureEvents handler threw', { event, error })
      }
    })
  },

  on<K extends keyof FrontendEventMap>(
    event: K,
    handler: Handler<FrontendEventMap[K]>
  ): () => void {
    if (!listeners.has(event)) listeners.set(event, new Set())
    const set = listeners.get(event)
    if (set) set.add(handler as Handler)
    return () => listeners.get(event)?.delete(handler as Handler)
  },
}

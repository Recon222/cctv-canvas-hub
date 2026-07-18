/**
 * Rust-Involved Event System
 *
 * Typed wrapper around Tauri events for communication that involves
 * the Rust backend (e.g., Rust emits an event, frontend listens).
 *
 * Decision rule:
 * - Does Rust need to know about this event? --> Use TauriEvents (this file)
 * - Is it purely React <-> React? --> Use FeatureEvents
 *
 * All events here flow through the Tauri IPC bridge.
 */

import { emit, listen } from '@tauri-apps/api/event'

/**
 * Type-safe map of Tauri events that involve the Rust backend.
 * Add new events here as features are created.
 */
interface TauriEventMap {
  'theme:changed': { theme: string }
}

export const TauriEvents = {
  emit: async <K extends keyof TauriEventMap>(
    event: K,
    payload: TauriEventMap[K]
  ) => {
    await emit(event, payload)
  },

  listen: async <K extends keyof TauriEventMap>(
    event: K,
    handler: (payload: TauriEventMap[K]) => void
  ) => {
    return await listen<TauriEventMap[K]>(event, e => handler(e.payload))
  },
}

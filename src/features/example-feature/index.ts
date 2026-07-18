/**
 * Example Feature - Public API
 *
 * This barrel export defines the feature's public interface.
 * Outside code MUST import from this file, never from internal paths.
 */

// Export hooks
export { useGreeting } from './hooks/useExampleData'

// Export types
export type { ExampleData } from './types'

// DO NOT export:
// - Internal services (keep encapsulated)
// - Internal utilities (keep private)
// - Store internals (only expose if truly needed)

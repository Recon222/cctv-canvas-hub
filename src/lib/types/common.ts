/**
 * Common Shared Types
 *
 * Generic types used across multiple features.
 * Feature-local types stay in features/<name>/types/.
 */

/**
 * String alias for entity identifiers. NOTE: this is a plain alias, not a
 * branded type — it aids readability but provides NO compile-time mix-up
 * protection. For real branding, use `string & { readonly __brand: 'EntityId' }`.
 */
export type EntityId = string

/** ISO 8601 timestamp string (plain alias, not validated or branded). */
export type Timestamp = string

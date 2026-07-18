/**
 * Shared Types - Cross-Feature Type Definitions
 *
 * Types used by 2+ features live here. Feature-local types stay in
 * features/<name>/types/.
 *
 * Promotion rules:
 * - Used by ONE feature only → features/<name>/types/
 * - Used by TWO or more features → lib/types/
 * - Features import shared types from @/lib/types, NEVER from another feature
 */

export type { EntityId, Timestamp } from './common'

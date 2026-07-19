/**
 * Session lifecycle states (doc 01 §5.4). Health state is deliberately NOT
 * here — connection health lives solely in the global health-store (AD11).
 */
export type SessionState =
  | 'booting'
  | 'needs-setup'
  | 'signed-out'
  | 'schema-gate'
  | 'active'
  | 'locked'

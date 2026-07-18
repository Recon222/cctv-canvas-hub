/**
 * Feature Commands - Commands registered by feature modules
 *
 * When adding a new feature that exposes commands to the command palette,
 * add them here. Each feature's commands should use the feature name as
 * the group and reference i18n keys for labels.
 *
 * @example
 * ```ts
 * {
 *   id: 'my-feature-action',
 *   labelKey: 'commands.myFeature.action.label',
 *   descriptionKey: 'commands.myFeature.action.description',
 *   group: 'my-feature',
 *   execute: async (context) => {
 *     const { doSomething } = await import('@/features/my-feature')
 *     await doSomething()
 *   },
 * }
 * ```
 */

import type { AppCommand } from './types'

export const featureCommands: AppCommand[] = [
  // Add feature-specific commands here as new features are created.
  // See navigation-commands.ts and notification-commands.ts for patterns.
]

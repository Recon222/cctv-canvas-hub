/**
 * Service Layer - Plain Exported Async Functions
 *
 * CRITICAL: Services own ALL Tauri command invocations for this feature.
 * ALWAYS use the type-safe commands.* API from tauri-bindings, NEVER raw invoke().
 *
 * Why commands.* not invoke():
 * - Type-safe: TypeScript knows exact parameter and return types
 * - Auto-generated: Changes in Rust automatically update TypeScript
 * - No typos: Command names are checked at compile time
 *
 * Why plain functions, not classes:
 * - No instantiation needed — simpler to call and easier to mock in tests
 * - Tree-shakeable — bundler can drop unused exports
 * - Consistent with the rest of the codebase
 *
 * Components/hooks NEVER call Tauri commands directly.
 */

import { commands } from '@/lib/tauri-bindings'

export async function greetUser(name: string): Promise<string> {
  const result = await commands.greet(name)
  if (result.status === 'error') throw new Error(result.error)
  return result.data
}

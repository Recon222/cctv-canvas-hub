/**
 * Auth service — sign-in/out, session restore, and the schema gate
 * (Flows A, B, F).
 */

import { commands } from '@/lib/tauri-bindings'
import { getSupabase } from '@/lib/supabase/client'
import { logger } from '@/lib/logger'
import { loadConfig, saveConfig } from './configService'

/** The cloud schema this app understands (AD10 — fail-closed gate). */
export const APP_REQUIRED_SCHEMA_VERSION = 1

export async function signIn(email: string, password: string): Promise<void> {
  const supabase = getSupabase()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw new Error(error.message)
  }
  // Realtime sockets authenticate separately (Flow A step 4).
  await supabase.realtime.setAuth()
  // Remember the email for the re-auth prompt (Flow F). Convenience only —
  // failure must not fail the sign-in.
  try {
    const config = await loadConfig()
    if (config && config.signed_in_email !== email) {
      await saveConfig({ ...config, signed_in_email: email })
    }
  } catch (cause) {
    logger.warn('Failed to persist signed-in email to cloud config', { cause })
  }
}

export async function signOut(): Promise<void> {
  const supabase = getSupabase()
  // Tear down realtime first: no channel may linger on a revoked token
  // (D12). The active→signed-out unmount removes them too — this makes
  // the guarantee independent of the component tree.
  try {
    await supabase.removeAllChannels()
  } catch (cause) {
    logger.warn('Sign-out channel teardown failed; continuing', { cause })
  }
  try {
    const { error } = await supabase.auth.signOut()
    if (error) {
      logger.warn('Cloud sign-out reported an error; clearing locally anyway', {
        error: error.message,
      })
    }
  } catch (cause) {
    logger.warn('Cloud sign-out threw; clearing locally anyway', { cause })
  }
  // Belt and braces: guarantee an empty vault even if GoTrue's own
  // storage removal did not run.
  const result = await commands.vaultClear()
  if (result.status === 'error') {
    throw new Error(result.error)
  }
  // The client singleton stays alive: the config/project is unchanged and
  // GoTrue already cleared its session, so the next in-process sign-in
  // reuses it. Teardown is reserved for re-enrollment (`initSupabase`
  // replacing the singleton).
}

/** Flow B: true when supabase-js restored a usable session from the vault. */
export async function restoreSession(): Promise<boolean> {
  const supabase = getSupabase()
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    return false
  }
  return data.session !== null
}

/**
 * Read `app_meta.schema_version` (key/value row: `value = { version: n }`,
 * live-verified shape). Returns null when the row is missing or malformed;
 * throws on query failure.
 */
export async function fetchSchemaVersion(): Promise<number | null> {
  const supabase = getSupabase()
  const { data, error } = await supabase
    .from('app_meta')
    .select('value')
    .eq('key', 'schema_version')
    .maybeSingle()
  if (error) {
    throw new Error(error.message)
  }
  const row = data as { value?: { version?: unknown } | null } | null
  const version = row?.value?.version
  return typeof version === 'number' ? version : null
}

/** AD10: anything but the exact required version blocks the app. */
export async function checkSchemaGate(): Promise<'ok' | 'mismatch'> {
  const version = await fetchSchemaVersion()
  return version === APP_REQUIRED_SCHEMA_VERSION ? 'ok' : 'mismatch'
}

/** Flow F unlock: password re-auth against the signed-in account. */
export async function reauthenticate(password: string): Promise<boolean> {
  const supabase = getSupabase()
  const { data } = await supabase.auth.getSession()
  let email = data.session?.user.email ?? null
  if (!email) {
    try {
      email = (await loadConfig())?.signed_in_email ?? null
    } catch {
      email = null
    }
  }
  if (!email) {
    return false
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  return !error
}

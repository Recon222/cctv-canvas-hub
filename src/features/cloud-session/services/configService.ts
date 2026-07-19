/**
 * Cloud config service — owns the config IPC calls and the enrollment
 * probe (Flow A steps 1–3).
 */

import { commands, type CloudConfig } from '@/lib/tauri-bindings'
import { createProbeClient } from '@/lib/supabase/client'

export class EnrollmentPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EnrollmentPayloadError'
  }
}

/** The project answered and refused the key (PostgREST error). */
export class ProbeRejectedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProbeRejectedError'
  }
}

/** Nothing answered (network-level failure). */
export class ProbeUnreachableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ProbeUnreachableError'
  }
}

export async function loadConfig(): Promise<CloudConfig | null> {
  const result = await commands.loadCloudConfig()
  if (result.status === 'error') {
    throw new Error(result.error)
  }
  return result.data
}

export async function saveConfig(config: CloudConfig): Promise<void> {
  const result = await commands.saveCloudConfig(config)
  if (result.status === 'error') {
    throw new Error(result.error)
  }
}

export async function clearConfig(): Promise<void> {
  const result = await commands.clearCloudConfig()
  if (result.status === 'error') {
    throw new Error(result.error)
  }
}

/**
 * Parse a `{v, url, key}` enrollment payload (the same pair the mobile
 * enrollment QR carries). Throws {@link EnrollmentPayloadError} on bad
 * JSON, wrong shape, or an unsupported version.
 */
export function parseEnrollmentPayload(raw: string): {
  url: string
  key: string
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new EnrollmentPayloadError('Enrollment payload is not valid JSON')
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new EnrollmentPayloadError('Enrollment payload must be an object')
  }
  const { v, url, key } = parsed as Record<string, unknown>
  if (v !== 1) {
    throw new EnrollmentPayloadError('Unsupported enrollment payload version')
  }
  if (typeof url !== 'string' || !url.startsWith('https://')) {
    throw new EnrollmentPayloadError('Enrollment payload has no https URL')
  }
  if (typeof key !== 'string' || key.length === 0) {
    throw new EnrollmentPayloadError('Enrollment payload has no key')
  }
  return { url, key }
}

/**
 * Anonymous `app_meta` probe (mirrors mobile `enrollDevice`). Runs BEFORE
 * `initSupabase`, so it uses the transient probe client — never
 * `getSupabase()`. Success is "no error": RLS filters the anonymous read
 * to an empty result (live-verified — HTTP 200, `[]`).
 */
export async function probeProject(url: string, key: string): Promise<void> {
  const probe = createProbeClient(url, key)
  let error: { message: string } | null
  let status: number | undefined
  try {
    const response = await probe.from('app_meta').select('key').limit(1)
    error = response.error
    status = response.status
  } catch (cause) {
    // postgrest-js only throws when fetch itself fails outright.
    throw new ProbeUnreachableError(
      cause instanceof Error ? cause.message : 'Network request failed'
    )
  }
  if (!error) {
    return
  }
  // postgrest-js also maps some fetch failures into { status: 0, error }.
  if (!status) {
    throw new ProbeUnreachableError(error.message)
  }
  throw new ProbeRejectedError(error.message)
}

import { openUrl } from '@tauri-apps/plugin-opener'
import { getSupabase } from '@/lib/supabase/client'

/**
 * Signed-URL lifecycle (Phase 4.1A). Storage buckets are private; every
 * displayed byte rides a short-lived signed URL. T5: those URLs are
 * bearer secrets — held in the query cache only, never logged, never
 * persisted, never embedded in error messages.
 */

/** Signed-URL lifetime, seconds (doc 01 T5: short TTL). */
export const SIGNED_URL_TTL_S = 3600

/**
 * Proactive re-sign interval (TTL × ~0.83): the `useSignedUrl`
 * refetchInterval that re-signs a continuously-mounted wall thumbnail
 * BEFORE its URL expires — staleness alone never refetches an active
 * query (4.1B).
 */
export const SIGNED_URL_REFRESH_MS = 50 * 60_000

/**
 * Media freshness poll cadence (AD3-pinned 20 s, Flow D): media rows
 * ride no realtime event (G3), so the poll manufactures freshness. The
 * per-location event accelerator already shipped in M2's
 * useCaseRealtime — this is the safety net under it.
 */
export const MEDIA_POLL_MS = 20_000

/** §5.5.5 — the inline-renderable set. Everything else (HEIC, QuickTime,
 * …) gets the designed fallback tile + open-externally. */
const INLINE_RENDERABLE_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
])

export function isInlineRenderable(mime: string): boolean {
  return INLINE_RENDERABLE_MIMES.has(mime)
}

/**
 * Sign one storage object for display.
 *
 * ponytail: one signing call per thumbnail per refresh cycle — fine at
 * ~10 locations/case; `createSignedUrls` (per-case batch) is the pinned
 * upgrade path for dense cases (ledger D8).
 */
export async function createSignedUrl(
  bucket: string,
  path: string
): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(bucket)
    .createSignedUrl(path, SIGNED_URL_TTL_S)
  if (error !== null) {
    // The message carries the storage error only — never a URL (T5).
    throw new Error(error.message)
  }
  return data.signedUrl
}

/**
 * Non-renderable media (HEIC, QuickTime, …): sign on demand and hand the
 * URL to the OS default handler (spec §5's open-externally affordance).
 * On-demand only — no standing signed URL for bytes the board never
 * displays (T5).
 */
export async function openMediaExternally(
  bucket: string,
  path: string
): Promise<void> {
  const url = await createSignedUrl(bucket, path)
  await openUrl(url)
}

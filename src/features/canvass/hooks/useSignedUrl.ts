import { useQuery } from '@tanstack/react-query'
import { SIGNED_URL_KEY_PREFIX } from '@/store/health-store'
import {
  createSignedUrl,
  SIGNED_URL_REFRESH_MS,
} from '../services/mediaService'

/** Fresh-enough window: well inside the 60 min TTL. */
const SIGNED_URL_STALE_MS = 40 * 60_000
/** Keep unmounted URLs briefly, but never beyond their lifetime. */
const SIGNED_URL_GC_MS = 55 * 60_000

/**
 * One signed URL per storage object (Phase 4.1B). The key is built from
 * the health-store prefix and `'signed-url'` is deliberately NOT in
 * `CASE_DATA_KEY_FAMILIES` — signed URLs are excluded from reconnect
 * catch-up by not being in the allow-list (AD11): a wifi blip must not
 * mass-re-sign every visible thumbnail.
 *
 * The `refetchInterval` IS what re-signs a continuously-mounted wall
 * thumbnail — staleness alone never refetches an active query, and
 * focus/reconnect must not be the only triggers on an operator-less
 * board. T5: the URL lives in this query cache only.
 */
export function useSignedUrl(bucket: string, path: string, enabled = true) {
  return useQuery({
    queryKey: [SIGNED_URL_KEY_PREFIX, bucket, path],
    queryFn: () => createSignedUrl(bucket, path),
    refetchInterval: SIGNED_URL_REFRESH_MS,
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_GC_MS,
    refetchOnWindowFocus: false,
    enabled,
  })
}

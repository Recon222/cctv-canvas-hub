import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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

/**
 * The signed-URL self-heal ladder (4.1 error handling; shared by the
 * thumb and the photo viewer since PR #7 L2): a media-element error
 * invalidates that specific signed-URL query ONCE (auto re-sign — an
 * outage past the 60-min TTL heals without an operator), then the
 * honest errored state with manual retry. Never a broken image.
 *
 * Per-instance state: mount one per displayed media (the viewer host
 * keys itself by media id so paging resets the ladder).
 */
export function useSelfHealingSignedUrl(
  bucket: string,
  path: string,
  enabled = true
) {
  const queryClient = useQueryClient()
  const query = useSignedUrl(bucket, path, enabled)
  const signedUrl = query.data ?? null
  /** The exact URL the media element last failed on — the same URL back
   * from the cache means still broken; a new one means try again. */
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const [autoRetried, setAutoRetried] = useState(false)

  const reSign = () => {
    void queryClient.invalidateQueries({
      queryKey: [SIGNED_URL_KEY_PREFIX, bucket, path],
    })
  }
  const errored =
    enabled &&
    (query.isError || (signedUrl !== null && signedUrl === failedUrl))

  return {
    /** Null while pending or errored — consumers never see a URL that
     * just failed. */
    signedUrl: errored ? null : signedUrl,
    errored,
    /** Wire to the media element's onError. */
    onMediaError: () => {
      setFailedUrl(signedUrl)
      if (!autoRetried) {
        // ONE automatic re-sign per instance — after that the errored
        // state owns recovery.
        setAutoRetried(true)
        reSign()
      }
    },
    /** Manual retry from the errored state. */
    onRetry: () => {
      setFailedUrl(null)
      reSign()
    },
  }
}

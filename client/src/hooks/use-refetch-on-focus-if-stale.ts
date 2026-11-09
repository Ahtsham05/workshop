import { useEffect, useRef } from 'react'

/**
 * Refetch when the window regains focus — but only if the data is older than `minAgeMs`.
 *
 * RTK Query's own `refetchOnFocus` fires on EVERY focus event, and focus changes constantly
 * in normal use (alt-tab, clicking DevTools, a print dialog closing): each one cost a request
 * plus its CORS preflight. Pass the query's `fulfilledTimeStamp`.
 */
export function useRefetchOnFocusIfStale(
  refetch: () => unknown,
  fulfilledTimeStamp: number | undefined,
  { minAgeMs = 30_000, enabled = true }: { minAgeMs?: number; enabled?: boolean } = {},
) {
  const latest = useRef({ refetch, fulfilledTimeStamp })
  latest.current = { refetch, fulfilledTimeStamp }

  useEffect(() => {
    if (!enabled) return
    const onFocus = () => {
      const { refetch: run, fulfilledTimeStamp: at } = latest.current
      if (!at || Date.now() - at >= minAgeMs) void run()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [enabled, minAgeMs])
}

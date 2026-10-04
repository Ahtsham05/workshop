import { useCallback, useState } from 'react'
import { DEFAULT_PAGE_SIZE_OPTIONS, isAllRows } from '@/lib/page-size'

const STORAGE_PREFIX = 'page-size:'

function read(key: string, fallback: number): number {
  try {
    const n = Number(localStorage.getItem(STORAGE_PREFIX + key))
    // Only honour sizes the dropdowns still offer — a limit saved before an option was
    // removed (e.g. 1000) falls back to the list's default instead of sticking invisibly.
    // "All" is never restored — it can mean thousands of rows, so it's a one-off choice.
    if (!isAllRows(n) && (DEFAULT_PAGE_SIZE_OPTIONS.includes(n) || n === fallback)) return n
  } catch {
    // Storage blocked (private browsing) — use the default.
  }
  return fallback
}

/**
 * A list's rows-per-page, remembered per list in localStorage so the chosen limit is what every later
 * visit fetches. "All" (ALL_ROWS) is deliberately not saved. Drop-in for `useState(10)`.
 * @param key Unique per list, e.g. 'products'.
 */
export function usePersistedPageSize(key: string, defaultSize = 10): [number, (n: number) => void] {
  const [limit, setLimitState] = useState(() => read(key, defaultSize))
  const setLimit = useCallback(
    (n: number) => {
      setLimitState(n)
      // Choosing "All" applies for this visit only; the last real limit stays saved.
      if (isAllRows(n)) return
      try {
        localStorage.setItem(STORAGE_PREFIX + key, String(n))
      } catch {
        // Storage blocked — the choice just won't persist.
      }
    },
    [key]
  )
  return [limit, setLimit]
}

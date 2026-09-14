import { useCallback, useEffect, useRef, useState } from 'react'

interface PersistedListState {
  search: string
  page: number
  limit: number
  scrollY: number
}

const DEFAULT_STATE: PersistedListState = { search: '', page: 1, limit: 10, scrollY: 0 }

function readState(key: string): PersistedListState {
  if (typeof window === 'undefined') return DEFAULT_STATE
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return DEFAULT_STATE
    return { ...DEFAULT_STATE, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_STATE
  }
}

function writeState(key: string, state: PersistedListState) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(key, JSON.stringify(state))
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

/**
 * Keeps a searchable list's search text, page, page size and scroll position across a
 * "drill into a detail view and come back" round trip — the WhatsApp-style behavior where
 * leaving a list and returning to it doesn't reset what you were looking at. Session-scoped
 * (sessionStorage), same convention as accounting/utils/ledger-selection-storage.ts's "which
 * record was open" persistence — this covers the complementary "where was I in the list"
 * half, and is deliberately NOT feature-scoped so any list in the app can use it.
 *
 * This only matters for a list that fully unmounts when its detail view opens (a real route
 * change, or a parent swapping to a different subtree) and remounts when the user comes
 * back — that remount is exactly when this hook's initial-state read matters. For a list that
 * stays mounted with a detail view rendered as an overlay (Dialog/Sheet/Drawer) on top of it,
 * this hook is unnecessary — the list's own React state already survives untouched (this is
 * why Invoice/Purchase Management's lists don't need it).
 *
 * @param storageKey Unique per list — e.g. 'supplier-ledger-list-state'.
 */
export function usePersistedListState(storageKey: string) {
  const initial = useRef(readState(storageKey)).current
  const [search, setSearch] = useState(initial.search)
  const [page, setPage] = useState(initial.page)
  const [limit, setLimit] = useState(initial.limit)
  // Single mutable snapshot both effects below write into, so a scroll event landing between
  // two React state updates can never clobber the other with a stale value.
  const stateRef = useRef({ search, page, limit, scrollY: initial.scrollY })
  const restoredScroll = useRef(false)

  useEffect(() => {
    stateRef.current.search = search
    stateRef.current.page = page
    stateRef.current.limit = limit
    writeState(storageKey, stateRef.current)
  }, [storageKey, search, page, limit])

  useEffect(() => {
    let queued = false
    const onScroll = () => {
      if (queued) return
      queued = true
      requestAnimationFrame(() => {
        stateRef.current.scrollY = window.scrollY
        writeState(storageKey, stateRef.current)
        queued = false
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [storageKey])

  /** Call once the list's data has actually rendered (e.g. when a `loading` flag turns
   *  false) — scrolling to a saved position before the rows exist has nothing to land on.
   *  Safe to call on every render; only acts once per mount. */
  const restoreScroll = useCallback(() => {
    if (restoredScroll.current) return
    restoredScroll.current = true
    if (initial.scrollY > 0) {
      requestAnimationFrame(() => window.scrollTo(0, initial.scrollY))
    }
  }, [initial.scrollY])

  return { search, setSearch, page, setPage, limit, setLimit, restoreScroll }
}

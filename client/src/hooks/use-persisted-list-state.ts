import { useCallback, useEffect, useRef, useState } from 'react'

interface PersistedListState {
  search: string
  page: number
  limit: number
  scrollY: number
}

const DEFAULT_STATE: PersistedListState = { search: '', page: 1, limit: 10, scrollY: 0 }

// In-memory, not sessionStorage: this only needs to survive a component unmount/remount
// within the same SPA session (drilling into a detail view and coming back), never a full
// page reload. A module-level cache also sidesteps every Storage-API failure mode (quota,
// private browsing, extensions silently blocking writes) that the previous sessionStorage
// version could fail into without any visible signal.
const stateCache = new Map<string, PersistedListState>()

function readState(key: string): PersistedListState {
  return stateCache.get(key) ?? DEFAULT_STATE
}

function writeState(key: string, state: PersistedListState) {
  stateCache.set(key, { ...state })
}

// The authenticated app shell (src/routes/_authenticated.tsx) scrolls inside its <main
// class="overflow-auto">, not the browser window/document — so window.scrollY / scrollTo
// are always 0/no-ops here. <main> is unique per page, so it's a reliable target.
function getScrollContainer(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  return document.querySelector('main')
}

function getScrollPosition(container: HTMLElement | null): number {
  return container ? container.scrollTop : window.scrollY
}

function scrollTo(container: HTMLElement | null, y: number) {
  if (container) container.scrollTo(0, y)
  else window.scrollTo(0, y)
}

function maxScrollOf(container: HTMLElement | null): number {
  if (container) return container.scrollHeight - container.clientHeight
  return document.documentElement.scrollHeight - window.innerHeight
}

/**
 * Keeps a searchable list's search text, page, page size and scroll position across a
 * "drill into a detail view and come back" round trip — the WhatsApp-style behavior where
 * leaving a list and returning to it doesn't reset what you were looking at. Deliberately
 * NOT feature-scoped so any list in the app can use it.
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
    const container = getScrollContainer()
    const target: HTMLElement | Window = container ?? window
    // Tracks the in-flight rAF so a capture queued right before this list unmounts (e.g. the
    // user clicks a row a few ms after their last scroll tick) can be cancelled instead of
    // firing afterwards and writing back whatever scrollTop the now-shorter detail view
    // clamped the shared container down to.
    let rafId: number | null = null
    const onScroll = () => {
      if (rafId !== null) return
      rafId = requestAnimationFrame(() => {
        rafId = null
        stateRef.current.scrollY = getScrollPosition(container)
        writeState(storageKey, stateRef.current)
      })
    }
    target.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      target.removeEventListener('scroll', onScroll)
      if (rafId !== null) cancelAnimationFrame(rafId)
    }
  }, [storageKey])

  /** Call once the list's data has actually rendered (e.g. when a `loading` flag turns
   *  false) — scrolling to a saved position before the rows exist has nothing to land on.
   *  Safe to call on every render; only acts once per mount. */
  const restoreScroll = useCallback(() => {
    if (restoredScroll.current) return
    restoredScroll.current = true
    if (initial.scrollY <= 0) return
    // Poll across a few frames instead of a single rAF: the "loading just turned false"
    // render may commit before images/async row content (avatars, WhatsApp icons) finish
    // growing the container to its final scrollable height, and scrolling before then would
    // silently clamp to whatever height existed at that moment.
    let attempts = 0
    const tryScroll = () => {
      const container = getScrollContainer()
      attempts += 1
      if (maxScrollOf(container) >= initial.scrollY || attempts >= 15) {
        scrollTo(container, initial.scrollY)
      } else {
        requestAnimationFrame(tryScroll)
      }
    }
    requestAnimationFrame(tryScroll)
  }, [initial.scrollY])

  return { search, setSearch, page, setPage, limit, setLimit, restoreScroll }
}

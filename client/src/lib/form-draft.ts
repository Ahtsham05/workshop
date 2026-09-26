/**
 * Storage layer for unsaved form drafts ("I closed the Add Product dialog by accident —
 * where did everything I typed go?").
 *
 * Drafts live in localStorage so they survive a closed dialog, a route change, a page
 * reload and even a browser crash. Each draft is scoped to the signed-in user AND the
 * active branch, so a shared counter PC never shows one cashier's half-typed customer to
 * another, and a draft typed in Branch A never pops up in Branch B's form.
 *
 * Values are round-tripped through a tagged JSON encoding so `Date` fields come back as
 * real Dates (date pickers break on ISO strings). `File`/`Blob` values can't be stored and
 * are dropped — uploaded images are already URLs by the time they sit in a form.
 */

const PREFIX = 'erp-draft:v1:'
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export interface StoredDraft<T = unknown> {
  savedAt: number
  values: T
}

function readScope(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null')
    const userId = user?.id || user?._id || 'anon'
    const branchId = localStorage.getItem('activeBranchId') || 'none'
    return `${userId}:${branchId}`
  } catch {
    return 'anon:none'
  }
}

function storageKey(key: string) {
  return `${PREFIX}${readScope()}:${key}`
}

function toStorable(value: unknown): unknown {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : { __draftDate: value.toISOString() }
  }
  if (typeof Blob !== 'undefined' && value instanceof Blob) return undefined
  if (typeof value === 'function') return undefined
  if (Array.isArray(value)) return value.map((item) => toStorable(item) ?? null)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) {
      const stored = toStorable(v)
      if (stored !== undefined) out[k] = stored
    }
    return out
  }
  return value
}

function fromStorable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromStorable)
  if (value && typeof value === 'object') {
    const tagged = (value as { __draftDate?: unknown }).__draftDate
    if (typeof tagged === 'string') return new Date(tagged)
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = fromStorable(v)
    return out
  }
  return value
}

/** Stable string form of a value set, used to tell "changed" from "same as a blank form". */
export function serializeDraftValues(values: unknown): string {
  return JSON.stringify(toStorable(values) ?? null)
}

export function readDraft<T>(key: string): StoredDraft<T> | null {
  try {
    const raw = localStorage.getItem(storageKey(key))
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredDraft<unknown>
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      localStorage.removeItem(storageKey(key))
      return null
    }
    return { savedAt: parsed.savedAt, values: fromStorable(parsed.values) as T }
  } catch {
    return null
  }
}

/** Stores an already-serialized value set (see `serializeDraftValues`). */
export function writeDraft(key: string, serializedValues: string): number | null {
  const savedAt = Date.now()
  try {
    localStorage.setItem(storageKey(key), `{"savedAt":${savedAt},"values":${serializedValues}}`)
    return savedAt
  } catch {
    // Quota exceeded / storage blocked — a draft is a convenience, never worth an error.
    return null
  }
}

export function removeDraft(key: string) {
  try {
    localStorage.removeItem(storageKey(key))
  } catch {
    /* storage unavailable */
  }
}

export function hasDraft(key: string) {
  return readDraft(key) !== null
}

/** Drops drafts older than MAX_AGE_MS for every user/branch — runs once per app load. */
function pruneExpiredDrafts() {
  try {
    const now = Date.now()
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (!k?.startsWith(PREFIX)) continue
      try {
        const savedAt = JSON.parse(localStorage.getItem(k) || 'null')?.savedAt
        if (typeof savedAt !== 'number' || now - savedAt > MAX_AGE_MS) localStorage.removeItem(k)
      } catch {
        localStorage.removeItem(k)
      }
    }
  } catch {
    /* storage unavailable */
  }
}

if (typeof window !== 'undefined') pruneExpiredDrafts()

export function formatDraftAge(savedAt: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.round(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

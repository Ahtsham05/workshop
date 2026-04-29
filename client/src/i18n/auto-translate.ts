/**
 * Runtime Auto-Translation Engine
 *
 * Multi-provider cascade with localStorage caching.
 * Used by both `t()` (when a key is missing from the static dict) and the DOM
 * walker (which translates raw English text nodes app-wide).
 *
 * Provider priority:
 *   1. Google Translate (unofficial, no key, very high limits)
 *   2. Lingva (free Google proxy, no key)            ← fallback
 *   3. MyMemory (5000 chars/day per IP)              ← fallback
 *
 * Replace the providers below with DeepL Pro / Google Cloud Translation in
 * production for guaranteed quality and SLAs.
 */

import { resources } from './resources'

type Lang = 'en' | 'ur' | 'ar' | 'hi'

// ─── Cache (key = `${lang}\x1f${text}`) ──────────────────────────────────────

const memoryCache = new Map<string, string>()
const inflight = new Map<string, Promise<void>>()

// Soft failure tracking — retry after a cooldown rather than giving up forever.
const failures = new Map<string, number>() // key → last-fail timestamp
const FAILURE_COOLDOWN_MS = 60_000 // retry after 1 min

type Listener = () => void
const listeners = new Set<Listener>()

const STORAGE_PREFIX = 'autoTrans_'
const cacheKey = (lang: Lang, text: string) => `${lang}\x1f${text}`
const storageKey = (lang: Lang) => `${STORAGE_PREFIX}${lang}`

// ─── Persistence ──────────────────────────────────────────────────────────────

export function loadCacheFor(lang: Lang): void {
  if (lang === 'en') return
  try {
    const raw = localStorage.getItem(storageKey(lang))
    if (!raw) return
    const obj = JSON.parse(raw) as Record<string, string>
    for (const [text, translated] of Object.entries(obj)) {
      memoryCache.set(cacheKey(lang, text), translated)
    }
  } catch {}
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function schedulePersist(lang: Lang) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    saveTimer = null
    persistCache(lang)
  }, 250)
}

function persistCache(lang: Lang): void {
  try {
    const prefix = `${lang}\x1f`
    const obj: Record<string, string> = {}
    for (const [k, v] of memoryCache.entries()) {
      if (k.startsWith(prefix)) {
        obj[k.slice(prefix.length)] = v
      }
    }
    localStorage.setItem(storageKey(lang), JSON.stringify(obj))
  } catch {}
}

// ─── Public reads ─────────────────────────────────────────────────────────────

export function getCachedTranslation(lang: Lang, text: string): string | undefined {
  if (lang === 'en') return text
  return memoryCache.get(cacheKey(lang, text))
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export function subscribeToTranslations(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

let notifyTimer: ReturnType<typeof setTimeout> | null = null
function notifyListenersThrottled() {
  if (notifyTimer) return
  notifyTimer = setTimeout(() => {
    notifyTimer = null
    for (const fn of listeners) fn()
  }, 80)
}

// ─── Concurrency limiter ──────────────────────────────────────────────────────

const MAX_CONCURRENT = 6
let activeRequests = 0
const queue: Array<() => void> = []

function runWithLimit(fn: () => Promise<void>): Promise<void> {
  return new Promise((resolve) => {
    const start = () => {
      activeRequests++
      fn().finally(() => {
        activeRequests--
        const next = queue.shift()
        if (next) next()
        resolve()
      })
    }
    if (activeRequests < MAX_CONCURRENT) start()
    else queue.push(start)
  })
}

// ─── Translation Providers ────────────────────────────────────────────────────

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), ms)
    const res = await fetch(url, { signal: ctrl.signal })
    clearTimeout(timer)
    return res.ok ? res : null
  } catch {
    return null
  }
}

/** Google Translate (unofficial, public endpoint). Very high rate limits. */
async function fetchFromGoogle(text: string, target: Lang): Promise<string | null> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${target}` +
    `&dt=t&q=${encodeURIComponent(text)}`
  const res = await fetchWithTimeout(url, 6000)
  if (!res) return null
  try {
    const data = await res.json()
    // Response shape: [[ [translated, source, ...], ... ], null, "en"]
    const segments: string[] | undefined = data?.[0]?.map((seg: any) => seg?.[0]).filter(Boolean)
    const translated = segments?.join('') ?? null
    return translated && translated !== text ? translated : null
  } catch {
    return null
  }
}

/** Lingva: free Google Translate proxy. Multiple instances for redundancy. */
async function fetchFromLingva(text: string, target: Lang): Promise<string | null> {
  const instances = [
    'https://lingva.ml',
    'https://lingva.lunar.icu',
    'https://translate.plausibility.cloud',
    'https://lingva.thedaviddelta.com',
  ]
  for (const base of instances) {
    const url = `${base}/api/v1/en/${target}/${encodeURIComponent(text)}`
    const res = await fetchWithTimeout(url, 5000)
    if (!res) continue
    try {
      const data = await res.json()
      const translated: string | undefined = data?.translation
      if (translated && translated !== text) return translated
    } catch {}
  }
  return null
}

/** MyMemory: free anonymous tier (5000 chars/day per IP). */
async function fetchFromMyMemory(text: string, target: Lang): Promise<string | null> {
  const url =
    `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}` +
    `&langpair=en|${target}`
  const res = await fetchWithTimeout(url, 6000)
  if (!res) return null
  try {
    const data = await res.json()
    const translated: string | undefined = data?.responseData?.translatedText
    if (!translated) return null
    const upper = translated.toUpperCase()
    if (upper.startsWith('PLEASE SELECT TWO DISTINCT LANGUAGES')) return null
    if (upper.startsWith('MYMEMORY WARNING')) return null
    if (upper.includes('QUOTA EXCEEDED')) return null
    return translated !== text ? translated : null
  } catch {
    return null
  }
}

/** Cascade: try providers in order, return first success. */
async function translateExternal(text: string, target: Lang): Promise<string | null> {
  return (
    (await fetchFromGoogle(text, target)) ??
    (await fetchFromLingva(text, target)) ??
    (await fetchFromMyMemory(text, target))
  )
}

// ─── Public: schedule a translation ───────────────────────────────────────────

export function requestTranslation(text: string, lang: Lang): void {
  if (lang === 'en') return
  if (!text || text.trim().length === 0) return
  // Skip pure-numeric / symbol-only strings
  if (/^[\d\s.,:%/+\-*=()$£€¥₹×→←↑↓·•Rs]+$/.test(text)) return

  const key = cacheKey(lang, text)
  if (memoryCache.has(key) || inflight.has(key)) return

  // Soft cooldown for transient failures
  const lastFail = failures.get(key)
  if (lastFail && Date.now() - lastFail < FAILURE_COOLDOWN_MS) return

  // Reverse-lookup: maybe this English text is a value in the EN dict that has
  // a counterpart in the target dict.
  const enDict = resources.en
  const targetDict = resources[lang]
  for (const [k, v] of Object.entries(enDict)) {
    if (v === text && targetDict[k]) {
      memoryCache.set(key, targetDict[k])
      schedulePersist(lang)
      notifyListenersThrottled()
      return
    }
  }

  const promise = runWithLimit(async () => {
    const result = await translateExternal(text, lang)
    if (result && result !== text) {
      memoryCache.set(key, result)
      failures.delete(key)
      schedulePersist(lang)
      notifyListenersThrottled()
    } else {
      failures.set(key, Date.now())
    }
  })

  inflight.set(key, promise)
  promise.finally(() => {
    inflight.delete(key)
  })
}

// ─── Stats / utilities for UI ─────────────────────────────────────────────────

export function getInflightCount(): number {
  return inflight.size + queue.length
}

/** Manually clear the soft-failure list so failed phrases get retried now. */
export function retryFailures(): void {
  failures.clear()
  notifyListenersThrottled()
}

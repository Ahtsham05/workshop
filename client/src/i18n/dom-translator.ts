/**
 * DOM Auto-Translator
 *
 * What: Walks the entire rendered DOM, finds English text nodes, replaces them
 *       with translations from the auto-translate engine. Re-runs on every DOM
 *       mutation (React renders, route changes, async data loads).
 *
 * How : Same approach used by Google Translate, Crowdin In-Context Editor,
 *       Lingva, and many enterprise SaaS i18n tools.
 *
 * Why : Lets us translate strings the developer never wrapped in t(), so the
 *       *entire* app translates with zero per-component work.
 *
 * Safety guards:
 *   - Never touches <input>, <textarea>, <select>, <code>, <pre>, <script>, <style>
 *   - Never touches contenteditable, .notranslate, [data-no-translate]
 *   - Skips numbers, currency, dates, single chars
 *   - Skips strings without 2+ Latin letters (so it doesn't re-translate Urdu)
 *   - Tracks original text so we can restore on language switch back to English
 *   - Avoids infinite loops by recording our own DOM writes and skipping them
 *     in the next MutationObserver tick
 */

import {
  getCachedTranslation,
  requestTranslation,
  subscribeToTranslations,
} from './auto-translate'
import type { SupportedLanguage } from './resources'

// ─── Marker book-keeping ──────────────────────────────────────────────────────

interface NodeMarker {
  /** The English source text we cached for this node (trimmed). */
  source: string
  /** What we wrote to the DOM (translated value). */
  written: string
  /** Language we wrote it for. */
  lang: SupportedLanguage
}

const textMarkers = new WeakMap<Text, NodeMarker>()
// Track all live text nodes we've ever translated, so we can restore them when
// the user switches back to English. WeakRef lets the GC clean them up if the
// node is removed from the DOM.
const knownNodes = new Set<WeakRef<Text>>()

// We can't use WeakMap for elements (need to enumerate for restore), so use
// element marker for attributes (placeholder/title/aria-label).
interface AttrMarker {
  source: string
  written: string
  lang: SupportedLanguage
  attr: string
}
const attrMarkers = new Map<HTMLElement, AttrMarker[]>()

// ─── Filtering ────────────────────────────────────────────────────────────────

// Tags whose entire subtree should be skipped
const SKIP_ELEMENTS = new Set([
  'INPUT', 'TEXTAREA', 'SELECT', 'OPTION',
  'CODE', 'PRE', 'SCRIPT', 'STYLE', 'NOSCRIPT',
  'SVG', 'PATH', 'CANVAS',
])

// Tags we never skip even if they carry notranslate (they get it for browser
// compat, not as a "don't touch" signal for our own translator).
const NEVER_SKIP_TAGS = new Set(['HTML', 'BODY', 'HEAD'])

function isSkippedElement(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  if (NEVER_SKIP_TAGS.has(tag)) return false  // never block on html/body
  if (SKIP_ELEMENTS.has(tag)) return true
  if (el.classList.contains('notranslate')) return true
  if (el.getAttribute('data-no-translate') !== null) return true
  if (el.getAttribute('contenteditable') === 'true') return true
  return false
}


/** Heuristic: is this English-looking text worth translating? */
function shouldTranslateText(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.length < 2) return false
  // Pure numeric, currency, dates, percentages, math symbols
  if (/^[\d\s.,:%/+\-*=()$£€¥₹×→←↑↓·•]+$/.test(trimmed)) return false
  // Must contain at least one run of 2+ Latin letters (so we ignore
  // Arabic/Urdu/Hindi text that's already translated, plus things like "x2",
  // "Rs5,330", "1.0", emoji-only strings, etc.)
  if (!/[a-zA-Z]{2,}/.test(trimmed)) return false
  return true
}

// ─── Translation application ──────────────────────────────────────────────────

/** Translate a single text node in place if possible. */
function translateTextNode(node: Text, lang: SupportedLanguage): void {
  if (lang === 'en') return
  const raw = node.textContent
  if (!raw) return

  const existing = textMarkers.get(node)
  let source: string
  if (existing) {
    if (existing.written === raw && existing.lang === lang) return
    // React may have rewritten the node back to English — treat new text as source.
    source = raw === existing.written ? existing.source : raw
  } else {
    source = raw
  }

  const trimmed = source.trim()
  if (!shouldTranslateText(trimmed)) return

  const cached = getCachedTranslation(lang, trimmed)
  if (cached) {
    const written = source.replace(trimmed, cached)
    if (node.textContent !== written) {
      node.textContent = written
    }
    textMarkers.set(node, { source, written, lang })
    knownNodes.add(new WeakRef(node))
  } else {
    requestTranslation(trimmed, lang)
  }
}

const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'] as const

/** Translate translatable attributes on an element. */
function translateAttributes(el: HTMLElement, lang: SupportedLanguage): void {
  if (lang === 'en') return
  if (isSkippedElement(el)) {
    // Inputs ARE allowed for placeholder/title/aria-label — we only skip their
    // *value* (the text node child). So do attribute translation for inputs
    // unless the element itself is data-no-translate.
    if (el.getAttribute('data-no-translate') !== null) return
    if (el.classList.contains('notranslate')) return
  }

  const previous = attrMarkers.get(el)

  for (const attr of TRANSLATABLE_ATTRS) {
    const raw = el.getAttribute(attr)
    if (!raw) continue

    const prev = previous?.find((p) => p.attr === attr)
    let source: string
    if (prev) {
      if (prev.written === raw && prev.lang === lang) continue
      source = raw === prev.written ? prev.source : raw
    } else {
      source = raw
    }

    const trimmed = source.trim()
    if (!shouldTranslateText(trimmed)) continue

    const cached = getCachedTranslation(lang, trimmed)
    if (cached) {
      const written = source.replace(trimmed, cached)
      if (el.getAttribute(attr) !== written) el.setAttribute(attr, written)
      const next: AttrMarker = { attr, source, written, lang }
      const list = attrMarkers.get(el) ?? []
      const filtered = list.filter((p) => p.attr !== attr)
      filtered.push(next)
      attrMarkers.set(el, filtered)
    } else {
      requestTranslation(trimmed, lang)
    }
  }
}

// ─── Tree walking ─────────────────────────────────────────────────────────────

/** Walk a subtree, translating every eligible text node and attribute. */
function walkAndTranslate(root: Node, lang: SupportedLanguage): void {
  if (lang === 'en') return

  // FILTER_REJECT tells the TreeWalker to skip the rejected node AND its entire
  // subtree, then resume at the next sibling or ancestor-next-sibling.
  // This is the correct way to prune subtrees — using nextSibling()+break was
  // wrong: if the skipped element was the last child, break abandoned the rest
  // of the entire document.
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
    {
      acceptNode(node: Node): number {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (isSkippedElement(node as Element)) return NodeFilter.FILTER_REJECT
        }
        return NodeFilter.FILTER_ACCEPT
      },
    }
  )

  let node: Node | null = walker.currentNode
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      translateTextNode(node as Text, lang)
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      translateAttributes(node as HTMLElement, lang)
    }
    node = walker.nextNode()
  }
}

// ─── Restore (for switching back to English) ──────────────────────────────────

function restoreAll(): void {
  // Restore text nodes
  for (const ref of Array.from(knownNodes)) {
    const node = ref.deref()
    if (!node) {
      knownNodes.delete(ref)
      continue
    }
    const marker = textMarkers.get(node)
    if (marker && node.textContent === marker.written) {
      node.textContent = marker.source
    }
    textMarkers.delete(node)
    knownNodes.delete(ref)
  }
  // Restore attributes
  for (const [el, markers] of attrMarkers.entries()) {
    for (const m of markers) {
      if (el.getAttribute(m.attr) === m.written) {
        el.setAttribute(m.attr, m.source)
      }
    }
  }
  attrMarkers.clear()
}

// ─── Public lifecycle ─────────────────────────────────────────────────────────

let observer: MutationObserver | null = null
let scanRaf: number | null = null
let periodicTimer: ReturnType<typeof setInterval> | null = null
let unsubscribeFromUpdates: (() => void) | null = null
let activeLang: SupportedLanguage = 'en'

function scheduleScan(): void {
  if (scanRaf !== null) return
  scanRaf = window.requestAnimationFrame(() => {
    scanRaf = null
    walkAndTranslate(document.body, activeLang)
  })
}

/** Force a full re-walk of the DOM. Useful as a safety net for lazy/async content. */
export function rescanDomTranslator(): void {
  if (activeLang === 'en') return
  walkAndTranslate(document.body, activeLang)
}

/** Begin auto-translating the whole DOM into `lang`. Idempotent. */
export function startDomTranslator(lang: SupportedLanguage): void {
  // Stop previous observer if running
  stopDomTranslator(/* preserveTranslations */ lang !== 'en')

  activeLang = lang

  if (lang === 'en') {
    restoreAll()
    return
  }

  // Initial pass — translate everything currently in the DOM.
  walkAndTranslate(document.body, lang)

  // Observe future changes (React re-renders, navigation, async loads).
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'childList') {
        r.addedNodes.forEach((added) => {
          if (added.nodeType === Node.TEXT_NODE) {
            translateTextNode(added as Text, activeLang)
          } else if (added.nodeType === Node.ELEMENT_NODE) {
            walkAndTranslate(added, activeLang)
          }
        })
      } else if (r.type === 'characterData' && r.target.nodeType === Node.TEXT_NODE) {
        translateTextNode(r.target as Text, activeLang)
      } else if (r.type === 'attributes' && r.target.nodeType === Node.ELEMENT_NODE) {
        const el = r.target as HTMLElement
        if (r.attributeName && TRANSLATABLE_ATTRS.includes(r.attributeName as any)) {
          translateAttributes(el, activeLang)
        }
      }
    }
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: TRANSLATABLE_ATTRS as unknown as string[],
  })

  // Re-scan when async translations stream in from the API.
  unsubscribeFromUpdates = subscribeToTranslations(scheduleScan)

  // Safety-net periodic re-scan — catches DOM content rendered without a
  // mutation event (lazy chunks, certain animation libs, etc.) and re-applies
  // any translations that arrived from the API after the initial walk.
  periodicTimer = setInterval(() => {
    if (activeLang === 'en') return
    walkAndTranslate(document.body, activeLang)
  }, 1500)
}

/** Stop the translator. If `preserve` is false, restores all original English. */
export function stopDomTranslator(preserve = false): void {
  if (observer) {
    observer.disconnect()
    observer = null
  }
  if (unsubscribeFromUpdates) {
    unsubscribeFromUpdates()
    unsubscribeFromUpdates = null
  }
  if (scanRaf !== null) {
    window.cancelAnimationFrame(scanRaf)
    scanRaf = null
  }
  if (periodicTimer !== null) {
    clearInterval(periodicTimer)
    periodicTimer = null
  }
  if (!preserve) restoreAll()
}

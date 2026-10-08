import { useLayoutEffect, useState } from 'react'
import type { RefObject } from 'react'

/**
 * Nearest ancestor that is actually scrolling, or the document scroller. An `overflow-y: auto`
 * wrapper that just grows with its content (the app's <main>) never overflows, so it doesn't
 * count — checking only `overflow` would mistake it for the scroller and read its full content
 * height as the viewport.
 */
function findScrollParent(el: HTMLElement): HTMLElement {
  let node = el.parentElement
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node)
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node
    node = node.parentElement
  }
  return (document.scrollingElement as HTMLElement) ?? document.documentElement
}

/**
 * Height of the in-flow content laid out after `el` inside `scroller`: following siblings at
 * every ancestor level plus each ancestor's bottom padding/border. Measured from layout rather
 * than `scroller.scrollHeight`, which is clamped up to the viewport on short pages (and
 * stretched by min-h-screen wrappers) — that would read empty space as trailing content.
 */
function trailingContentHeight(el: HTMLElement, scroller: HTMLElement): number {
  const start = el.getBoundingClientRect().bottom
  let bottom = start + parseFloat(getComputedStyle(el).marginBottom || '0')
  let node: HTMLElement = el
  while (node.parentElement && node.parentElement !== scroller && node.parentElement !== document.body) {
    for (let sib = node.nextElementSibling; sib; sib = sib.nextElementSibling) {
      const style = getComputedStyle(sib)
      if (style.position === 'fixed' || style.position === 'absolute' || style.display === 'none') continue
      bottom = Math.max(bottom, sib.getBoundingClientRect().bottom + parseFloat(style.marginBottom || '0'))
    }
    const parentStyle = getComputedStyle(node.parentElement)
    bottom += parseFloat(parentStyle.paddingBottom || '0') + parseFloat(parentStyle.borderBottomWidth || '0')
    node = node.parentElement
  }
  return Math.max(0, bottom - start)
}

/**
 * Max height (px) for an invoice/purchase items list so the page itself never has to scroll:
 * the list soaks up exactly the viewport space left after everything above it, the rest of its
 * card (Apply Discount etc.) and whatever follows the form (autosave banner, padding).
 *
 * Every term is measured independently of the list's own height, so applying the result can't
 * feed back into the next measurement. If the page is too short to fit `minHeight`, the list
 * keeps that floor and the page scrolls as before. Returns undefined while disabled — callers keep their
 * fixed fallback cap (phones, catalog mode, stacked tablet layout) in that case.
 *
 * @param listRef  the list's scroll box
 * @param rootRef  the form's outermost element; content after it counts as trailing space
 */
export function useFitListToViewport(
  listRef: RefObject<HTMLElement | null>,
  rootRef: RefObject<HTMLElement | null>,
  { enabled, minHeight = 260 }: { enabled: boolean; minHeight?: number },
): number | undefined {
  const [maxHeight, setMaxHeight] = useState<number>()

  useLayoutEffect(() => {
    const list = listRef.current
    const root = rootRef.current
    if (!enabled || !list || !root) {
      setMaxHeight(undefined)
      return
    }
    const card = (list.closest('[data-slot="card"]') as HTMLElement | null) ?? list

    const measure = () => {
      // Re-resolved every time — which ancestor is overflowing changes as content grows.
      const scroller = findScrollParent(list)
      const isDocument = scroller === document.scrollingElement || scroller === document.documentElement
      const scrollerTop = isDocument ? 0 : scroller.getBoundingClientRect().top
      const viewport = isDocument ? window.innerHeight : scroller.clientHeight
      const toContent = (y: number) => y - scrollerTop + scroller.scrollTop
      const listRect = list.getBoundingClientRect()
      const listTop = toContent(listRect.top)
      const belowListInCard = card.getBoundingClientRect().bottom - listRect.bottom
      const afterRoot = trailingContentHeight(root, scroller)
      const next = Math.max(minHeight, Math.floor(viewport - listTop - belowListInCard - afterRoot))
      setMaxHeight((prev) => (prev === next ? prev : next))
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(card)
    // Banners/padding outside the form (e.g. the push-notification bar) change the trailing
    // space without resizing root or card; the body's height catches those.
    observer.observe(document.body)
    window.addEventListener('resize', measure)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [enabled, listRef, rootRef, minHeight])

  return maxHeight
}

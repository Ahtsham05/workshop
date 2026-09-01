import { useCallback, useEffect, useRef, useState } from 'react'
import { useGetBulkPurchasePriceComparisonMutation, type PriceComparisonEntry } from '@/stores/purchase.api'

export interface PriceComparisonItemKey {
  /** Same "unit key" convention as the purchasable catalog: variantId when the line is a
   *  real variant, else productId. Two rows for the same product/variant always collapse
   *  to one key, so duplicate rows and re-adding a removed product never re-fetch. */
  key: string
  productId: string
  variantId?: string
}

const DEBOUNCE_MS = 350
const NO_SUPPLIER = '__none__'

/**
 * Client-side cache + batcher for Purchase Invoice's price-comparison indicator.
 *
 * Two independent caches, both scoped to this hook instance's lifetime (i.e. one purchase
 * session — a fresh mount on "New Purchase" starts empty):
 *  - overall (any-supplier) last purchase price per key — fetched once per key, ever;
 *    quantity/price/discount/supplier edits never invalidate it.
 *  - per-supplier last purchase price per (key, supplierId) — fetched once per combo, so
 *    switching supplier A -> B -> A only ever costs one request for the B leg.
 *
 * Every product newly seen in `items` (across possibly-rapid successive adds) is queued
 * and flushed as ONE bulk POST after a short debounce, never one request per product.
 */
export function usePurchasePriceComparison(items: PriceComparisonItemKey[], supplierId: string | undefined) {
  const [fetchComparison] = useGetBulkPurchasePriceComparisonMutation()

  const overallCacheRef = useRef(new Map<string, PriceComparisonEntry>())
  const supplierCacheRef = useRef(new Map<string, NonNullable<PriceComparisonEntry['supplierPrice']>>())
  // "Already requested" (in-flight or resolved) — the dedup source of truth, distinct
  // from the caches above so a still-in-flight key isn't queued a second time.
  const requestedOverallRef = useRef(new Set<string>())
  const requestedSupplierRef = useRef(new Set<string>())

  const pendingItemsRef = useRef(new Map<string, PriceComparisonItemKey>())
  const pendingSupplierRef = useRef<string | undefined>(undefined)
  const debounceTimerRef = useRef<number | null>(null)

  // Refs don't re-render on their own — bump this once a batch resolves so rows relying
  // on getComparison() below pick up the newly-cached data.
  const [, forceRender] = useState(0)

  const flush = useCallback(() => {
    debounceTimerRef.current = null
    const requestItems = [...pendingItemsRef.current.values()]
    const requestSupplierId = pendingSupplierRef.current
    pendingItemsRef.current = new Map()
    pendingSupplierRef.current = undefined
    if (requestItems.length === 0) return

    fetchComparison({
      items: requestItems.map((item) => ({ productId: item.productId, variantId: item.variantId })),
      supplierId: requestSupplierId,
    })
      .unwrap()
      .then((res) => {
        const supplierTag = requestSupplierId || NO_SUPPLIER
        Object.entries(res.data).forEach(([key, entry]) => {
          overallCacheRef.current.set(key, entry)
          if (requestSupplierId && entry.supplierPrice) {
            supplierCacheRef.current.set(`${key}:${supplierTag}`, entry.supplierPrice)
          }
        })
        forceRender((v) => v + 1)
      })
      .catch(() => {
        // Un-mark so a later item/supplier change can retry — a transient failure
        // shouldn't permanently blank that row's indicator for the rest of the session.
        requestItems.forEach((item) => {
          requestedOverallRef.current.delete(item.key)
          if (requestSupplierId) requestedSupplierRef.current.delete(`${item.key}:${requestSupplierId}`)
        })
        forceRender((v) => v + 1)
      })
  }, [fetchComparison])

  const itemsSignature = items.map((item) => item.key).join('|')

  useEffect(() => {
    const supplierTag = supplierId || NO_SUPPLIER
    let queued = false
    for (const item of items) {
      const needsOverall = !requestedOverallRef.current.has(item.key)
      const needsSupplier = !!supplierId && !requestedSupplierRef.current.has(`${item.key}:${supplierTag}`)
      if (!needsOverall && !needsSupplier) continue

      if (needsOverall) requestedOverallRef.current.add(item.key)
      if (needsSupplier) requestedSupplierRef.current.add(`${item.key}:${supplierTag}`)
      pendingItemsRef.current.set(item.key, item)
      if (supplierId) pendingSupplierRef.current = supplierId
      queued = true
    }
    if (!queued) return

    if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = window.setTimeout(flush, DEBOUNCE_MS)
    // itemsSignature stands in for `items` (primitive, stable across re-renders that
    // don't actually add/remove a product/variant — e.g. qty/price/discount edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsSignature, supplierId, flush])

  useEffect(
    () => () => {
      if (debounceTimerRef.current) window.clearTimeout(debounceTimerRef.current)
    },
    [],
  )

  const getComparison = useCallback(
    (key: string): PriceComparisonEntry | undefined => {
      const overall = overallCacheRef.current.get(key)
      if (!overall) return undefined
      const supplierTag = supplierId || NO_SUPPLIER
      const supplierPrice = supplierId ? supplierCacheRef.current.get(`${key}:${supplierTag}`) ?? null : null
      return { ...overall, supplierPrice }
    },
    [supplierId],
  )

  return { getComparison }
}

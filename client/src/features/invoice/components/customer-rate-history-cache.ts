// Rate-history requests for the rate box (customer-rate-history-panel.tsx), for both sides:
//   sale     — what this CUSTOMER paid (New Invoice, Fast Billing)     POST /invoices/rate-history
//   purchase — what we paid this SUPPLIER (New Purchase)                POST /purchases/cost-history
//
// The box must open instantly when a rate is clicked, without a request. So while a document
// is being built, every line's history is fetched up front — ONE batch request for all lines
// that are not cached yet — and each product's result is written into a per-product RTK cache
// entry the box reads from (getCustomerProductHistory / getSupplierProductCostHistory).
//
// - Qty / price / discount edits never change the key (party, product, variant, document
//   being edited), so they never cause a request.
// - Adding products fetches only the new ones, debounced: scanning ten items is one request.
// - A product the box needs while its batch is in flight waits for that batch. A product
//   not cached at all (e.g. Fast Billing's Add to Cart dialog) is asked for through the same
//   batch URL — never a per-product GET — so the browser's CORS preflight for that one URL
//   is reused instead of repeated per product.
import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react'
import { skipToken } from '@reduxjs/toolkit/query'
import { useDispatch, useStore } from 'react-redux'
import {
  invoiceApi,
  type CustomerProductHistory,
  type CustomerProductHistoryArgs,
} from '@/stores/invoice.api'
import {
  purchaseApi,
  type SupplierProductCostHistoryArgs,
} from '@/stores/purchase.api'
import type { AppDispatch, RootState } from '@/stores/store'
import { useDebouncedValue } from '@/hooks/use-debounced-value'

const PREFETCH_DEBOUNCE_MS = 350
const MAX_KEYS_PER_REQUEST = 100

export type RateHistoryKind = 'sale' | 'purchase'

/** Which history: a customer's (sale) or a supplier's (purchase), for one product/variant. */
export interface RateHistoryRef {
  kind: RateHistoryKind
  /** Customer id (sale) or supplier id (purchase). */
  partyId: string
  productId: string
  variantId?: string | null
  /** The invoice/purchase being edited — kept out of its own history. */
  excludeId?: string | null
}

export const rateHistoryKey = (ref: RateHistoryRef) =>
  [
    ref.kind,
    ref.partyId,
    ref.productId,
    ref.variantId || '',
    ref.excludeId || '',
  ].join('|')

// The exact args objects the RTK cache entries are keyed by.
const saleArgs = (ref: RateHistoryRef): CustomerProductHistoryArgs => ({
  customerId: ref.partyId,
  productId: ref.productId,
  ...(ref.variantId ? { variantId: ref.variantId } : {}),
  ...(ref.excludeId ? { excludeInvoiceId: ref.excludeId } : {}),
})
const purchaseArgs = (ref: RateHistoryRef): SupplierProductCostHistoryArgs => ({
  supplierId: ref.partyId,
  productId: ref.productId,
  ...(ref.variantId ? { variantId: ref.variantId } : {}),
  ...(ref.excludeId ? { excludePurchaseId: ref.excludeId } : {}),
})

const isCached = (state: RootState, ref: RateHistoryRef) => {
  const entry =
    ref.kind === 'sale'
      ? invoiceApi.endpoints.getCustomerProductHistory.select(saleArgs(ref))(
          state
        )
      : purchaseApi.endpoints.getSupplierProductCostHistory.select(
          purchaseArgs(ref)
        )(state)
  return entry.isSuccess
}

// Keys whose batch request is on the wire right now, and keys whose last request failed.
const inFlight = new Set<string>()
const failed = new Set<string>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * One POST for many products of one party (all refs share kind, party and excludeId); each
 * product's result is written into its per-product cache entry.
 */
function fetchRateHistories(dispatch: AppDispatch, refs: RateHistoryRef[]) {
  if (!refs.length) return
  const { kind, partyId, excludeId } = refs[0]
  for (let i = 0; i < refs.length; i += MAX_KEYS_PER_REQUEST) {
    const chunk = refs.slice(i, i + MAX_KEYS_PER_REQUEST)
    const keys = chunk.map(rateHistoryKey)
    keys.forEach((key) => {
      inFlight.add(key)
      failed.delete(key)
    })
    notify()
    const items = chunk.map((ref) => ({
      productId: ref.productId,
      ...(ref.variantId ? { variantId: ref.variantId } : {}),
    }))
    const request =
      kind === 'sale'
        ? dispatch(
            invoiceApi.endpoints.getCustomerRateHistoryBatch.initiate(
              {
                customerId: partyId,
                items,
                ...(excludeId ? { excludeInvoiceId: excludeId } : {}),
              },
              { subscribe: false, forceRefetch: true }
            )
          ).unwrap()
        : dispatch(
            purchaseApi.endpoints.getSupplierCostHistoryBatch.initiate(
              {
                supplierId: partyId,
                items,
                ...(excludeId ? { excludePurchaseId: excludeId } : {}),
              },
              { subscribe: false, forceRefetch: true }
            )
          ).unwrap()

    request
      .then(({ results }) => {
        const byProduct = new Map<string, CustomerProductHistory>(
          results.map((result) => [
            `${result.productId}|${result.variantId || ''}`,
            result.history,
          ])
        )
        const found = chunk.flatMap((ref) => {
          const history = byProduct.get(
            `${ref.productId}|${ref.variantId || ''}`
          )
          return history ? [{ ref, history }] : []
        })
        if (!found.length) return
        if (kind === 'sale') {
          dispatch(
            invoiceApi.util.upsertQueryEntries(
              found.map(({ ref, history }) => ({
                endpointName: 'getCustomerProductHistory' as const,
                arg: saleArgs(ref),
                value: history,
              }))
            )
          )
        } else {
          dispatch(
            purchaseApi.util.upsertQueryEntries(
              found.map(({ ref, history }) => ({
                endpointName: 'getSupplierProductCostHistory' as const,
                arg: purchaseArgs(ref),
                value: history,
              }))
            )
          )
        }
      })
      .catch(() => keys.forEach((key) => failed.add(key)))
      .finally(() => {
        keys.forEach((key) => inFlight.delete(key))
        notify()
      })
  }
}

/**
 * The history the box shows. Cached → returned at once, no request. Not cached → asked for
 * once (through the batch URL), after a short pause so hopping across rows only asks for the
 * row you stop on; a prefetch already fetching it is waited for instead.
 */
export function useRateHistory(ref: RateHistoryRef, active: boolean) {
  const dispatch = useDispatch<AppDispatch>()
  const key = rateHistoryKey(ref)
  // Both hooks always run (rules of hooks); the other side's is skipped.
  const sale = invoiceApi.endpoints.getCustomerProductHistory.useQueryState(
    ref.kind === 'sale' ? saleArgs(ref) : skipToken
  )
  const purchase =
    purchaseApi.endpoints.getSupplierProductCostHistory.useQueryState(
      ref.kind === 'purchase' ? purchaseArgs(ref) : skipToken
    )
  const data = ref.kind === 'sale' ? sale.data : purchase.data
  const loading = useSyncExternalStore(subscribe, () => inFlight.has(key))
  const error = useSyncExternalStore(subscribe, () => failed.has(key))
  const settled = useDebouncedValue(key, 150) === key
  const hasData = Boolean(data)

  useEffect(() => {
    if (!active || hasData || !settled || inFlight.has(key) || failed.has(key))
      return
    fetchRateHistories(dispatch, [ref])
    // `ref` is fully described by `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, hasData, settled, key, dispatch])

  const retry = useCallback(() => {
    fetchRateHistories(dispatch, [ref])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, dispatch])

  return { data, loading, error: error && !hasData, retry }
}

interface PrefetchLine {
  productId?: string
  variantId?: string
}

/**
 * Keeps the history of every product on the document cached for the selected party.
 * `lines` may change on every keystroke — only the set of products matters.
 */
export function useRateHistoryPrefetch({
  kind = 'sale',
  partyId,
  lines,
  excludeId,
  enabled,
}: {
  kind?: RateHistoryKind
  partyId: string | null
  lines: PrefetchLine[]
  excludeId?: string
  enabled: boolean
}) {
  const dispatch = useDispatch<AppDispatch>()
  const store = useStore<RootState>()

  // Sorted product|variant set — a qty change leaves this string (and so the effect) alone.
  const productSet = useMemo(() => {
    if (!enabled || !partyId) return ''
    const keys = new Set<string>()
    for (const line of lines) {
      if (line.productId) keys.add(`${line.productId}|${line.variantId || ''}`)
    }
    return [...keys].sort().join(',')
  }, [enabled, partyId, lines])

  useEffect(() => {
    if (!productSet || !partyId) return
    const timer = window.setTimeout(() => {
      const state = store.getState()
      const missing = productSet
        .split(',')
        .map((entry): RateHistoryRef => {
          const [productId, variantId] = entry.split('|')
          return {
            kind,
            partyId,
            productId,
            variantId: variantId || undefined,
            excludeId,
          }
        })
        .filter((ref) => {
          const key = rateHistoryKey(ref)
          // In flight, or failed (the box retries a failed one when it is opened).
          if (inFlight.has(key) || failed.has(key)) return false
          return !isCached(state, ref)
        })
      fetchRateHistories(dispatch, missing)
    }, PREFETCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [kind, productSet, partyId, excludeId, dispatch, store])
}

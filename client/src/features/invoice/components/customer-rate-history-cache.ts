// Rate-history requests for New Invoice (customer-rate-history-panel.tsx).
//
// The rate box must open instantly when a rate is clicked, without a request. So while the
// invoice is being built, every line's history is fetched up front — ONE batch request for
// all lines that are not cached yet (POST /invoices/rate-history) — and each product's result
// is written into the per-product getCustomerProductHistory cache the box reads from.
//
// - Qty / price / discount edits never change the request key (customer, product, variant,
//   invoice being edited), so they never cause a request.
// - Adding products fetches only the new ones, debounced, so scanning ten items in a row is
//   one request, not ten.
// - A product the box needs while its batch is still in flight waits for that batch instead
//   of asking again (see useRateHistoryPrefetching).
import { useEffect, useMemo, useSyncExternalStore } from 'react'
import { useDispatch, useStore } from 'react-redux'
import {
  invoiceApi,
  type CustomerProductHistoryArgs,
} from '@/stores/invoice.api'
import type { AppDispatch, RootState } from '@/stores/store'

const PREFETCH_DEBOUNCE_MS = 350
const MAX_KEYS_PER_REQUEST = 100

/** The exact args object the box queries with (RTK keys the cache by it). */
export function buildRateHistoryArgs(
  customerId: string,
  productId: string,
  variantId?: string | null,
  excludeInvoiceId?: string | null
): CustomerProductHistoryArgs {
  return {
    customerId,
    productId,
    ...(variantId ? { variantId } : {}),
    ...(excludeInvoiceId ? { excludeInvoiceId } : {}),
  }
}

export const rateHistoryKey = (args: CustomerProductHistoryArgs) =>
  [
    args.customerId,
    args.productId,
    args.variantId || '',
    args.excludeInvoiceId || '',
  ].join('|')

// Keys whose batch request is on the wire right now.
const inFlight = new Set<string>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())
const subscribe = (listener: () => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** True while a prefetch batch is fetching this key — the box waits for it instead of asking. */
export function useRateHistoryPrefetching(key: string) {
  return useSyncExternalStore(subscribe, () => inFlight.has(key))
}

interface PrefetchLine {
  productId?: string
  variantId?: string
}

/**
 * Keeps the rate history of every product on the invoice cached for the selected customer.
 * `lines` may change on every keystroke — only the set of products matters.
 */
export function useRateHistoryPrefetch({
  customerId,
  lines,
  excludeInvoiceId,
  enabled,
}: {
  customerId: string | null
  lines: PrefetchLine[]
  excludeInvoiceId?: string
  enabled: boolean
}) {
  const dispatch = useDispatch<AppDispatch>()
  const store = useStore<RootState>()

  // Sorted product|variant set — a qty change leaves this string (and so the effect) alone.
  const productSet = useMemo(() => {
    if (!enabled || !customerId) return ''
    const keys = new Set<string>()
    for (const line of lines) {
      if (line.productId) keys.add(`${line.productId}|${line.variantId || ''}`)
    }
    return [...keys].sort().join(',')
  }, [enabled, customerId, lines])

  useEffect(() => {
    if (!productSet || !customerId) return
    const timer = window.setTimeout(() => {
      const state = store.getState()
      const select = invoiceApi.endpoints.getCustomerProductHistory.select
      const missing = productSet
        .split(',')
        .map((entry) => {
          const [productId, variantId] = entry.split('|')
          return buildRateHistoryArgs(
            customerId,
            productId,
            variantId,
            excludeInvoiceId
          )
        })
        .filter((args) => {
          if (inFlight.has(rateHistoryKey(args))) return false
          const cached = select(args)(state)
          return cached.isUninitialized || cached.isError
        })

      for (let i = 0; i < missing.length; i += MAX_KEYS_PER_REQUEST) {
        const chunk = missing.slice(i, i + MAX_KEYS_PER_REQUEST)
        const keys = chunk.map(rateHistoryKey)
        keys.forEach((key) => inFlight.add(key))
        notify()
        dispatch(
          invoiceApi.endpoints.getCustomerRateHistoryBatch.initiate(
            {
              customerId,
              items: chunk.map((args) => ({
                productId: args.productId,
                ...(args.variantId ? { variantId: args.variantId } : {}),
              })),
              ...(excludeInvoiceId ? { excludeInvoiceId } : {}),
            },
            { subscribe: false, forceRefetch: true }
          )
        )
          .unwrap()
          .then(({ results }) => {
            const byProduct = new Map(
              results.map((result) => [
                `${result.productId}|${result.variantId || ''}`,
                result.history,
              ])
            )
            const entries = chunk.flatMap((args) => {
              const history = byProduct.get(
                `${args.productId}|${args.variantId || ''}`
              )
              return history
                ? [
                    {
                      endpointName: 'getCustomerProductHistory' as const,
                      arg: args,
                      value: history,
                    },
                  ]
                : []
            })
            if (entries.length)
              dispatch(invoiceApi.util.upsertQueryEntries(entries))
          })
          // A failed batch just means the box asks for its own product when it opens.
          .catch(() => undefined)
          .finally(() => {
            keys.forEach((key) => inFlight.delete(key))
            notify()
          })
      }
    }, PREFETCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [productSet, customerId, excludeInvoiceId, dispatch, store])
}

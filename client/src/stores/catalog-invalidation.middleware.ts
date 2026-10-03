import { isFulfilled, type Middleware } from '@reduxjs/toolkit'
import { purchaseCatalogApi } from './purchaseCatalog.api'

// Product writes that change what the Invoice/Purchase/POS pickers show (new product,
// edited price/stock/active flag, delete, variants, branch sync, price updates, imports).
// The pickers read purchaseCatalogApi's own cache, which none of these slices can
// invalidate by themselves — so it's done once, here, instead of at every call site.
const WRITE_THUNKS = new Set([
  'product/addProduct',
  'product/updateProduct',
  'product/updateProductFlag',
  'product/deleteProduct',
  'product/bulkDeleteProducts',
  'product/bulkUpdateProducts',
  'product/bulkSetProductCategories',
  'product/bulkAddProducts',
])
const WRITE_APIS = new Set([
  'productApi',
  'productVariantApi',
  'productBranchSyncApi',
  'masterProductApi',
  'priceUpdateApi',
])

const DEBOUNCE_MS = 300

/**
 * Invalidates the purchasable catalog after any product write. Debounced so a burst
 * (bulk import + variants + branch sync) costs one refetch. invalidateTags only
 * refetches when a picker is mounted; otherwise the entry is simply dropped and the next
 * mount fetches fresh — so there are no extra requests while nobody is looking.
 */
export const catalogInvalidationMiddleware: Middleware = (api) => {
  let timer: ReturnType<typeof setTimeout> | undefined
  return (next) => (action) => {
    const result = next(action)
    if (isFulfilled(action)) {
      const meta = action.meta as { arg?: { type?: string; endpointName?: string } } | undefined
      const isQueryResult = meta?.arg?.type === 'query'
      const type = action.type
      const rtkqApi = type.split('/')[0]
      const isWrite =
        WRITE_THUNKS.has(type.replace(/\/fulfilled$/, '')) ||
        (!isQueryResult && WRITE_APIS.has(rtkqApi))
      if (isWrite) {
        if (timer) clearTimeout(timer)
        timer = setTimeout(() => {
          api.dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
        }, DEBOUNCE_MS)
      }
    }
    return result
  }
}

import { useMemo } from 'react'
import { useGetExpiringBatchesQuery } from '@/stores/batch.api'

// getExpiringBatches populates inventoryId -> productId server-side (see
// batch.service.js#getExpiringBatches), which the shared `Batch` interface doesn't
// model since every other endpoint returns inventoryId as a bare string.
interface PopulatedExpiringBatch {
  expiryDate?: string
  inventoryId?: { productId?: { _id?: string; id?: string } | string } | string
}

/**
 * Maps productId -> nearest expiry date among that product's active, soon-to-expire
 * batches. Works for both real variants and a simple product's hidden default variant
 * (see docs/architecture/universal-product-migration.md) — getExpiringBatches is
 * organization-scoped, not filtered by hasVariants.
 */
export function useExpiringBatchesByProduct(days = 30) {
  const { data: batches = [] } = useGetExpiringBatchesQuery(days)

  return useMemo(() => {
    const map = new Map<string, string>()
    ;(batches as unknown as PopulatedExpiringBatch[]).forEach((batch) => {
      const inventory = batch.inventoryId
      const product = typeof inventory === 'object' ? inventory?.productId : undefined
      const productId = typeof product === 'object' ? product?._id || product?.id : product
      if (!productId || !batch.expiryDate) return
      const existing = map.get(productId.toString())
      if (!existing || new Date(batch.expiryDate) < new Date(existing)) {
        map.set(productId.toString(), batch.expiryDate)
      }
    })
    return map
  }, [batches])
}

export function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

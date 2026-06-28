import { useGetProductQuery } from '@/stores/product.api'
import { VariantBatchPanel } from './variant-batch-panel'

/**
 * Batch/expiry management for a simple (non-variant) product, once it has
 * trackBatch/trackExpiry enabled — reuses VariantBatchPanel pointed at the product's
 * hidden default ProductVariant (see docs/architecture/universal-product-migration.md).
 * The default variant only exists after the product has been saved at least once with
 * tracking turned on, so this shows a hint instead of the panel until then.
 */
export function ProductDefaultVariantBatchPanel({
  productId,
  productName,
}: {
  productId: string
  productName: string
}) {
  const { data: product, isLoading } = useGetProductQuery(productId, { skip: !productId })

  if (isLoading) return null

  if (!product?.defaultVariantId) {
    return (
      <p className='text-xs text-muted-foreground'>
        Save the product to start tracking batches.
      </p>
    )
  }

  return <VariantBatchPanel variantId={product.defaultVariantId} variantLabel={productName} />
}

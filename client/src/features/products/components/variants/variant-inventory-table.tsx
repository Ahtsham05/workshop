import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetProductVariantsQuery } from '@/stores/productVariant.api'
import { useGetInventoryQuery } from '@/stores/inventory.api'
import type { ProductVariant } from '@/stores/productVariant.api'
import { VariantBatchPanel } from './variant-batch-panel'

function InventoryCell({ variantId }: { variantId: string }) {
  const { data: inventory, isLoading } = useGetInventoryQuery(variantId)
  if (isLoading) return <span className='text-muted-foreground'>…</span>
  return <span className='font-medium'>{inventory?.quantity ?? 0}</span>
}

function VariantRow({ variant }: { variant: ProductVariant }) {
  const id = variant._id || variant.id || ''
  const attributeLabel =
    Object.entries(variant.attributes || {})
      .map(([, value]) => value)
      .join(' / ') || (variant.isDefault ? 'Default (no variants)' : '—')

  return (
    <TableRow>
      <TableCell className='font-medium'>
        {attributeLabel}
        {variant.isDefault && (
          <Badge variant='outline' className='ml-2 text-xs'>
            legacy
          </Badge>
        )}
      </TableCell>
      <TableCell>{variant.sku || '—'}</TableCell>
      <TableCell>{variant.barcode || '—'}</TableCell>
      <TableCell>{variant.cost}</TableCell>
      <TableCell>{variant.price}</TableCell>
      <TableCell>
        <InventoryCell variantId={id} />
      </TableCell>
    </TableRow>
  )
}

/** Read-only: existing real variants for this product and their live Inventory.quantity. */
export function VariantInventoryTable({ productId }: { productId: string }) {
  const { data: variants = [], isLoading } = useGetProductVariantsQuery(productId)

  if (isLoading) {
    return <p className='text-sm text-muted-foreground'>Loading variants…</p>
  }
  if (variants.length === 0) {
    return null
  }

  return (
    <div className='space-y-2'>
      <p className='text-sm font-medium'>Existing variants</p>
      <div className='overflow-x-auto rounded-lg border border-border/60'>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Variant</TableHead>
              <TableHead>SKU</TableHead>
              <TableHead>Barcode</TableHead>
              <TableHead>Purchase price</TableHead>
              <TableHead>Sale price</TableHead>
              <TableHead>In stock</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <VariantRow key={variant._id || variant.id} variant={variant} />
            ))}
          </TableBody>
        </Table>
      </div>

      {variants
        .filter((v) => v.trackBatch || v.trackExpiry)
        .map((variant) => {
          const id = variant._id || variant.id || ''
          const label =
            Object.entries(variant.attributes || {}).map(([, value]) => value).join(' / ') || variant.sku || id
          return <VariantBatchPanel key={id} variantId={id} variantLabel={label} />
        })}
    </div>
  )
}

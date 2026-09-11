import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Wand2 } from 'lucide-react'
import { VariantAttributeSelector } from './variant-attribute-selector'
import { VariantManagementTable } from './variant-management-table'
import {
  generateVariantCombinations,
  type SelectedAttribute,
  type VariantDraftRow,
} from './generate-variant-combinations'

interface Props {
  draftVariants: VariantDraftRow[]
  onDraftVariantsChange: (rows: VariantDraftRow[]) => void
  productName?: string
}

/** First word of the product name, A-Z0-9 only, e.g. "Classic T-Shirt" -> "CLASSIC". */
function skuPrefixFromName(name?: string): string {
  return (name || '').trim().split(/\s+/)[0]?.toUpperCase().replace(/[^A-Z0-9]+/g, '') || ''
}

/**
 * Attribute selection + "Generate Variants" + editable management table.
 * Pure local component state — generated rows are only sent to the backend (as real
 * ProductVariant + Inventory rows) once the parent product form is submitted, since
 * the variant-create endpoint needs a saved productId first.
 */
export function ProductVariantsSection({ draftVariants, onDraftVariantsChange, productName }: Props) {
  const [selectedAttributes, setSelectedAttributes] = useState<SelectedAttribute[]>([])
  const canGenerate = selectedAttributes.some((a) => a.values.length > 0)

  const handleGenerate = () => {
    const generated = generateVariantCombinations(selectedAttributes, skuPrefixFromName(productName))
    // Preserve any already-edited sku/price/etc. for combinations that still exist;
    // re-generating shouldn't discard work the user already did on unaffected rows.
    const existingByKey = new Map(draftVariants.map((row) => [row.key, row]))
    const merged = generated.map((row) => existingByKey.get(row.key) || row)
    onDraftVariantsChange(merged)
  }

  return (
    <div className='space-y-4'>
      <VariantAttributeSelector selected={selectedAttributes} onChange={setSelectedAttributes} />

      <div className='flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-border/70 bg-muted/10 p-3'>
        <p className='text-xs text-muted-foreground'>
          {canGenerate
            ? 'Builds one row below per combination of the values you picked above.'
            : 'Pick at least one attribute value above, then generate a row for every combination.'}
        </p>
        <Button
          type='button'
          size='sm'
          disabled={!canGenerate}
          onClick={handleGenerate}
          className='shrink-0 gap-1.5'
        >
          <Wand2 className='h-3.5 w-3.5' />
          Generate Variants
        </Button>
      </div>

      {draftVariants.length > 0 && (
        <div className='space-y-2'>
          <div className='flex items-center gap-2'>
            <Badge variant='secondary' className='rounded-full px-2.5 font-semibold'>
              {draftVariants.length}
            </Badge>
            <p className='text-sm font-medium'>
              variant{draftVariants.length === 1 ? '' : 's'} — fill in SKU, barcode, pricing, and opening stock for each
            </p>
          </div>
          <VariantManagementTable rows={draftVariants} onChange={onDraftVariantsChange} />
        </div>
      )}
    </div>
  )
}

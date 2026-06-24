import { useState } from 'react'
import { Button } from '@/components/ui/button'
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
}

/**
 * Attribute selection + "Generate Variants" + editable management table.
 * Pure local component state — generated rows are only sent to the backend (as real
 * ProductVariant + Inventory rows) once the parent product form is submitted, since
 * the variant-create endpoint needs a saved productId first.
 */
export function ProductVariantsSection({ draftVariants, onDraftVariantsChange }: Props) {
  const [selectedAttributes, setSelectedAttributes] = useState<SelectedAttribute[]>([])

  const handleGenerate = () => {
    const generated = generateVariantCombinations(selectedAttributes)
    // Preserve any already-edited sku/price/etc. for combinations that still exist;
    // re-generating shouldn't discard work the user already did on unaffected rows.
    const existingByKey = new Map(draftVariants.map((row) => [row.key, row]))
    const merged = generated.map((row) => existingByKey.get(row.key) || row)
    onDraftVariantsChange(merged)
  }

  return (
    <div className='space-y-4'>
      <VariantAttributeSelector selected={selectedAttributes} onChange={setSelectedAttributes} />

      <Button
        type='button'
        variant='outline'
        size='sm'
        disabled={selectedAttributes.every((a) => a.values.length === 0)}
        onClick={handleGenerate}
      >
        Generate Variants
      </Button>

      {draftVariants.length > 0 && (
        <div className='space-y-2'>
          <p className='text-sm font-medium'>
            {draftVariants.length} variant{draftVariants.length === 1 ? '' : 's'} — fill in
            SKU, barcode, pricing, and opening stock for each
          </p>
          <VariantManagementTable rows={draftVariants} onChange={onDraftVariantsChange} />
        </div>
      )}
    </div>
  )
}

import { useRef } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'
import { generateBatchNumber, type VariantDraftRow } from './generate-variant-combinations'
import { focusField, onEnterAdvance } from '@/lib/invoice-form-keyboard'

interface Props {
  rows: VariantDraftRow[]
  onChange: (rows: VariantDraftRow[]) => void
}

/** Field order Enter cycles through for a row — batch/expiry only included once shown. */
function fieldOrderFor(row: VariantDraftRow): (keyof VariantDraftRow)[] {
  const base: (keyof VariantDraftRow)[] = ['sku', 'barcode', 'cost', 'price', 'quantity']
  return row.trackBatchOrExpiry && row.quantity > 0 ? [...base, 'batchNumber', 'expiryDate'] : base
}

/** Editable SKU / barcode / cost / price / opening-stock grid for generated variant combinations. */
export function VariantManagementTable({ rows, onChange }: Props) {
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const updateRow = (key: string, patch: Partial<VariantDraftRow>) => {
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)))
  }

  const removeRow = (key: string) => {
    onChange(rows.filter((row) => row.key !== key))
  }

  const setInputRef = (rowKey: string, field: string) => (el: HTMLInputElement | null) => {
    inputRefs.current[`${rowKey}:${field}`] = el
  }

  /** Enter moves to the next field in the row (or the next row's first field), with its
   *  text fully selected so typing immediately replaces it. */
  const advanceFrom = (rowIndex: number, field: keyof VariantDraftRow) => {
    const row = rows[rowIndex]
    const order = fieldOrderFor(row)
    const fieldIndex = order.indexOf(field)
    const nextField = order[fieldIndex + 1]
    if (nextField) {
      focusField(inputRefs.current[`${row.key}:${nextField}`])
      return
    }
    const nextRow = rows[rowIndex + 1]
    if (nextRow) {
      focusField(inputRefs.current[`${nextRow.key}:${fieldOrderFor(nextRow)[0]}`])
    }
  }

  if (rows.length === 0) return null

  return (
    <div className='overflow-x-auto rounded-lg border border-border/60'>
      <Table className='w-full table-fixed'>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[10%]'>Variant</TableHead>
            <TableHead className='w-[13%]'>SKU</TableHead>
            <TableHead className='w-[13%]'>Barcode</TableHead>
            <TableHead className='w-[9%]'>Purchase price</TableHead>
            <TableHead className='w-[9%]'>Sale price</TableHead>
            <TableHead className='w-[9%]'>Opening stock</TableHead>
            <TableHead className='w-[27%]'>Batches/expiry</TableHead>
            <TableHead className='w-12' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={row.key}>
              <TableCell className='truncate font-medium'>{row.label}</TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'sku')}
                  showVoiceInput={false}
                  className='h-8 w-full'
                  value={row.sku}
                  onChange={(e) => updateRow(row.key, { sku: e.target.value })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'sku'))}
                />
              </TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'barcode')}
                  showVoiceInput={false}
                  className='h-8 w-full'
                  value={row.barcode}
                  onChange={(e) => updateRow(row.key, { barcode: e.target.value })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'barcode'))}
                />
              </TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'cost')}
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-full'
                  value={row.cost}
                  onChange={(e) => updateRow(row.key, { cost: Number(e.target.value) || 0 })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'cost'))}
                />
              </TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'price')}
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-full'
                  value={row.price}
                  onChange={(e) => updateRow(row.key, { price: Number(e.target.value) || 0 })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'price'))}
                />
              </TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'quantity')}
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className='h-8 w-full'
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'quantity'))}
                />
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-1.5'>
                  <Checkbox
                    checked={row.trackBatchOrExpiry}
                    onCheckedChange={(checked) => {
                      const patch: Partial<VariantDraftRow> = { trackBatchOrExpiry: !!checked }
                      if (checked && !row.batchNumber) {
                        patch.batchNumber = generateBatchNumber()
                      }
                      updateRow(row.key, patch)
                    }}
                    title='Track batch numbers and expiry dates for this variant (pharmacy, grocery, perishables)'
                  />
                  {row.trackBatchOrExpiry && row.quantity > 0 && (
                    <>
                      <Input
                        ref={setInputRef(row.key, 'batchNumber')}
                        placeholder='Batch #'
                        showVoiceInput={false}
                        className='h-8 min-w-0 flex-1 text-xs'
                        value={row.batchNumber}
                        onChange={(e) => updateRow(row.key, { batchNumber: e.target.value })}
                        onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'batchNumber'))}
                      />
                      <Input
                        ref={setInputRef(row.key, 'expiryDate')}
                        type='date'
                        showVoiceInput={false}
                        className='h-8 w-[140px] shrink-0 text-xs pl-2 pr-1 [&::-webkit-calendar-picker-indicator]:ml-1'
                        value={row.expiryDate}
                        onChange={(e) => updateRow(row.key, { expiryDate: e.target.value })}
                        onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'expiryDate'))}
                      />
                    </>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <Button type='button' size='icon' variant='ghost' onClick={() => removeRow(row.key)}>
                  <X className='h-4 w-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

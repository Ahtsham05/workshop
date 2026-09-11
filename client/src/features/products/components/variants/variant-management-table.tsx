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
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { generateBatchNumber, type VariantDraftRow } from './generate-variant-combinations'
import { focusField, onEnterAdvance } from '@/lib/invoice-form-keyboard'
import { MarkupPercentInput } from '../markup-percent-input'

interface Props {
  rows: VariantDraftRow[]
  onChange: (rows: VariantDraftRow[]) => void
}

/** Field order Enter cycles through for a row — batch/expiry only included once shown.
 *  'margin' isn't a real VariantDraftRow field (it's the derived %-of-cost input next
 *  to Sale price) and is only a stop in the cycle once Purchase price is set — the
 *  margin input is disabled (and un-focusable) until then, same as it's greyed out visually. */
function fieldOrderFor(row: VariantDraftRow): string[] {
  const base = row.cost > 0
    ? ['sku', 'barcode', 'cost', 'price', 'margin', 'quantity']
    : ['sku', 'barcode', 'cost', 'price', 'quantity']
  return row.trackBatchOrExpiry && row.quantity > 0 ? [...base, 'batchNumber', 'expiryDate'] : base
}

const AVATAR_TINTS = [
  'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  'bg-amber-500/12 text-amber-600 dark:text-amber-400',
  'bg-indigo-500/12 text-indigo-600 dark:text-indigo-400',
  'bg-rose-500/12 text-rose-600 dark:text-rose-400',
]

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
  const advanceFrom = (rowIndex: number, field: string) => {
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
    <div className='overflow-hidden rounded-xl border border-border/60 shadow-sm'>
      <Table className='w-full table-fixed'>
        <TableHeader>
          <TableRow className='hover:bg-transparent'>
            <TableHead className='w-[12%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Variant</TableHead>
            <TableHead className='w-[12%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>SKU</TableHead>
            <TableHead className='w-[12%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Barcode</TableHead>
            <TableHead className='w-[8%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Purchase price</TableHead>
            <TableHead className='w-[15%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Sale price</TableHead>
            <TableHead className='w-[9%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Opening stock</TableHead>
            <TableHead className='w-[22%] bg-muted/40 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Batch / expiry</TableHead>
            <TableHead className='w-10 bg-muted/40' />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, rowIndex) => (
            <TableRow key={row.key} className='transition-colors hover:bg-muted/30'>
              <TableCell className='align-middle'>
                <div className='flex min-w-0 items-center gap-2'>
                  <span
                    className={cn(
                      'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold',
                      AVATAR_TINTS[rowIndex % AVATAR_TINTS.length]
                    )}
                  >
                    {row.label.charAt(0).toUpperCase() || '?'}
                  </span>
                  <span className='truncate text-sm font-medium' title={row.label}>{row.label}</span>
                </div>
              </TableCell>
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
                <div className='flex items-center gap-1.5'>
                  <Input
                    ref={setInputRef(row.key, 'price')}
                    type='number'
                    min={0}
                    showVoiceInput={false}
                    className='h-8 min-w-0 flex-1'
                    value={row.price}
                    onChange={(e) => updateRow(row.key, { price: Number(e.target.value) || 0 })}
                    onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'price'))}
                  />
                  <MarkupPercentInput
                    compact
                    className='w-16 shrink-0'
                    cost={row.cost || 0}
                    price={row.price || 0}
                    onPriceChange={(next) => updateRow(row.key, { price: next })}
                    inputRef={setInputRef(row.key, 'margin')}
                    onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'margin'))}
                  />
                </div>
              </TableCell>
              <TableCell>
                <Input
                  ref={setInputRef(row.key, 'quantity')}
                  type='number'
                  min={0}
                  showVoiceInput={false}
                  className={cn(
                    'h-8 w-full font-medium',
                    row.quantity > 0 && 'text-emerald-600 dark:text-emerald-400'
                  )}
                  value={row.quantity}
                  onChange={(e) => updateRow(row.key, { quantity: Number(e.target.value) || 0 })}
                  onKeyDown={(e) => onEnterAdvance(e, () => advanceFrom(rowIndex, 'quantity'))}
                />
              </TableCell>
              <TableCell>
                <div className='flex items-center gap-1.5'>
                  <div className='flex shrink-0 items-center gap-1 text-[11px] text-muted-foreground'>
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
                    Batch
                  </div>
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
                <Button
                  type='button'
                  size='icon'
                  variant='ghost'
                  title='Remove variant'
                  onClick={() => removeRow(row.key)}
                  className='text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                >
                  <Trash2 className='h-4 w-4' />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

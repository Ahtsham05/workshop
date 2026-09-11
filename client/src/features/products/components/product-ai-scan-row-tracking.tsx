import { useState } from 'react'
import { useSelector } from 'react-redux'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScanLine } from 'lucide-react'
import type { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isMobileShopBusiness } from '@/lib/business-types'
import { ImportSerialEntryDialog } from './import-serial-entry-dialog'
import { generateBatchNumber } from './variants/generate-variant-combinations'
import type { ScannedProduct } from './product-ai-scan-dialog'

interface ProductAiScanRowTrackingProps {
  row: ScannedProduct
  onChange: (patch: Partial<ScannedProduct>) => void
}

/**
 * Per-row IMEI/Serial/Batch/Expiry control for the AI Scan & manual bulk-add table —
 * same interaction and fields as the "SKU / barcode & scanning" and "Pricing &
 * inventory" panels in users-action-dialog.tsx (the single Add Product dialog), just
 * compacted into one popover since a bulk table can't afford a full panel per row.
 * IMEI/Serial number entry itself reuses ImportSerialEntryDialog as-is — the same
 * component the "Import from other branches" dialog already uses for this.
 */
export function ProductAiScanRowTracking({ row, onChange }: ProductAiScanRowTrackingProps) {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  // IMEI tracking only makes sense for mobile phones — same gate users-action-dialog.tsx
  // uses. Serial number tracking applies to every business type.
  const isMobileShop = isMobileShopBusiness(orgData?.businessType || user?.businessType)

  const [serialDialogOpen, setSerialDialogOpen] = useState(false)

  const stockQuantity = Number(row.stockQuantity) || 0
  const productName = row.name.trim() || row.nameUrdu.trim() || 'This product'

  const mode: 'none' | 'imei' | 'serial' = row.trackImei ? 'imei' : row.trackSerial ? 'serial' : 'none'
  // A product tracks one identifier or the other, never both — same rule the single
  // Add Product dialog enforces. Modeled as three mutually-exclusive checkboxes (rather
  // than leaving it possible to uncheck into an ambiguous state) so choosing a mode is
  // always one click, and switching modes clears any numbers entered under the old one
  // since an IMEI list and a serial-number list aren't interchangeable.
  const setMode = (next: 'none' | 'imei' | 'serial') => {
    if (next === mode) return
    onChange({ trackImei: next === 'imei', trackSerial: next === 'serial', imeis: [] })
  }

  const toggleTrackBatch = (checked: boolean) => {
    onChange({ trackBatch: checked, batchNumber: checked && !row.batchNumber ? generateBatchNumber() : row.batchNumber })
  }
  const toggleTrackExpiry = (checked: boolean) => {
    onChange({ trackExpiry: checked, batchNumber: checked && !row.batchNumber ? generateBatchNumber() : row.batchNumber })
  }

  const isTrackingUnits = mode !== 'none'
  const isTrackingBatch = row.trackBatch || row.trackExpiry
  const isTracking = isTrackingUnits || isTrackingBatch
  const unitsMet = stockQuantity > 0 && row.imeis.length >= stockQuantity

  return (
    <>
      <Popover>
        <PopoverTrigger asChild>
          <button
            type='button'
            className={`inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] font-medium transition-colors ${
              !isTracking
                ? 'border-dashed border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground/60'
                : isTrackingUnits
                  ? unitsMet
                    ? 'border-green-300 bg-green-50 text-green-700 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
                    : 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
                  : 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-400'
            }`}
          >
            <ScanLine className='h-3 w-3 shrink-0' />
            {!isTracking
              ? 'None'
              : isTrackingUnits
                ? `${mode === 'serial' ? 'Serial' : 'IMEI'} ${row.imeis.length}/${stockQuantity}`
                : `Batch${row.batchNumber ? ` ${row.batchNumber}` : ''}`}
          </button>
        </PopoverTrigger>
        <PopoverContent className='w-80 space-y-3' align='start'>
          <div className='space-y-1.5'>
            <p className='text-xs font-semibold text-foreground'>Per-unit tracking</p>
            <label className='flex items-start gap-2'>
              <Checkbox checked={mode === 'none'} onCheckedChange={() => setMode('none')} className='mt-0.5' />
              <span className='text-xs text-muted-foreground'>None</span>
            </label>
            {isMobileShop && (
              <label className='flex items-start gap-2'>
                <Checkbox checked={mode === 'imei'} onCheckedChange={() => setMode('imei')} className='mt-0.5' />
                <span className='text-xs text-muted-foreground'>Track IMEI (mobile phones)</span>
              </label>
            )}
            <label className='flex items-start gap-2'>
              <Checkbox checked={mode === 'serial'} onCheckedChange={() => setMode('serial')} className='mt-0.5' />
              <span className='text-xs text-muted-foreground'>Track Serial Number (TVs, laptops, appliances)</span>
            </label>
          </div>

          {isTrackingUnits && (
            <div className='space-y-2 border-t pt-2'>
              <div className='flex flex-col gap-1'>
                <label className='text-[10px] font-medium text-muted-foreground'>Warranty (months)</label>
                <Input
                  type='number'
                  min={0}
                  step={1}
                  showVoiceInput={false}
                  placeholder='0'
                  value={row.warrantyMonths}
                  onChange={(e) => onChange({ warrantyMonths: e.target.value })}
                  className='h-7 text-xs'
                />
              </div>
              <Button
                type='button'
                size='sm'
                variant='outline'
                className='w-full text-xs'
                disabled={stockQuantity <= 0}
                onClick={() => setSerialDialogOpen(true)}
              >
                {row.imeis.length}/{stockQuantity} {mode === 'serial' ? 'serial numbers' : 'IMEIs'} entered
              </Button>
              {stockQuantity <= 0 && (
                <p className='text-[10px] text-muted-foreground'>Set a stock quantity first.</p>
              )}
            </div>
          )}

          <div className='space-y-1.5 border-t pt-2'>
            <p className='text-xs font-semibold text-foreground'>Batch &amp; expiry</p>
            <label className='flex items-start gap-2'>
              <Checkbox checked={row.trackBatch} onCheckedChange={(c) => toggleTrackBatch(!!c)} className='mt-0.5' />
              <span className='text-xs text-muted-foreground'>Track batch numbers</span>
            </label>
            <label className='flex items-start gap-2'>
              <Checkbox checked={row.trackExpiry} onCheckedChange={(c) => toggleTrackExpiry(!!c)} className='mt-0.5' />
              <span className='text-xs text-muted-foreground'>Track expiry dates</span>
            </label>
          </div>

          {isTrackingBatch && (
            <div className='space-y-2 border-t pt-2'>
              <div className='flex flex-col gap-1'>
                <label className='text-[10px] font-medium text-muted-foreground'>Batch number</label>
                <Input
                  showVoiceInput={false}
                  placeholder='e.g. BATCH-250911-001'
                  value={row.batchNumber}
                  onChange={(e) => onChange({ batchNumber: e.target.value })}
                  className='h-7 text-xs'
                />
              </div>
              {row.trackExpiry && (
                <div className='flex flex-col gap-1'>
                  <label className='text-[10px] font-medium text-muted-foreground'>Expiry date</label>
                  <Input
                    type='date'
                    value={row.expiryDate}
                    onChange={(e) => onChange({ expiryDate: e.target.value })}
                    className='h-7 text-xs'
                  />
                </div>
              )}
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ImportSerialEntryDialog
        open={serialDialogOpen}
        onOpenChange={setSerialDialogOpen}
        productName={productName}
        isSerial={mode === 'serial'}
        targetCount={stockQuantity}
        value={row.imeis}
        onChange={(next) => onChange({ imeis: next })}
      />
    </>
  )
}

import { useState } from 'react'
import { Check, Loader2, Shapes } from 'lucide-react'
import { toast } from 'sonner'
import {
  useBulkClassifyProductsMutation,
  type ProcurementType,
  type ProductType,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  PROCUREMENT_LABELS,
  PRODUCT_TYPES,
  PRODUCT_TYPE_META,
} from '../lib/constants'

const NONE = '__none__'
const KEEP = '__keep__'

/** One line under each type, so the choice is clear without knowing the jargon. */
const TYPE_HINTS: Record<ProductType, string> = {
  raw_material: 'Bought in and used up in production',
  component: 'Bought-in part fitted into a product',
  packaging_material: 'Bottles, cartons, labels, bags',
  sub_assembly: 'Made here, used inside a bigger product',
  wip: 'Partly made, between production steps',
  finished_good: 'Made here and sold',
  by_product: 'Comes out alongside the main product',
  scrap: 'Waste or rejects with a resale value',
  service: 'Labour or outside work — no stock',
}

/**
 * Bulk "Set product type" for the Manufacturing products list: one type (or none) for
 * every selected product, and optionally how they are procured, in one call.
 */
export function BulkTypeDialog({
  productIds,
  onClose,
  onApplied,
}: {
  productIds: string[]
  onClose: () => void
  onApplied: () => void
}) {
  const { t } = useLanguage()
  const [type, setType] = useState<string>('')
  const [procurement, setProcurement] = useState<string>(KEEP)
  const [bulkClassify, { isLoading }] = useBulkClassifyProductsMutation()
  const count = productIds.length

  const apply = async () => {
    if (!type || !count) return
    try {
      const res = await bulkClassify({
        productIds,
        productType: type === NONE ? null : (type as ProductType),
        ...(procurement === KEEP
          ? {}
          : {
              procurementType:
                procurement === NONE ? null : (procurement as ProcurementType),
            }),
      }).unwrap()
      toast.success(
        t('{{count}} product(s) updated').replace('{{count}}', String(res.modified))
      )
      onApplied()
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to classify products')))
    }
  }

  const option = (value: string, label: string, hint: string, className?: string) => {
    const active = type === value
    return (
      <button
        key={value}
        type='button'
        role='radio'
        aria-checked={active}
        onClick={() => setType(value)}
        className={cn(
          'relative flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition-colors',
          active
            ? 'border-primary bg-primary/5 ring-primary/30 ring-1'
            : 'hover:bg-muted/50'
        )}
      >
        <span
          className={cn(
            'rounded-md border px-1.5 py-0.5 text-xs font-medium',
            className || 'text-muted-foreground border-dashed'
          )}
        >
          {label}
        </span>
        <span className='text-muted-foreground text-xs leading-snug'>{hint}</span>
        {active && (
          <Check className='text-primary absolute top-2.5 right-2.5 h-4 w-4' />
        )}
      </button>
    )
  }

  return (
    <Dialog open onOpenChange={(o) => !o && !isLoading && onClose()}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Shapes className='h-5 w-5' />
            {t('Set product type')} ({count})
          </DialogTitle>
          <DialogDescription>
            {t(
              'Choose what the selected products are in production. Their stock, prices and history stay as they are.'
            )}
          </DialogDescription>
        </DialogHeader>

        <div
          role='radiogroup'
          aria-label={t('Product type')}
          className='grid grid-cols-1 gap-2 sm:grid-cols-3'
        >
          {PRODUCT_TYPES.map((pt) =>
            option(
              pt,
              t(PRODUCT_TYPE_META[pt].label),
              t(TYPE_HINTS[pt]),
              PRODUCT_TYPE_META[pt].className
            )
          )}
          {option(NONE, t('Unclassified'), t('Clear the type — not used in production'))}
        </div>

        <div className='space-y-1.5'>
          <div className='text-sm font-medium'>{t('Procurement')}</div>
          <div className='flex flex-wrap gap-1.5'>
            {(
              [
                [KEEP, t('Keep as is')],
                ...(Object.keys(PROCUREMENT_LABELS) as ProcurementType[]).map(
                  (p) => [p, t(PROCUREMENT_LABELS[p])] as const
                ),
                [NONE, t('Not set')],
              ] as const
            ).map(([value, label]) => (
              <Button
                key={value}
                type='button'
                size='sm'
                variant={procurement === value ? 'default' : 'outline'}
                className='h-8'
                aria-pressed={procurement === value}
                onClick={() => setProcurement(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant='outline' onClick={onClose} disabled={isLoading}>
            {t('Cancel')}
          </Button>
          <Button onClick={apply} disabled={!type || isLoading}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Apply to {{count}} products').replace('{{count}}', String(count))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

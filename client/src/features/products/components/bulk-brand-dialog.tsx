import { useState } from 'react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Award, Loader2 } from 'lucide-react'
import { AppDispatch } from '@/stores/store'
import { bulkSetProductBrand } from '@/stores/product.slice'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { BrandSelector } from './brand-selector'
import type { BulkProductTarget } from './bulk-category-dialog'

const PREVIEW_LIMIT = 5

interface BulkBrandDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: BulkProductTarget[]
  onApplied: () => void
}

/**
 * "Set brand" for the selected products: one brand on all of them (pick or create it
 * inline), or the brand removed from all of them. Replaces each product's current brand.
 */
export function BulkBrandDialog({ open, onOpenChange, products, onApplied }: BulkBrandDialogProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const [mode, setMode] = useState<'set' | 'clear'>('set')
  const [brandId, setBrandId] = useState<string | undefined>()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const count = products.length
  const previewNames = products.slice(0, PREVIEW_LIMIT).map((p) => p.name || 'Unnamed product')
  const remaining = count - previewNames.length
  const canApply = count > 0 && (mode === 'clear' || !!brandId)

  const reset = () => {
    setMode('set')
    setBrandId(undefined)
  }

  const handleClose = (nextOpen: boolean) => {
    if (isSubmitting) return
    onOpenChange(nextOpen)
    if (!nextOpen) reset()
  }

  const handleApply = async () => {
    if (!canApply) return
    setIsSubmitting(true)
    try {
      const productIds = products.map((p) => p._id || p.id || '').filter(Boolean)
      const result = await dispatch(
        bulkSetProductBrand({ productIds, brandId: mode === 'clear' ? null : brandId! })
      )
      if (result.meta.requestStatus !== 'fulfilled') {
        throw new Error((result.payload as string) || 'Bulk brand update failed')
      }
      const payload = result.payload as { modifiedCount?: number; brand?: { name: string } | null }
      const n = payload?.modifiedCount ?? productIds.length
      toast.success(
        mode === 'clear'
          ? `Removed the brand from ${n} product(s)`
          : `Set brand "${payload?.brand?.name ?? ''}" on ${n} product(s)`
      )
      onOpenChange(false)
      reset()
      onApplied()
    } catch (error) {
      toast.error(error instanceof Error && error.message ? error.message : 'Failed to update brand')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <Award className='h-5 w-5' />
            {t('Set Brand')} ({count})
          </DialogTitle>
          <DialogDescription>
            {t('Choose one brand for every selected product. This replaces whatever brand each product has now.')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-4'>
          <div className='bg-muted/40 flex flex-wrap gap-1.5 rounded-md border p-2'>
            {previewNames.map((name, i) => (
              <Badge key={i} variant='secondary' className='max-w-[12rem] truncate font-normal'>
                {name}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge variant='outline' className='font-normal'>
                {t('and_more_products', { count: remaining })}
              </Badge>
            )}
          </div>

          <div role='radiogroup' aria-label={t('Brand action')} className='grid grid-cols-2 gap-2'>
            {(
              [
                ['set', t('Set a brand')],
                ['clear', t('Remove brand')],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type='button'
                role='radio'
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn(
                  'rounded-md border px-3 py-2 text-sm font-medium transition-colors',
                  mode === value
                    ? 'border-primary bg-primary/5 text-foreground ring-primary/30 ring-1'
                    : 'text-muted-foreground hover:bg-muted/50'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {mode === 'set' ? (
            <div className='space-y-1.5'>
              <label className='text-sm font-medium'>{t('Brand')}</label>
              <BrandSelector value={brandId} onChange={setBrandId} />
            </div>
          ) : (
            <Alert>
              <AlertDescription>
                {t('The selected products will be left without a brand.')}
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => handleClose(false)} disabled={isSubmitting}>
            {t('cancel')}
          </Button>
          <Button
            type='button'
            variant={mode === 'clear' ? 'destructive' : 'default'}
            onClick={handleApply}
            disabled={isSubmitting || !canApply}
          >
            {isSubmitting && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('apply_to_products', { count })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

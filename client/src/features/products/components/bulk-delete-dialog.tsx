import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { AppDispatch } from '@/stores/store'
import { bulkDeleteProducts } from '@/stores/product.slice'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { useLanguage } from '@/context/language-context'
import { Product } from '../data/schema'

const CONFIRM_WORD = 'DELETE'
const PREVIEW_LIMIT = 5

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  products: Product[]
  onDeleted: () => void
}

export function BulkDeleteDialog({ open, onOpenChange, products, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const count = products.length
  const previewNames = products.slice(0, PREVIEW_LIMIT).map((p) => p.name || 'Unnamed product')
  const remaining = count - previewNames.length

  const reset = () => {
    setConfirmText('')
    setIsDeleting(false)
  }

  const handleClose = (nextOpen: boolean) => {
    if (!isDeleting) {
      onOpenChange(nextOpen)
      if (!nextOpen) reset()
    }
  }

  const handleDelete = async () => {
    if (confirmText.trim().toUpperCase() !== CONFIRM_WORD || count === 0) return

    setIsDeleting(true)
    try {
      const ids = products.map((p) => p._id || p.id || '').filter(Boolean)
      const result = await dispatch(bulkDeleteProducts(ids))

      if (result.meta.requestStatus === 'fulfilled') {
        const payload = result.payload as { deletedCount?: number; notFoundIds?: string[] }
        const deletedCount = payload?.deletedCount ?? ids.length

        if (deletedCount < ids.length) {
          toast.success(`${deletedCount} ${t('bulk_delete_partial')}`)
        } else {
          toast.success(`${deletedCount} ${t('bulk_delete_success')}`)
        }

        // Same cross-slice cache invalidation the per-row/bulk status actions use —
        // Invoice/Purchase/POS pickers read from purchaseCatalogApi's own RTK Query
        // cache, which won't otherwise learn these products are gone.
        dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))

        onOpenChange(false)
        reset()
        onDeleted()
      } else {
        throw new Error((result.payload as string) || 'Bulk delete failed')
      }
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast.error(t('bulk_delete_failed'))
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={handleClose}
      handleConfirm={handleDelete}
      disabled={confirmText.trim().toUpperCase() !== CONFIRM_WORD}
      isLoading={isDeleting}
      className='sm:max-w-md'
      title={
        <span className='text-destructive'>
          <IconAlertTriangle className='stroke-destructive mr-1 inline-block' size={18} />{' '}
          {t('bulk_delete_products')} ({count})
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p>
            {t('bulk_delete_confirmation')} <span className='font-bold'>{count}</span>{' '}
            {t('bulk_delete_confirmation_suffix')}
          </p>

          <div className='flex flex-wrap gap-1.5 rounded-md border bg-muted/40 p-2'>
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

          <Label className='my-2'>
            {t('bulk_delete_type_to_confirm')}
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={t('bulk_delete_placeholder')}
              autoComplete='off'
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>{t('warning')}</AlertTitle>
            <AlertDescription>{t('delete_operation_warning')}</AlertDescription>
          </Alert>
        </div>
      }
      confirmText={t('delete')}
      destructive
    />
  )
}

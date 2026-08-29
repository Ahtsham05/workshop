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
import { bulkDeleteCustomers } from '@/stores/customer.slice'
import { useLanguage } from '@/context/language-context'
import { Customer } from '../data/schema'

const CONFIRM_WORD = 'DELETE'
const PREVIEW_LIMIT = 5

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customers: Customer[]
  onDeleted: () => void
}

export function BulkDeleteDialog({ open, onOpenChange, customers, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const count = customers.length
  const previewNames = customers.slice(0, PREVIEW_LIMIT).map((c) => c.name || 'Unnamed customer')
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
      const ids = customers.map((c) => c._id || c.id || '').filter(Boolean)
      const result = await dispatch(bulkDeleteCustomers(ids))

      if (result.meta.requestStatus === 'fulfilled') {
        const payload = result.payload as { deletedCount?: number; notFoundIds?: string[] }
        const deletedCount = payload?.deletedCount ?? ids.length

        if (deletedCount < ids.length) {
          toast.success(`${deletedCount} ${t('bulk_delete_customers_partial')}`)
        } else {
          toast.success(`${deletedCount} ${t('bulk_delete_customers_success')}`)
        }

        onOpenChange(false)
        reset()
        onDeleted()
      } else {
        throw new Error((result.payload as string) || 'Bulk delete failed')
      }
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast.error(t('bulk_delete_customers_failed'))
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
          {t('bulk_delete_customers')} ({count})
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p>
            {t('bulk_delete_confirmation')} <span className='font-bold'>{count}</span>{' '}
            {t('bulk_delete_customers_confirmation_suffix')}
          </p>

          <div className='flex flex-wrap gap-1.5 rounded-md border bg-muted/40 p-2'>
            {previewNames.map((name, i) => (
              <Badge key={i} variant='secondary' className='max-w-[12rem] truncate font-normal'>
                {name}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge variant='outline' className='font-normal'>
                {t('and_more_customers', { count: remaining })}
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

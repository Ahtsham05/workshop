'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Product } from '../data/schema'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteProduct } from '@/stores/product.slice'
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Product
  setFetch: any
}

export function UsersDeleteDialog({ open, onOpenChange, currentRow, setFetch }: Props) {
  const [value, setValue] = useState('')
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const handleDelete = async() => {
    if (value.trim() !== currentRow.name) return

    onOpenChange(false)
    await dispatch(deleteProduct(currentRow.id || currentRow._id)).then(()=>{
      toast.success(t('product_deleted_successfully'))
      setFetch((prev: any) => !prev)
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.name}
      title={
        <span className='text-destructive'>
          <IconAlertTriangle
            className='stroke-destructive mr-1 inline-block'
            size={18}
          />{' '}
          {t('delete_product')}
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            {t('delete_product_confirmation')} <span className='font-bold'>{currentRow.name}</span>?
            <br />
            {t('delete_product_warning')} <span className='font-bold'>{currentRow.name.toUpperCase()}</span> {t('delete_product_warning_suffix')}
          </p>

          <Label className='my-2'>
            {t('product_name')}:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('delete_product_placeholder')}
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>{t('warning')}</AlertTitle>
            <AlertDescription>
              {t('delete_operation_warning')}
            </AlertDescription>
          </Alert>
        </div>
      }
      confirmText={t('delete')}
      destructive
    />
  )
}

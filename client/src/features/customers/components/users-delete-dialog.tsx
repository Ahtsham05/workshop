'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Customer } from '../data/schema' // Changed to Customer
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteCustomer } from '@/stores/customer.slice' // Changed to deleteCustomer
import toast from 'react-hot-toast'
import { useLanguage } from '@/context/language-context'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: Customer // Changed from User to Customer
  setFetch: any
}

export function CustomersDeleteDialog({ open, onOpenChange, currentRow, setFetch }: Props) {
  const [value, setValue] = useState('')
  const dispatch = useDispatch<AppDispatch>()
  const { t } = useLanguage()

  const handleDelete = async () => {
    if (value.trim() !== currentRow.name) return

    onOpenChange(false)
    await dispatch(deleteCustomer(currentRow.id)).then(() => {
      toast.success(t('customer_deleted_success'))
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
          {t('delete_customer')}
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            {t('delete_confirmation')}{' '}
            <span className='font-bold'>{currentRow.name}</span>?
            <br />
            {t('delete_customer_warning')}{' '}
            <span className='font-bold'>
              {currentRow.name.toUpperCase()}
            </span>{' '}
            {t('from_system')}
          </p>

          <Label className='my-2'>
            {t('customer_name')}:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder={t('enter_customer_name_confirm')}
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>{t('warning')}</AlertTitle>
            <AlertDescription>
              {t('operation_warning')}
            </AlertDescription>
          </Alert>
        </div>
      }
      confirmText={t('delete')}
      destructive
    />
  )
}

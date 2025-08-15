'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { sale } from '../data/schema'  // Changed from Customer to Supplier
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import toast from 'react-hot-toast'
import { deleteSale } from '@/stores/sale.slice'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: sale  // Changed from Customer to Supplier
  setFetch: any
}

export function SuppliersDeleteDialog({ open, onOpenChange, currentRow, setFetch }: Props) {
  const [value, setValue] = useState('')
  const dispatch = useDispatch<AppDispatch>()

  const handleDelete = async () => {
    if (value.trim() !== currentRow?.invoiceNumber) return

    onOpenChange(false)
    await dispatch(deleteSale(currentRow.id)).then(() => {
      toast.success('Purchase deleted successfully')
      setFetch((prev: any) => !prev)
    })
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.invoiceNumber}
      title={
        <span className='text-destructive'>
          <IconAlertTriangle
            className='stroke-destructive mr-1 inline-block'
            size={18}
          />{' '}
          Delete Supplier
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>{currentRow.invoiceNumber}</span>?
            <br />
            This action will permanently remove the Purchase{' '}
            <span className='font-bold'>
              {currentRow?.invoiceNumber}
            </span>{' '}
            from the system. This cannot be undone.
          </p>

          <Label className='my-2'>
            Purchase:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder='Enter Purchase Invoice Number to confirm deletion.'
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription>
              Please be careful, this operation cannot be rolled back.
            </AlertDescription>
          </Alert>
        </div>
      }
      confirmText='Delete'
      destructive
    />
  )
}

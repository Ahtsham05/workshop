'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeleteInvoiceMutation } from '@/stores/invoice.api'
import toast from 'react-hot-toast'
// import { useLanguage } from '@/context/language-context'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: any // Invoice object
}

export function InvoiceDeleteDialog({ open, onOpenChange, currentRow }: Props) {
  const [value, setValue] = useState('')
  const [deleteInvoice, { isLoading }] = useDeleteInvoiceMutation()
  // const { t } = useLanguage()

  const handleDelete = async () => {
    if (value.trim() !== currentRow.invoiceNumber) return

    try {
      await deleteInvoice(currentRow._id).unwrap()
      toast.success('Invoice deleted successfully!')
      onOpenChange(false)
      setValue('')
    } catch (error: any) {
      console.error('Failed to delete invoice:', error)
      toast.error(error?.data?.message || 'Failed to delete invoice')
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(open) => {
        onOpenChange(open)
        if (!open) setValue('')
      }}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.invoiceNumber || isLoading}
      title={
        <span className='text-destructive'>
          <IconAlertTriangle
            className='stroke-destructive mr-1 inline-block'
            size={18}
          />{' '}
          Delete Invoice
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p className='mb-2'>
            Are you sure you want to delete{' '}
            <span className='font-bold'>{currentRow.invoiceNumber}</span>?
            <br />
            This will permanently remove the invoice{' '}
            <span className='font-bold'>
              {currentRow.invoiceNumber.toUpperCase()}
            </span>{' '}
            from the system.
          </p>

          <Label className='my-2'>
            Invoice Number:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter invoice number to confirm"
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
      confirmText="Delete"
      destructive
    />
  )
}

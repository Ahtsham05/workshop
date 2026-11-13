'use client'

import { useEffect, useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDeletePurchaseMutation } from '@/stores/purchase.api'
import toast from 'react-hot-toast'
// import { useLanguage } from '@/context/language-context'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: any // Invoice object
  /** Called once the delete has gone through — e.g. to close a view showing the record. */
  onDeleted?: () => void
}

export function InvoiceDeleteDialog({ open, onOpenChange, currentRow, onDeleted }: Props) {
  // Auto-filled with the invoice number so the user only has to press Delete.
  const [value, setValue] = useState<string>(currentRow?.invoiceNumber ?? '')
  useEffect(() => {
    if (open) setValue(currentRow?.invoiceNumber ?? '')
  }, [open, currentRow?.invoiceNumber])
  const [deletePurchase, { isLoading }] = useDeletePurchaseMutation()
  // const { t } = useLanguage()

  const handleDelete = async () => {
    if (value.trim() !== currentRow.invoiceNumber.trim()) return

    try {
      const purchaseId = currentRow._id || currentRow.id
      if (!purchaseId) {
        toast.error('Purchase ID is missing')
        return
      }
      
      await deletePurchase(purchaseId).unwrap()
      toast.success('Purchase deleted successfully!')
      onOpenChange(false)
      setValue('')
      onDeleted?.()
    } catch (error: any) {
      console.error('Failed to delete purchase:', error)
      toast.error(error?.data?.message || 'Failed to delete purchase')
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
      disabled={value.trim() !== currentRow.invoiceNumber.trim() || isLoading}
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
            <span className='font-bold'>{currentRow.invoiceNumber}</span>
            {currentRow.vendorBillNumber && (
              <span className='text-muted-foreground'> (Vendor Bill No: {currentRow.vendorBillNumber})</span>
            )}
            ?
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
              autoComplete='off'
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

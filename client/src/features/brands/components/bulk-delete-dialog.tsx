import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import toast from 'react-hot-toast'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useBulkDeleteBrandsMutation, type Brand } from '@/stores/brand.api'

const CONFIRM_WORD = 'DELETE'
const PREVIEW_LIMIT = 5

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  brands: Brand[]
  onDeleted: () => void
}

export function BulkDeleteDialog({ open, onOpenChange, brands, onDeleted }: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [bulkDeleteBrands] = useBulkDeleteBrandsMutation()
  const [isDeleting, setIsDeleting] = useState(false)

  const count = brands.length
  const previewNames = brands.slice(0, PREVIEW_LIMIT).map((b) => b.name || 'Unnamed brand')
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
      const ids = brands.map((b) => b._id || b.id || '').filter(Boolean)
      const result = await bulkDeleteBrands(ids).unwrap()
      const deletedCount = result?.deletedCount ?? ids.length

      if (deletedCount < ids.length) {
        toast.success(`${deletedCount} of ${ids.length} selected brands were deactivated`)
      } else {
        toast.success(`${deletedCount} brand(s) deactivated`)
      }

      onOpenChange(false)
      reset()
      onDeleted()
    } catch (error) {
      console.error('Bulk delete error:', error)
      toast.error('Failed to deactivate selected brands')
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
          Delete Brands ({count})
        </span>
      }
      desc={
        <div className='space-y-4'>
          <p>
            You are about to deactivate <span className='font-bold'>{count}</span> brand(s).
            Products that already reference them keep working — they just won't be selectable
            for new/edited products until reactivated.
          </p>

          <div className='flex flex-wrap gap-1.5 rounded-md border bg-muted/40 p-2'>
            {previewNames.map((name, i) => (
              <Badge key={i} variant='secondary' className='max-w-[12rem] truncate font-normal'>
                {name}
              </Badge>
            ))}
            {remaining > 0 && (
              <Badge variant='outline' className='font-normal'>
                and {remaining} more
              </Badge>
            )}
          </div>

          <Label className='my-2'>
            Type DELETE to confirm
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder='Type DELETE'
              autoComplete='off'
            />
          </Label>

          <Alert variant='destructive'>
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>This deactivates every selected brand at once.</AlertDescription>
          </Alert>
        </div>
      }
      confirmText='Delete'
      destructive
    />
  )
}

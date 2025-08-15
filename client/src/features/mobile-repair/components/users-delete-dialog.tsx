'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { MobileRepair } from '../data/schema'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteMobileRepair } from '@/stores/mobileRepair.slice'
import toast from 'react-hot-toast'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow: MobileRepair
  setFetch: any
}

export function MobileRepairDeleteDialog({ open, onOpenChange, currentRow, setFetch }: Props) {
  const [value, setValue] = useState('')
  const dispatch = useDispatch<AppDispatch>()

  const handleDelete = async () => {
    if (value.trim() !== currentRow.name) return

    onOpenChange(false)
    await dispatch(deleteMobileRepair(currentRow.id ?? currentRow._id)).then(() => {
      toast.success('Mobile Repair deleted successfully')
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
        <span className="text-destructive">
          <IconAlertTriangle className="stroke-destructive mr-1 inline-block" size={18} /> Delete Mobile Repair
        </span>
      }
      desc={
        <div className="space-y-4">
          <p className="mb-2">
            Are you sure you want to delete <span className="font-bold">{currentRow.name}</span>?<br />
            This action will permanently remove the mobile repair record <span className="font-bold">{currentRow.name.toUpperCase()}</span> from the system. This cannot be undone.
          </p>

          <Label className="my-2">
            Mobile Repair Name:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter Mobile Repair Name to confirm deletion."
            />
          </Label>

          <Alert variant="destructive">
            <AlertTitle>Warning!</AlertTitle>
            <AlertDescription>Please be careful, this operation cannot be rolled back.</AlertDescription>
          </Alert>
        </div>
      }
      confirmText="Delete"
      destructive
    />
  )
}

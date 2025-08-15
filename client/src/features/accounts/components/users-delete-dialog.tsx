'use client'

import { useState } from 'react'
import { IconAlertTriangle } from '@tabler/icons-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { deleteAccount } from '@/stores/account.slice'
import toast from 'react-hot-toast'


interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentAccount: any
  setFetch: React.Dispatch<React.SetStateAction<boolean>>
}

export default function AccountDeleteDialog({ open, onOpenChange, currentAccount, setFetch }: Props) {
  const [value, setValue] = useState('')
  const dispatch = useDispatch<AppDispatch>()

  const handleDelete = async () => {
    if (value.trim() !== currentAccount.name) return

    onOpenChange(false)
    try {
      await dispatch(deleteAccount(currentAccount.id)).unwrap()
      toast.success('Account deleted successfully')
      setFetch(prev => !prev)
    } catch {
      toast.error('Failed to delete account')
    }
  }

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentAccount.name}
      title={
        <span className="text-destructive">
          <IconAlertTriangle className="stroke-destructive mr-1 inline-block" size={18} /> Delete Account
        </span>
      }
      desc={
        <div className="space-y-4">
          <p className="mb-2">
            Are you sure you want to delete{' '}
            <span className="font-bold">{currentAccount.name}</span>?
            <br />
            This action will permanently remove the account{' '}
            <span className="font-bold">{currentAccount.name.toUpperCase()}</span> from the system. This cannot be undone.
          </p>

          <Label className="my-2">
            Account:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter Account Name to confirm deletion."
              autoFocus
            />
          </Label>

          <Alert variant="destructive">
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

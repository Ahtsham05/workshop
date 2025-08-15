'use client';

import { useState } from 'react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '@/stores/store';
import { deleteTransaction } from '@/stores/transaction.slice';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentRow: any;
  setFetch: React.Dispatch<React.SetStateAction<boolean>>;
}

export default function TransactionDeleteDialog({
  open,
  onOpenChange,
  currentRow,
  setFetch,
}: Props) {
  const [value, setValue] = useState('');
  const dispatch = useDispatch<AppDispatch>();

  const handleDelete = async () => {
    if (value.trim() !== currentRow.description) return;

    onOpenChange(false);
    try {
      await dispatch(deleteTransaction(currentRow._id)).unwrap();
      toast.success('Transaction deleted successfully');
      setFetch((prev) => !prev);
    } catch {
      toast.error('Failed to delete transaction');
    }
  };

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      handleConfirm={handleDelete}
      disabled={value.trim() !== currentRow.description}
      title={
        <span className="text-destructive">
          <IconAlertTriangle className="stroke-destructive mr-1 inline-block" size={18} /> Delete
          Transaction
        </span>
      }
      desc={
        <div className="space-y-4">
          <p className="mb-2">
            Are you sure you want to delete{' '}
            <span className="font-bold">{currentRow.description}</span>? This action will
            permanently remove this transaction. This cannot be undone.
          </p>

          <Label className="my-2">
            Transaction Description:
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Enter transaction description to confirm deletion."
              autoFocus
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
  );
}

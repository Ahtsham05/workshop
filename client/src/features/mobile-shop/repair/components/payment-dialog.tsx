import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useAddRepairPaymentMutation,
  useChangeRepairStatusMutation,
  type RepairJobRecord,
} from '@/stores/mobile-shop.api'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { balanceOf } from '../lib/repair-meta'
import {
  PaymentMethodSelect,
  type PaymentChoice,
} from './payment-method-select'

export type PaymentDialogMode = 'payment' | 'deliver' | 'refund'

/** Take a payment, collect & hand the device back, or give money back. */
export function PaymentDialog({
  job,
  mode,
  open,
  onOpenChange,
  onDone,
}: {
  job: RepairJobRecord
  mode: PaymentDialogMode
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone?: (job: RepairJobRecord) => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n: number) => formatMoneyWithMeta(n, currencyMeta)
  const balance = balanceOf(job)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [method, setMethod] = useState<PaymentChoice>({
    paymentMethod: 'cash',
    walletType: '',
  })
  const [onCredit, setOnCredit] = useState(false)
  const [addPayment, { isLoading }] = useAddRepairPaymentMutation()
  const [changeStatus, { isLoading: changeStatusBusy }] =
    useChangeRepairStatusMutation()

  useEffect(() => {
    if (!open) return
    setAmount(
      mode === 'refund'
        ? String(Math.max(0, -balance) || '')
        : balance > 0
          ? String(balance)
          : ''
    )
    setNote('')
    setOnCredit(false)
    setMethod({ paymentMethod: 'cash', walletType: '' })
  }, [open, mode, balance])

  const value = Number(amount) || 0
  const after = mode === 'refund' ? balance + value : balance - value
  const title =
    mode === 'deliver'
      ? 'Collect & deliver'
      : mode === 'refund'
        ? 'Refund to customer'
        : 'Receive payment'

  const submit = async () => {
    try {
      if (mode === 'deliver' && value <= 0) {
        if (balance > 0 && !onCredit)
          return toast.error(
            `Collect ${fmt(balance)} or turn on “Deliver on credit”`
          )
        // Nothing to collect — just hand it over.
        const updated = await changeStatus({
          id: job.id,
          status: 'delivered',
          allowCredit: onCredit,
        }).unwrap()
        toast.success('Device delivered')
        onDone?.(updated)
        onOpenChange(false)
        return
      }
      if (!(value > 0)) return toast.error('Enter an amount')
      const updated = await addPayment({
        id: job.id,
        amount: value,
        paymentMethod: method.paymentMethod,
        walletType: method.walletType || undefined,
        kind: mode === 'refund' ? 'refund' : 'payment',
        note: note.trim() || undefined,
        deliver: mode === 'deliver',
        allowCredit: mode === 'deliver' ? onCredit : undefined,
      }).unwrap()
      toast.success(
        mode === 'deliver'
          ? 'Payment received & device delivered'
          : mode === 'refund'
            ? 'Refund recorded'
            : 'Payment received'
      )
      onDone?.(updated)
      onOpenChange(false)
    } catch (error: unknown) {
      toast.error(
        (error as { data?: { message?: string } })?.data?.message ||
          'Could not save'
      )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {job.customerName} ·{' '}
            {[job.brand, job.deviceModel].filter(Boolean).join(' ')}
          </DialogDescription>
        </DialogHeader>

        <div className='space-y-1 rounded-md border p-3 text-sm'>
          <div className='flex justify-between'>
            <span>Bill</span>
            <span>{fmt(job.charges ?? 0)}</span>
          </div>
          <div className='flex justify-between text-emerald-600'>
            <span>Paid so far</span>
            <span>{fmt(job.advanceAmount ?? 0)}</span>
          </div>
          <div className='flex justify-between border-t pt-1 font-semibold'>
            <span>
              {balance >= 0 ? 'Balance due' : 'Owed back to customer'}
            </span>
            <span
              className={
                balance > 0
                  ? 'text-destructive'
                  : balance < 0
                    ? 'text-amber-600'
                    : 'text-emerald-600'
              }
            >
              {fmt(Math.abs(balance))}
            </span>
          </div>
        </div>

        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='pd-amount'>
              {mode === 'refund' ? 'Refund amount' : 'Amount received'}
            </Label>
            <Input
              id='pd-amount'
              type='number'
              min='0'
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label>{mode === 'refund' ? 'Paid out from' : 'Received in'}</Label>
            <PaymentMethodSelect
              moneyOut={mode === 'refund'}
              value={method}
              onChange={setMethod}
            />
          </div>
        </div>
        <div className='space-y-1'>
          <Label htmlFor='pd-note'>Note</Label>
          <Input
            id='pd-note'
            placeholder='Optional'
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

        {mode === 'deliver' && after > 0 && (
          <label className='flex items-center justify-between gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200'>
            <span>Deliver on credit — {fmt(after)} stays due</span>
            <Switch checked={onCredit} onCheckedChange={setOnCredit} />
          </label>
        )}

        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={isLoading || changeStatusBusy} onClick={submit}>
            {isLoading || changeStatusBusy
              ? 'Saving…'
              : mode === 'deliver'
                ? value > 0
                  ? `Receive ${fmt(value)} & deliver`
                  : 'Deliver'
                : title}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

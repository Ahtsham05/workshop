import { useMemo, useState } from 'react'
import { Package, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateRepairStockPurchaseMutation,
  useDeleteRepairStockEntryMutation,
  useGetRepairStockLedgerQuery,
  useGetRepairStockSummaryQuery,
  type RepairStockEntry,
} from '@/stores/mobile-shop.api'
import {
  formatBusinessDate,
  parseBusinessDateTimeLocal,
  toBusinessDateTimeLocal,
} from '@/lib/business-timezone'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import {
  PaymentMethodSelect,
  type PaymentChoice,
} from './payment-method-select'

const errMsg = (e: unknown, fallback: string) =>
  (e as { data?: { message?: string } })?.data?.message || fallback

const blankForm = () => ({
  description: '',
  amount: '',
  pay: { paymentMethod: 'cash', walletType: '' } as PaymentChoice,
  notes: '',
  date: toBusinessDateTimeLocal(),
})

/**
 * Repair stock bought as a lump (parts lot from the market, paid from cash/bank/wallet).
 * Jobs draw from it with their "Repair cost"; the balance is what's left.
 */
export function PurchaseRepairPartsCard() {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const [form, setForm] = useState(blankForm)
  const { data: summary } = useGetRepairStockSummaryQuery()
  const [createPurchase, { isLoading }] = useCreateRepairStockPurchaseMutation()

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(form.amount)
    if (!form.description.trim()) return toast.error('Enter what you bought')
    if (!(amount > 0)) return toast.error('Enter the amount')
    try {
      await createPurchase({
        description: form.description.trim(),
        amount,
        paymentMethod: form.pay
          .paymentMethod as RepairStockEntry['paymentMethod'],
        walletType:
          form.pay.paymentMethod === 'wallet' ? form.pay.walletType : undefined,
        notes: form.notes.trim() || undefined,
        date: form.date ? parseBusinessDateTimeLocal(form.date) : undefined,
      }).unwrap()
      toast.success('Repair stock purchased & recorded in the cash book')
      setForm(blankForm())
    } catch (err) {
      toast.error(errMsg(err, 'Could not save the purchase'))
    }
  }

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <div className='bg-primary text-primary-foreground flex items-center gap-2 px-4 py-3'>
        <ShoppingCart className='h-4 w-4' aria-hidden />
        <h2 className='text-base font-semibold'>Purchase Repair Parts</h2>
      </div>
      <form className='grid gap-3 p-4' onSubmit={submit}>
        <div className='space-y-1'>
          <Label htmlFor='rs-desc'>Part / item description *</Label>
          <Input
            id='rs-desc'
            placeholder='e.g. Samsung A54 display, iPhone 11 battery'
            value={form.description}
            onChange={(e) =>
              setForm((p) => ({ ...p, description: e.target.value }))
            }
          />
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <div className='space-y-1'>
            <Label htmlFor='rs-amount'>Total amount *</Label>
            <Input
              id='rs-amount'
              type='number'
              min='0'
              inputMode='decimal'
              placeholder='0'
              value={form.amount}
              onChange={(e) =>
                setForm((p) => ({ ...p, amount: e.target.value }))
              }
            />
          </div>
          <div className='space-y-1'>
            <Label>Paid from</Label>
            <PaymentMethodSelect
              moneyOut
              value={form.pay}
              onChange={(pay) => setForm((p) => ({ ...p, pay }))}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='rs-date'>Date / time</Label>
            <Input
              id='rs-date'
              type='datetime-local'
              value={form.date}
              onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='rs-notes'>Notes</Label>
            <Input
              id='rs-notes'
              placeholder='Optional'
              value={form.notes}
              onChange={(e) =>
                setForm((p) => ({ ...p, notes: e.target.value }))
              }
            />
          </div>
        </div>
        <Button type='submit' disabled={isLoading}>
          <Plus className='mr-1.5 h-4 w-4' />{' '}
          {isLoading ? 'Saving…' : 'Purchase & record in cash book'}
        </Button>

        {summary && (
          <div className='overflow-hidden rounded-lg border text-sm'>
            <div className='bg-muted text-muted-foreground px-3 py-2 text-xs font-semibold tracking-wide uppercase'>
              Repair stock balance
            </div>
            <div className='divide-y'>
              <div className='flex justify-between bg-sky-500/10 px-3 py-2 text-sky-800 dark:text-sky-300'>
                <span>Total purchased</span>
                <span className='font-semibold tabular-nums'>
                  {fmt(summary.totalPurchased)}
                </span>
              </div>
              <div className='flex justify-between bg-rose-500/10 px-3 py-2 text-rose-700 dark:text-rose-300'>
                <span>Used in repairs</span>
                <span className='font-semibold tabular-nums'>
                  − {fmt(summary.totalUsed)}
                </span>
              </div>
              <div
                className={cn(
                  'flex justify-between px-3 py-2 font-bold',
                  summary.balance >= 0
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : 'text-destructive bg-rose-500/10'
                )}
              >
                <span>Remaining balance</span>
                <span className='text-base tabular-nums'>
                  {fmt(summary.balance)}
                </span>
              </div>
            </div>
          </div>
        )}
      </form>
    </Card>
  )
}

/** Debit (bought) / credit (used in repairs) / running balance — newest first. */
export function RepairStockLedgerCard({
  canManage,
  onOpenJob,
}: {
  canManage: boolean
  onOpenJob: (id: string) => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const { data: ledger, isLoading } = useGetRepairStockLedgerQuery({
    limit: 1000,
  })
  const [deleteEntry, { isLoading: deleting }] =
    useDeleteRepairStockEntryMutation()
  const [confirm, setConfirm] = useState<RepairStockEntry | null>(null)

  const rows = useMemo(() => {
    let running = 0
    const withBalance = (ledger?.results ?? []).map((e) => {
      const amount = Number(e.amount) || 0
      running += e.type === 'purchase' ? amount : -amount
      return { ...e, amount, balance: running }
    })
    return withBalance.reverse()
  }, [ledger])

  return (
    <Card className='min-w-0 gap-0 overflow-hidden py-0'>
      <div className='bg-primary text-primary-foreground flex items-center gap-2 px-4 py-3'>
        <Package className='h-4 w-4' aria-hidden />
        <h2 className='text-base font-semibold'>Repair Stock Ledger</h2>
      </div>
      <div className='overflow-x-auto p-4'>
        {rows.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>
            {isLoading ? 'Loading…' : 'No entries yet'}
          </p>
        ) : (
          <table className='w-full min-w-[560px] text-sm'>
            <thead className='bg-muted/50 text-muted-foreground text-xs'>
              <tr>
                <th className='px-3 py-2 text-left font-medium'>Date</th>
                <th className='px-3 py-2 text-left font-medium'>Description</th>
                <th className='px-3 py-2 text-right font-medium text-sky-700 dark:text-sky-300'>
                  Debit (in)
                </th>
                <th className='px-3 py-2 text-right font-medium text-rose-700 dark:text-rose-300'>
                  Credit (out)
                </th>
                <th className='px-3 py-2 text-right font-medium text-emerald-700 dark:text-emerald-300'>
                  Balance
                </th>
                <th className='w-10' />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 100).map((r) => (
                <tr
                  key={r.id}
                  className={cn(
                    'border-t',
                    r.repairJobId && 'hover:bg-muted/40 cursor-pointer'
                  )}
                  onClick={() => r.repairJobId && onOpenJob(r.repairJobId)}
                >
                  <td className='text-muted-foreground px-3 py-2 text-xs whitespace-nowrap'>
                    {formatBusinessDate(r.date)}
                  </td>
                  <td className='px-3 py-2'>
                    <div className='flex items-center gap-1.5'>
                      <span
                        className={cn(
                          'h-1.5 w-1.5 shrink-0 rounded-full',
                          r.type === 'purchase' ? 'bg-sky-500' : 'bg-rose-500'
                        )}
                      />
                      <span className='font-medium'>{r.description}</span>
                    </div>
                    {(r.repairJobRef || r.notes) && (
                      <div className='text-muted-foreground ml-3 text-xs'>
                        {[r.repairJobRef, r.notes].filter(Boolean).join(' · ')}
                      </div>
                    )}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {r.type === 'purchase' ? (
                      <span className='font-medium text-sky-700 dark:text-sky-300'>
                        {fmt(r.amount)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className='px-3 py-2 text-right tabular-nums'>
                    {r.type === 'repair_usage' ? (
                      <span className='font-medium text-rose-700 dark:text-rose-300'>
                        {fmt(r.amount)}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td
                    className={cn(
                      'px-3 py-2 text-right font-semibold tabular-nums',
                      r.balance >= 0
                        ? 'text-emerald-700 dark:text-emerald-300'
                        : 'text-destructive'
                    )}
                  >
                    {fmt(r.balance)}
                  </td>
                  <td className='px-1' onClick={(e) => e.stopPropagation()}>
                    {canManage && r.type === 'purchase' && (
                      <Button
                        size='icon'
                        variant='ghost'
                        aria-label={`Delete ${r.description}`}
                        onClick={() => setConfirm(r)}
                      >
                        <Trash2 className='text-destructive h-4 w-4' />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {rows.length > 100 && (
          <p className='text-muted-foreground mt-2 text-xs'>
            Showing the latest 100 of {rows.length} entries.
          </p>
        )}
      </div>

      <Dialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle>Delete entry?</DialogTitle>
            <DialogDescription>
              Delete <strong>{confirm?.description}</strong>? Its cash book
              expense is reversed too.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant='outline' onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button
              variant='destructive'
              disabled={deleting}
              onClick={async () => {
                if (!confirm) return
                try {
                  await deleteEntry(confirm.id).unwrap()
                  toast.success('Entry deleted')
                  setConfirm(null)
                } catch (err) {
                  toast.error(errMsg(err, 'Could not delete'))
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

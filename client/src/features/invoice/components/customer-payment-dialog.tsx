import { useEffect, useMemo, useState } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useGetAllCustomersQuery } from '@/stores/customer.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useApplyCreditMutation,
  useCreateCustomerPaymentMutation,
  usePreviewAllocationMutation,
  type AllocationMode,
  type AllocationPreview,
} from '@/stores/customerPayment.api'
import { useCurrencySymbolPrefix, useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertTriangle, ArrowRight, Banknote, Coins, HandCoins, Loader2, Wallet } from 'lucide-react'

/** Allocation strategies the dialog offers, in the order an ERP user expects them. */
const ALLOCATION_MODES: { value: AllocationMode; label: string; hint: string }[] = [
  { value: 'fifo', label: 'Oldest invoice first (FIFO)', hint: 'Clears the oldest bills first — the usual way to settle a customer account.' },
  { value: 'due_date', label: 'Earliest due date first', hint: 'Settles whatever is contractually due soonest; undated invoices come last.' },
  { value: 'manual', label: 'Manual allocation', hint: 'Type exactly how much goes against each invoice.' },
  {
    value: 'none',
    label: 'Keep as advance',
    hint: 'Records the money against the customer without touching any invoice — available as credit later.',
  },
]

interface CustomerPaymentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Pre-selects a customer — e.g. opening the dialog from a specific invoice's row menu. */
  defaultCustomerId?: string
  onRecorded?: () => void
}

export function CustomerPaymentDialog({ open, onOpenChange, defaultCustomerId, onRecorded }: CustomerPaymentDialogProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const currencyPrefix = useCurrencySymbolPrefix()

  const { data: customersData } = useGetAllCustomersQuery(undefined, { skip: !open })
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !open })
  const wallets = (walletsData?.results ?? []).filter((wallet) => wallet.isActive !== false)

  const [customerId, setCustomerId] = useState(defaultCustomerId || '')
  const [direction, setDirection] = useState<'payment' | 'refund'>('payment')
  const [amount, setAmount] = useState('')
  const [paymentDate, setPaymentDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash')
  const [walletType, setWalletType] = useState('')
  const [referenceNumber, setReferenceNumber] = useState('')
  const [notes, setNotes] = useState('')
  const [allocationMode, setAllocationMode] = useState<AllocationMode>('fifo')
  /** invoiceId → typed amount, manual mode only. */
  const [manualAmounts, setManualAmounts] = useState<Record<string, string>>({})
  const [preview, setPreview] = useState<AllocationPreview | null>(null)

  const [runPreview, { isLoading: isPreviewing }] = usePreviewAllocationMutation()
  const [createPayment, { isLoading: isSaving }] = useCreateCustomerPaymentMutation()
  const [applyCredit, { isLoading: isApplyingCredit }] = useApplyCreditMutation()

  const customerOptions = useMemo(
    () =>
      // GET /customers/all sends a plain array, not { results: [...] } — the defensive
      // Array.isArray check covers it either way (see invoice-list.tsx's identical
      // customerMap-building logic for the same endpoint).
      ((Array.isArray(customersData) ? customersData : customersData?.results) || []).map((customer: any) => ({
        value: String(customer._id || customer.id),
        label: customer.name,
        sublabel: customer.phone,
        picture: customer.picture,
      })),
    [customersData]
  )

  useEffect(() => {
    if (!open) return
    setCustomerId(defaultCustomerId || '')
    setDirection('payment')
    setAmount('')
    setPaymentDate(format(new Date(), 'yyyy-MM-dd'))
    setPaymentMethod('cash')
    setWalletType('')
    setReferenceNumber('')
    setNotes('')
    setAllocationMode('fifo')
    setManualAmounts({})
    setPreview(null)
  }, [open, defaultCustomerId])

  const numericAmount = Number(amount) || 0

  const manualAllocations = useMemo(
    () =>
      Object.entries(manualAmounts)
        .map(([invoiceId, value]) => ({ invoiceId, amount: Number(value) || 0 }))
        .filter((line) => line.amount > 0),
    [manualAmounts]
  )

  const manualTotal = manualAllocations.reduce((sum, line) => sum + line.amount, 0)
  const manualExceedsAmount = allocationMode === 'manual' && manualTotal > numericAmount + 0.001

  /**
   * The allocation plan comes from the server (same code that will run on save), debounced
   * so typing an amount doesn't fire a request per keystroke. Manual lines are only sent
   * once they're valid — an in-progress over-allocation is shown as a local warning instead
   * of bouncing off a 400.
   */
  useEffect(() => {
    if (!open || !customerId || direction === 'refund') {
      if (direction === 'refund') setPreview(null)
      return
    }
    const timer = setTimeout(() => {
      runPreview({
        customer: customerId,
        amount: numericAmount,
        allocationMode,
        allocations: allocationMode === 'manual' && !manualExceedsAmount ? manualAllocations : undefined,
      })
        .unwrap()
        .then(setPreview)
        .catch(() => setPreview(null))
    }, 350)
    return () => clearTimeout(timer)
  }, [open, customerId, numericAmount, allocationMode, manualAllocations, manualExceedsAmount, direction, runPreview])

  const summary = preview?.summary
  const openInvoices = preview?.openInvoices || []
  const allocatedTotal = allocationMode === 'manual' ? manualTotal : preview?.allocatedTotal || 0
  const unapplied = Math.max(0, numericAmount - allocatedTotal)
  const availableCredit = summary?.availableCredit || 0

  const setManualAmount = (invoiceId: string, value: string, outstanding: number) => {
    const capped = Math.min(Number(value) || 0, outstanding)
    setManualAmounts((previous) => ({ ...previous, [invoiceId]: value === '' ? '' : String(capped) }))
  }

  /** "Settle it all" — fills the amount box with everything currently outstanding. */
  const fillFullOutstanding = () => {
    if (!summary) return
    setAmount(String(summary.totalOutstanding.toFixed(2)))
    setManualAmounts({})
  }

  const handleApplyCredit = async () => {
    try {
      const result = await applyCredit({ customer: customerId, allocationMode: 'fifo' }).unwrap()
      toast.success(t('Credit applied'), {
        description: `${formatMoney(result.appliedAmount)} ${t('applied to open invoices')}`,
      })
      onRecorded?.()
    } catch (error: any) {
      toast.error(error?.data?.message || t('Could not apply credit'))
    }
  }

  const canSubmit =
    Boolean(customerId) &&
    numericAmount > 0 &&
    !manualExceedsAmount &&
    (paymentMethod !== 'wallet' || Boolean(walletType)) &&
    !isSaving

  const handleSubmit = async () => {
    try {
      const payment = await createPayment({
        customer: customerId,
        amount: numericAmount,
        direction,
        paymentDate: new Date(paymentDate).toISOString(),
        paymentMethod,
        walletType: paymentMethod === 'wallet' ? walletType : undefined,
        referenceNumber: referenceNumber.trim() || undefined,
        notes: notes.trim() || undefined,
        allocationMode: direction === 'refund' ? 'none' : allocationMode,
        allocations: allocationMode === 'manual' ? manualAllocations : undefined,
      }).unwrap()

      const settledCount = payment.allocations?.length || 0
      toast.success(
        direction === 'refund' ? t('Refund recorded') : t('Payment recorded'),
        {
          description:
            direction === 'refund'
              ? `${formatMoney(payment.amount)} ${t('refunded to')} ${payment.customerName}`
              : `${formatMoney(payment.amount)} — ${settledCount} ${t('invoice(s) settled')}${
                  payment.unappliedAmount > 0 ? `, ${formatMoney(payment.unappliedAmount)} ${t('kept as advance')}` : ''
                }`,
        }
      )
      onRecorded?.()
      onOpenChange(false)
    } catch (error: any) {
      toast.error(error?.data?.message || t('Could not record the payment'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] w-[calc(100vw-2rem)] max-w-4xl flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl lg:max-w-6xl'>
        <DialogHeader className='shrink-0 space-y-1 border-b px-6 py-4 pr-12'>
          <DialogTitle className='flex items-center gap-2'>
            <HandCoins className='h-5 w-5 text-primary' />
            {direction === 'refund' ? t('Record Customer Refund') : t('Record Customer Payment')}
          </DialogTitle>
          <DialogDescription>
            {direction === 'refund'
              ? t('Money you are handing back to the customer — it draws down the credit they are holding with you.')
              : t('Enter what the customer paid. The system settles their open invoices automatically and keeps any excess as an advance.')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className='min-h-0 flex-1'>
          <div className='grid gap-6 p-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)]'>
            {/* Payment details */}
            <div className='space-y-4'>
              <div className='space-y-1.5'>
                <Label>{t('Customer')}</Label>
                <SearchableSelect
                  options={customerOptions}
                  value={customerId}
                  onValueChange={(value) => {
                    setCustomerId(value)
                    setManualAmounts({})
                  }}
                  placeholder={t('Select customer')}
                  searchPlaceholder={t('Search customers...')}
                  popoverClassName='w-[360px]'
                />
              </div>

              {summary && (
                <div className='grid grid-cols-2 gap-2'>
                  <div className='rounded-lg border bg-muted/40 p-3'>
                    <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Outstanding')}</p>
                    <p className='text-lg font-semibold tabular-nums'>{formatMoney(summary.totalOutstanding)}</p>
                    <p className='text-[11px] text-muted-foreground'>
                      {summary.openInvoiceCount} {t('open invoice(s)')}
                    </p>
                  </div>
                  <div className='rounded-lg border bg-muted/40 p-3'>
                    <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Overdue')}</p>
                    <p
                      className={cn(
                        'text-lg font-semibold tabular-nums',
                        summary.overdueAmount > 0 && 'text-rose-600 dark:text-rose-400'
                      )}
                    >
                      {formatMoney(summary.overdueAmount)}
                    </p>
                    <p className='text-[11px] text-muted-foreground'>
                      {summary.overdueInvoiceCount} {t('invoice(s)')}
                    </p>
                  </div>
                </div>
              )}

              {availableCredit > 0 && (
                <div className='rounded-lg border border-sky-500/30 bg-sky-500/10 p-3'>
                  <div className='flex items-start justify-between gap-2'>
                    <div>
                      <p className='text-sm font-medium text-sky-700 dark:text-sky-300'>{t('Advance / credit available')}</p>
                      <p className='text-lg font-semibold tabular-nums text-sky-700 dark:text-sky-300'>
                        {formatMoney(availableCredit)}
                      </p>
                    </div>
                    {summary && summary.totalOutstanding > 0 && direction === 'payment' && (
                      <Button size='sm' variant='outline' onClick={handleApplyCredit} disabled={isApplyingCredit}>
                        {isApplyingCredit ? <Loader2 className='mr-2 h-3.5 w-3.5 animate-spin' /> : null}
                        {t('Apply to invoices')}
                      </Button>
                    )}
                  </div>
                </div>
              )}

              <div className='space-y-1.5'>
                <div className='flex items-center justify-between'>
                  <Label>{direction === 'refund' ? t('Refund Amount') : t('Payment Amount')}</Label>
                  {direction === 'payment' && summary && summary.totalOutstanding > 0 && (
                    <button type='button' onClick={fillFullOutstanding} className='text-xs text-primary hover:underline'>
                      {t('Settle full outstanding')}
                    </button>
                  )}
                </div>
                <div className='relative'>
                  <span className='pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-muted-foreground'>
                    {currencyPrefix.trim()}
                  </span>
                  <Input
                    type='number'
                    min={0}
                    step='0.01'
                    inputMode='decimal'
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    placeholder='0.00'
                    className='h-11 pl-9 text-lg font-semibold tabular-nums'
                  />
                </div>
              </div>

              <div className='grid grid-cols-2 gap-3'>
                <div className='space-y-1.5'>
                  <Label>{t('Date')}</Label>
                  <Input type='date' value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                </div>
                <div className='space-y-1.5'>
                  <Label>{t('Reference')}</Label>
                  <Input
                    value={referenceNumber}
                    onChange={(event) => setReferenceNumber(event.target.value)}
                    placeholder={t('Cheque / transfer no.')}
                  />
                </div>
              </div>

              <div className='space-y-1.5'>
                <Label>{t('Payment Method')}</Label>
                <div className='grid grid-cols-2 gap-2'>
                  <Button
                    type='button'
                    variant={paymentMethod === 'cash' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('cash')}
                  >
                    <Coins className='mr-2 h-4 w-4' />
                    {t('Cash')}
                  </Button>
                  <Button
                    type='button'
                    variant={paymentMethod === 'wallet' ? 'default' : 'outline'}
                    onClick={() => setPaymentMethod('wallet')}
                  >
                    <Wallet className='mr-2 h-4 w-4' />
                    {t('Bank / Wallet')}
                  </Button>
                </div>
                {paymentMethod === 'wallet' && (
                  <Select value={walletType} onValueChange={setWalletType}>
                    <SelectTrigger className='mt-2'>
                      <SelectValue placeholder={t('Select bank account')} />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.type}>
                          {wallet.type} — {formatMoney(Number(wallet.balance || 0))}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {direction === 'payment' && (
                <div className='space-y-1.5'>
                  <Label>{t('Allocation')}</Label>
                  <Select value={allocationMode} onValueChange={(value) => setAllocationMode(value as AllocationMode)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ALLOCATION_MODES.map((mode) => (
                        <SelectItem key={mode.value} value={mode.value}>
                          {t(mode.label)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className='text-xs text-muted-foreground'>
                    {t(ALLOCATION_MODES.find((mode) => mode.value === allocationMode)?.hint || '')}
                  </p>
                </div>
              )}

              <div className='space-y-1.5'>
                <Label>{t('Notes')}</Label>
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder={t('Optional note for the audit trail')}
                />
              </div>

              <button
                type='button'
                onClick={() => setDirection(direction === 'payment' ? 'refund' : 'payment')}
                className='text-xs text-muted-foreground hover:text-foreground hover:underline'
              >
                {direction === 'payment' ? t('Refunding this customer instead?') : t('Back to recording a payment')}
              </button>
            </div>

            {/* Allocation preview */}
            <div className='space-y-3'>
              <div className='flex flex-wrap items-center justify-between gap-2'>
                <div>
                  <h3 className='text-sm font-semibold'>{t('Allocation preview')}</h3>
                  {openInvoices.length > 0 && direction === 'payment' && (
                    <p className='text-xs text-muted-foreground'>
                      {openInvoices.length} {t('open invoice(s)')} ·{' '}
                      {formatMoney(openInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0))}{' '}
                      {t('outstanding')}
                    </p>
                  )}
                </div>
                <div className='flex items-center gap-2'>
                  {isPreviewing && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
                  {allocationMode === 'manual' && Object.keys(manualAmounts).length > 0 && (
                    <Button variant='ghost' size='sm' className='h-7 text-xs' onClick={() => setManualAmounts({})}>
                      {t('Clear amounts')}
                    </Button>
                  )}
                </div>
              </div>

              {direction === 'refund' ? (
                <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {t('A refund is not allocated to invoices — it reduces the advance/credit this customer is holding.')}
                </div>
              ) : !customerId ? (
                <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {t('Pick a customer to see their open invoices.')}
                </div>
              ) : allocationMode === 'none' ? (
                <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {t('This payment will be held as an advance against the customer — nothing is applied to an invoice until you apply the credit.')}
                </div>
              ) : openInvoices.length === 0 ? (
                <div className='rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground'>
                  {t('This customer has no outstanding invoices. Any amount you record will be kept as an advance.')}
                </div>
              ) : (
                <div className='rounded-lg border'>
                  {/* The grid can get narrow on a laptop — let the table scroll sideways
                      rather than letting five columns crush into an unreadable stack. */}
                  <div className='max-h-[22rem] overflow-auto'>
                    <table className='w-full min-w-[560px] text-sm'>
                      <thead className='sticky top-0 z-10 bg-muted text-xs uppercase tracking-wide text-muted-foreground'>
                        <tr>
                          <th className='px-3 py-2 text-left font-medium'>{t('Invoice')}</th>
                          <th className='px-3 py-2 text-right font-medium'>{t('Outstanding')}</th>
                          <th className='px-3 py-2 text-right font-medium'>{t('Applied')}</th>
                          <th className='px-3 py-2 text-right font-medium'>{t('After')}</th>
                          <th className='px-3 py-2 text-right font-medium'>{t('Status')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {openInvoices.map((invoice) => {
                          const manualValue = manualAmounts[invoice.id] ?? ''
                          const applied = allocationMode === 'manual' ? Number(manualValue) || 0 : invoice.appliedAmount || 0
                          const after = invoice.remainingAmount - applied
                          const statusAfter = after <= 0.001 ? 'paid' : applied > 0 ? 'partial' : 'outstanding'
                          return (
                            <tr
                              key={invoice.id}
                              className={cn(
                                'border-t transition-colors',
                                // A funded row is the thing the user is actually looking for —
                                // make it findable at a glance instead of reading every amount.
                                applied > 0 && 'bg-emerald-500/[0.06]'
                              )}
                            >
                              <td className='px-3 py-2'>
                                <div className='flex items-center gap-2'>
                                  <span
                                    className={cn(
                                      'h-8 w-0.5 shrink-0 rounded-full',
                                      applied > 0 ? 'bg-emerald-500' : 'bg-transparent'
                                    )}
                                  />
                                  <div className='min-w-0'>
                                    <p className='truncate font-medium'>{invoice.invoiceNumber}</p>
                                    <p className='flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground'>
                                      <span>
                                        {invoice.invoiceDate ? format(new Date(invoice.invoiceDate), 'dd MMM yyyy') : '—'}
                                      </span>
                                      {invoice.dueDate && (
                                        <span>
                                          · {t('due')} {format(new Date(invoice.dueDate), 'dd MMM')}
                                        </span>
                                      )}
                                      {invoice.dueStatus === 'overdue' && (
                                        <span className='font-medium text-rose-600 dark:text-rose-400'>· {t('overdue')}</span>
                                      )}
                                      {invoice.settlementStatus === 'partial' && (
                                        <span className='text-amber-600 dark:text-amber-400'>· {t('part-paid')}</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                              </td>
                              <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums'>
                                {formatMoney(invoice.remainingAmount)}
                              </td>
                              <td className='px-3 py-2 text-right'>
                                {allocationMode === 'manual' ? (
                                  <Input
                                    type='number'
                                    min={0}
                                    step='0.01'
                                    value={manualValue}
                                    onChange={(event) => setManualAmount(invoice.id, event.target.value, invoice.remainingAmount)}
                                    className='ml-auto h-8 w-28 text-right tabular-nums'
                                    placeholder='0.00'
                                  />
                                ) : (
                                  <span
                                    className={cn(
                                      'whitespace-nowrap tabular-nums',
                                      applied > 0 ? 'font-semibold text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                                    )}
                                  >
                                    {applied > 0 ? formatMoney(applied) : '—'}
                                  </span>
                                )}
                              </td>
                              <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums text-muted-foreground'>
                                {formatMoney(Math.max(0, after))}
                              </td>
                              <td className='px-3 py-2 text-right'>
                                <Badge
                                  variant='outline'
                                  className={cn(
                                    'font-normal',
                                    statusAfter === 'paid' && 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
                                    statusAfter === 'partial' && 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
                                    statusAfter === 'outstanding' && 'border-muted-foreground/20 bg-muted text-muted-foreground'
                                  )}
                                >
                                  {statusAfter === 'paid' ? t('Paid') : statusAfter === 'partial' ? t('Partial') : t('Outstanding')}
                                </Badge>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                      <tfoot className='sticky bottom-0 border-t bg-muted/60 text-xs font-medium'>
                        <tr>
                          <td className='px-3 py-2'>{t('Total')}</td>
                          <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums'>
                            {formatMoney(openInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0))}
                          </td>
                          <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                            {formatMoney(allocatedTotal)}
                          </td>
                          <td className='whitespace-nowrap px-3 py-2 text-right tabular-nums'>
                            {formatMoney(
                              Math.max(
                                0,
                                openInvoices.reduce((sum, invoice) => sum + invoice.remainingAmount, 0) - allocatedTotal
                              )
                            )}
                          </td>
                          <td className='px-3 py-2' />
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {manualExceedsAmount && (
                <div className='flex items-start gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-600 dark:text-rose-400'>
                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' />
                  <span>
                    {t('Allocated')} {formatMoney(manualTotal)} {t('is more than the payment amount')} {formatMoney(numericAmount)}.
                  </span>
                </div>
              )}

              {numericAmount > 0 && direction === 'payment' && (
                <div className='space-y-2 rounded-lg border bg-muted/30 p-4'>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground'>{t('Payment amount')}</span>
                    <span className='font-medium tabular-nums'>{formatMoney(numericAmount)}</span>
                  </div>
                  <div className='flex items-center justify-between text-sm'>
                    <span className='text-muted-foreground'>{t('Applied to invoices')}</span>
                    <span className='font-medium tabular-nums text-emerald-600 dark:text-emerald-400'>
                      {formatMoney(allocatedTotal)}
                    </span>
                  </div>
                  {unapplied > 0.001 && (
                    <div className='flex items-center justify-between text-sm'>
                      <span className='text-muted-foreground'>{t('Kept as advance / credit')}</span>
                      <span className='font-medium tabular-nums text-sky-600 dark:text-sky-400'>{formatMoney(unapplied)}</span>
                    </div>
                  )}
                  <Separator />
                  <div className='flex items-center justify-between'>
                    <span className='text-sm font-medium'>{t('Remaining owed after this')}</span>
                    <span className='flex items-center gap-2 text-base font-semibold tabular-nums'>
                      {summary ? formatMoney(summary.totalOutstanding) : formatMoney(0)}
                      <ArrowRight className='h-3.5 w-3.5 text-muted-foreground' />
                      {formatMoney(Math.max(0, (summary?.totalOutstanding || 0) - allocatedTotal))}
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className='shrink-0 gap-2 border-t px-6 py-4'>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {isSaving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Banknote className='mr-2 h-4 w-4' />}
            {direction === 'refund' ? t('Record Refund') : t('Record Payment')}
            {numericAmount > 0 ? ` · ${formatMoney(numericAmount)}` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

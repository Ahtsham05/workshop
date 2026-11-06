import { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  Check,
  CreditCard,
  Gift,
  Loader2,
  Receipt,
  Zap,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { formatAppDate } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import {
  useAdminActivatePlanMutation,
  useAdminGetActivationOptionsQuery,
  useAdminPreviewActivationQuery,
  type ActivationPayment,
  type ActivationPreview,
} from '@/stores/admin-leads.api'
import { ADMIN_METHOD_LABELS, billingApi, billingErrorMessage } from '@/stores/billing.api'
import type { AppDispatch } from '@/stores/store'

const CUSTOM = 'custom'
const METHOD_ORDER: ActivationPayment['method'][] = ['cash', 'bank_transfer', 'jazzcash', 'easypaisa', 'card', 'other']

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const limitText = (n: number, one: string, many: string) =>
  n <= 0 || n >= 1e6 ? `Unlimited ${many}` : `${n.toLocaleString()} ${n === 1 ? one : many}`

/** What the period change means, in one sentence. */
function outcomeText(p: ActivationPreview) {
  const end = formatAppDate(p.periodEnd)
  switch (p.appliedAs) {
    case 'renewal':
      return `Extends the current ${p.plan.name} period — active until ${end}.`
    case 'upgrade':
      return `Upgrades to ${p.plan.name} now; unused paid time is credited — active until ${end}.`
    case 'scheduledDowngrade':
      return `${p.current.planName} stays until ${formatAppDate(p.periodStart)}, then ${p.plan.name} runs until ${end}.`
    case 'custom':
      return `${p.plan.name} active from today until ${end}.`
    default:
      return p.current.status === 'trialing'
        ? `${p.plan.name} active now; the remaining trial days are kept — active until ${end}.`
        : `${p.plan.name} active from today until ${end}.`
  }
}

const STATUS_TONE: Record<string, string> = {
  active: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300',
  trialing: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-300',
  expired: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300',
}

export function ActivatePlanDialog({ orgId, onOpenChange }: { orgId: string | null; onOpenChange: (open: boolean) => void }) {
  const open = !!orgId
  const dispatch = useDispatch<AppDispatch>()
  const { data: options, isLoading, isError, refetch } = useAdminGetActivationOptionsQuery(orgId ?? '', {
    skip: !open,
    refetchOnMountOrArgChange: true,
  })
  const [activate, { isLoading: saving }] = useAdminActivatePlanMutation()

  const today = getBusinessToday()
  const [planKey, setPlanKey] = useState('')
  const [duration, setDuration] = useState<string>('1')
  const [untilDate, setUntilDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [amount, setAmount] = useState('')
  const [amountTouched, setAmountTouched] = useState(false)
  const [method, setMethod] = useState<ActivationPayment['method']>('cash')
  const [transactionId, setTransactionId] = useState('')
  const [payerName, setPayerName] = useState('')
  const [paidOn, setPaidOn] = useState(today)
  const [note, setNote] = useState('')
  const [notifyOwner, setNotifyOwner] = useState(true)

  // Reset whenever a different org is opened; default to the org's current paid plan, else the first plan.
  useEffect(() => {
    if (!options) return
    const currentPaid = options.plans.find((p) => p.key === options.current.planKey)
    setPlanKey(currentPaid?.key ?? options.plans.find((p) => p.isPublic)?.key ?? options.plans[0]?.key ?? '')
    setDuration('1')
    setUntilDate(shiftBusinessCalendarDate(today, 30))
    setPaid(false)
    setAmount('')
    setAmountTouched(false)
    setMethod('cash')
    setTransactionId('')
    setPayerName(options.organization.ownerName)
    setPaidOn(today)
    setNote('')
    setNotifyOwner(true)
  }, [options, today])

  const isCustom = duration === CUSTOM
  const months = isCustom ? undefined : Number(duration)
  // End of the chosen day in Pakistan time, so the org stays active through that day.
  const until = isCustom && untilDate ? `${untilDate}T23:59:59+05:00` : undefined
  const previewArgs = useDebouncedValue(
    useMemo(() => ({ orgId: orgId ?? '', planKey, months, until }), [orgId, planKey, months, until]),
    200,
  )
  const canPreview = open && !!previewArgs.planKey && (!!previewArgs.months || !!previewArgs.until)
  const {
    data: preview,
    isFetching: previewLoading,
    error: previewError,
  } = useAdminPreviewActivationQuery(previewArgs, { skip: !canPreview })

  // Pre-fill the amount with the list price until the admin types their own.
  useEffect(() => {
    if (preview && !amountTouched) setAmount(String(preview.quote.amountPkr))
  }, [preview, amountTouched])

  const selectedPlan = options?.plans.find((p) => p.key === planKey)
  const cardBlocked = !!options?.current.hasCardSubscription
  const amountNum = Number(amount)
  const paymentValid = !paid || (amountNum > 0 && !!method && (method === 'cash' || method === 'other' || transactionId.trim().length > 0))
  const valid =
    !!selectedPlan && !!preview && !previewError && note.trim().length >= 3 && paymentValid && !cardBlocked && (!isCustom || !!untilDate)

  const submit = async () => {
    if (!orgId || !valid) return
    try {
      const res = await activate({
        orgId,
        planKey,
        months,
        until,
        note: note.trim(),
        notifyOwner,
        payment: paid
          ? { amountPkr: amountNum, method, transactionId: transactionId.trim(), payerName: payerName.trim(), paidOn }
          : null,
      }).unwrap()
      dispatch(billingApi.util.invalidateTags(['AdminManualPayments']))
      toast.success(
        `${res.plan.name} ${res.scheduled ? 'scheduled' : 'active'} until ${formatAppDate(res.periodEnd)}` +
          (res.receiptNumber ? ` · receipt ${res.receiptNumber}` : ''),
      )
      onOpenChange(false)
    } catch (err) {
      toast.error(billingErrorMessage(err, 'Could not activate the plan'))
    }
  }

  const durationLabel = isCustom ? `until ${untilDate ? formatAppDate(untilDate) : '…'}` : `${months} month${months === 1 ? '' : 's'}`

  return (
    <Dialog open={open} onOpenChange={(v) => !saving && onOpenChange(v)}>
      <DialogContent className='flex max-h-[92vh] flex-col gap-0 p-0 sm:max-w-2xl'>
        <DialogHeader className='space-y-1.5 border-b px-5 py-4 pr-12 text-left'>
          <DialogTitle className='flex items-center gap-2'>
            <Zap className='size-4 text-primary' /> Activate plan
          </DialogTitle>
          <DialogDescription asChild>
            <div className='flex flex-wrap items-center gap-x-2 gap-y-1 text-sm'>
              <span className='font-medium text-foreground'>{options?.organization.name ?? '…'}</span>
              {options && (
                <>
                  <span>·</span>
                  <Badge variant='outline' className={cn('capitalize', STATUS_TONE[options.current.status])}>
                    {options.current.planName} · {options.current.status}
                  </Badge>
                  {options.current.currentPeriodEnd && (
                    <span className='text-xs'>
                      {new Date(options.current.currentPeriodEnd) > new Date() ? 'ends' : 'ended'} {formatAppDate(options.current.currentPeriodEnd)}
                    </span>
                  )}
                </>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4'>
          {isLoading ? (
            <div className='space-y-3'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-20' />)}</div>
          ) : isError || !options ? (
            <div className='flex flex-col items-center gap-2 py-10 text-sm'>
              Couldn&apos;t load plans.
              <Button size='sm' variant='outline' onClick={() => refetch()}>Try again</Button>
            </div>
          ) : (
            <>
              {cardBlocked && (
                <div className='flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200'>
                  <CreditCard className='mt-0.5 size-4 shrink-0' />
                  This organization pays by card (Polar). Cancel the card subscription in Polar first so the customer isn&apos;t charged twice.
                </div>
              )}

              {/* Plan */}
              <section className='space-y-2'>
                <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Plan</Label>
                <div className='grid grid-cols-1 gap-2 sm:grid-cols-2'>
                  {options.plans.map((p) => {
                    const active = p.key === planKey
                    return (
                      <button
                        key={p.key}
                        type='button'
                        onClick={() => setPlanKey(p.key)}
                        className={cn(
                          'relative rounded-lg border p-3 text-left transition-colors hover:bg-muted/50',
                          active && 'border-primary bg-primary/5 ring-1 ring-primary',
                        )}
                      >
                        <div className='flex items-center justify-between gap-2'>
                          <span className='flex items-center gap-1.5 font-medium'>
                            {p.name}
                            {p.key === options.current.planKey && <Badge variant='secondary' className='h-4 px-1.5 text-[10px]'>Current</Badge>}
                            {!p.isPublic && <Badge variant='outline' className='h-4 px-1.5 text-[10px]'>Hidden</Badge>}
                          </span>
                          {active && <Check className='size-4 text-primary' />}
                        </div>
                        <p className='mt-0.5 text-sm tabular-nums'>
                          {p.priceUsdMonthly > 0 ? (
                            <>
                              {pkr(p.pricePkrMonthly)}
                              <span className='text-muted-foreground'> / mo · ${p.priceUsdMonthly}</span>
                            </>
                          ) : (
                            <span className='text-muted-foreground'>Custom price</span>
                          )}
                        </p>
                        <p className='mt-1 text-[11px] text-muted-foreground'>
                          {limitText(p.limits.maxUsers, 'user', 'users')} · {limitText(p.limits.maxBranches, 'branch', 'branches')} ·{' '}
                          {limitText(p.limits.maxInvoicesPerMonth, 'invoice/mo', 'invoices/mo')}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </section>

              {/* Duration */}
              <section className='space-y-2'>
                <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Duration</Label>
                <div className='grid grid-cols-3 gap-1.5 sm:grid-cols-5'>
                  {[...options.months.map(String), CUSTOM].map((d) => (
                    <button
                      key={d}
                      type='button'
                      onClick={() => setDuration(d)}
                      className={cn(
                        'rounded-md border px-2 py-2 text-sm font-medium transition-colors hover:bg-muted/50',
                        duration === d && 'border-primary bg-primary text-primary-foreground hover:bg-primary',
                      )}
                    >
                      {d === CUSTOM ? 'Until date' : `${d} month${d === '1' ? '' : 's'}`}
                    </button>
                  ))}
                </div>
                {isCustom && (
                  <div className='max-w-xs space-y-1'>
                    <Label htmlFor='activate-until' className='text-xs'>Active until (end of day)</Label>
                    <DatePicker id='activate-until' value={untilDate} onChange={setUntilDate} min={shiftBusinessCalendarDate(today, 1)} />
                  </div>
                )}

                {/* Server-computed outcome */}
                <div
                  className={cn(
                    'flex gap-2.5 rounded-lg border p-3 text-sm',
                    previewError ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300' : 'bg-muted/40',
                  )}
                >
                  {previewLoading && !preview ? (
                    <Loader2 className='mt-0.5 size-4 shrink-0 animate-spin' />
                  ) : (
                    <CalendarClock className='mt-0.5 size-4 shrink-0 text-primary' />
                  )}
                  <div className={cn('min-w-0 space-y-1', previewLoading && 'opacity-60')}>
                    {previewError ? (
                      <p>{billingErrorMessage(previewError, 'Could not work out the period')}</p>
                    ) : preview ? (
                      <>
                        <p className='font-medium'>{outcomeText(preview)}</p>
                        <p className='flex flex-wrap items-center gap-1 text-xs text-muted-foreground'>
                          {formatAppDate(preview.periodStart)} <ArrowRight className='size-3' /> {formatAppDate(preview.periodEnd)}
                          <span>· list price {pkr(preview.quote.amountPkr)} (${preview.quote.usdAmount})</span>
                        </p>
                        {preview.warnings.map((w) => (
                          <p key={w.limit} className='flex items-start gap-1 text-xs text-amber-700 dark:text-amber-300'>
                            <AlertTriangle className='mt-px size-3 shrink-0' /> {w.message}
                          </p>
                        ))}
                      </>
                    ) : (
                      <p className='text-muted-foreground'>Pick a plan and duration.</p>
                    )}
                  </div>
                </div>
              </section>

              {/* Payment */}
              <section className='space-y-3 rounded-lg border p-3'>
                <div className='flex items-start justify-between gap-3'>
                  <div className='flex gap-2.5'>
                    {paid ? <Receipt className='mt-0.5 size-4 text-emerald-600' /> : <Gift className='mt-0.5 size-4 text-violet-600' />}
                    <div>
                      <p className='text-sm font-medium'>{paid ? 'Payment received' : 'No payment (complimentary)'}</p>
                      <p className='text-xs text-muted-foreground'>
                        {paid
                          ? 'Recorded as an approved payment with a receipt number — shows in Manual Payments and the customer’s payment history.'
                          : 'The plan is switched on without a payment record — e.g. a free month or a payment you will record later.'}
                      </p>
                    </div>
                  </div>
                  <Switch checked={paid} onCheckedChange={setPaid} aria-label='Payment received' />
                </div>

                {paid && (
                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <div className='space-y-1'>
                      <Label htmlFor='pay-amount' className='text-xs'>Amount received (PKR)</Label>
                      <Input
                        id='pay-amount'
                        inputMode='decimal'
                        value={amount}
                        onChange={(e) => {
                          setAmountTouched(true)
                          setAmount(e.target.value.replace(/[^\d.]/g, ''))
                        }}
                        className='tabular-nums'
                      />
                      {preview && amountNum > 0 && amountNum < preview.quote.amountPkr && (
                        <p className='text-[11px] text-amber-700 dark:text-amber-300'>
                          {pkr(preview.quote.amountPkr - amountNum)} below the list price (discount)
                        </p>
                      )}
                    </div>
                    <div className='space-y-1'>
                      <Label className='text-xs'>Method</Label>
                      <Select value={method} onValueChange={(v) => setMethod(v as ActivationPayment['method'])}>
                        <SelectTrigger className='w-full'><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {METHOD_ORDER.map((m) => (
                            <SelectItem key={m} value={m}>{ADMIN_METHOD_LABELS[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='pay-txn' className='text-xs'>
                        Transaction ID {method === 'cash' || method === 'other' ? <span className='text-muted-foreground'>(optional)</span> : null}
                      </Label>
                      <Input id='pay-txn' value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder={method === 'cash' ? 'Receipt / slip no.' : 'From the bank / wallet SMS'} />
                    </div>
                    <div className='space-y-1'>
                      <Label htmlFor='pay-date' className='text-xs'>Paid on</Label>
                      <DatePicker id='pay-date' value={paidOn} onChange={setPaidOn} max={today} />
                    </div>
                    <div className='space-y-1 sm:col-span-2'>
                      <Label htmlFor='pay-payer' className='text-xs'>Paid by</Label>
                      <Input id='pay-payer' value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                    </div>
                  </div>
                )}
              </section>

              {/* Note + notify */}
              <section className='space-y-2'>
                <Label htmlFor='activate-note' className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Note <span className='normal-case font-normal'>(required — saved in the billing audit)</span>
                </Label>
                <Textarea
                  id='activate-note'
                  rows={2}
                  maxLength={300}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={paid ? 'e.g. Paid cash at the office' : 'e.g. 1 month free for the review video'}
                />
                <label className='flex cursor-pointer items-center gap-2 text-sm'>
                  <Checkbox checked={notifyOwner} onCheckedChange={(v) => setNotifyOwner(!!v)} />
                  Email the owner{options.organization.ownerEmail ? ` (${options.organization.ownerEmail})` : ''}
                </label>
              </section>
            </>
          )}
        </div>

        <DialogFooter className='gap-2 border-t px-5 py-3'>
          <Button variant='outline' onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
          <Button onClick={submit} disabled={!valid || saving || previewLoading}>
            {saving ? <Loader2 className='mr-1.5 size-4 animate-spin' /> : <Zap className='mr-1.5 size-4' />}
            Activate {selectedPlan?.name ?? ''} · {durationLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

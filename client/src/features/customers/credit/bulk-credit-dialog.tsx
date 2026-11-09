import { useEffect, useMemo, useState } from 'react'
import {
  CalendarClock,
  CheckCircle2,
  Clock,
  Loader2,
  Percent,
  Plus,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Target,
  Undo2,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import {
  useBulkUpdateCustomerCreditMutation,
  type BulkCreditAction,
  type BulkCreditResult,
  type BulkCreditScope,
} from '@/stores/creditControl.api'
import { PAYMENT_TERM_LABELS } from '../utils/customer-excel'
import { addDaysIso } from './credit-utils'

export type BulkCreditCustomer = {
  _id?: string
  id?: string
  name: string
  creditLimit?: number
  balance?: number
  creditHold?: boolean
  paymentTerms?: string
  credit?: { temporary?: { amount: number } | null } | null
}

type PreviewRow = { name: string; kind: 'change' | 'same' | 'skip'; from: string; to: string; delta?: number }

type Target = 'selected' | BulkCreditScope

const ACTIONS: { key: BulkCreditAction; label: string; hint: string; icon: typeof Plus; tone?: 'danger' }[] = [
  { key: 'set', label: 'Set limit', hint: 'Same limit for everyone', icon: Target },
  { key: 'increase', label: 'Increase by amount', hint: 'e.g. +10,000 each', icon: Plus },
  { key: 'increase_percent', label: 'Increase by %', hint: 'e.g. +20% (or −10%)', icon: Percent },
  { key: 'match_balance', label: 'Balance + buffer', hint: 'Limit = owed now + %', icon: Scale },
  { key: 'temporary', label: 'Temporary increase', hint: 'Until a date, then back', icon: CalendarClock },
  { key: 'clear_temporary', label: 'End temporary limits', hint: 'Back to normal limit', icon: Undo2 },
  { key: 'payment_terms', label: 'Payment terms', hint: 'When invoices fall due', icon: Clock },
  { key: 'remove', label: 'Remove limit', hint: 'Unlimited credit', icon: XCircle },
  { key: 'hold', label: 'Put on hold', hint: 'No new credit', icon: ShieldAlert, tone: 'danger' },
  { key: 'release', label: 'Release hold', hint: 'Allow credit again', icon: ShieldCheck },
]

const ROUND_OPTIONS = [1, 100, 500, 1000, 5000, 10000]

const roundUpTo = (value: number, step: number) => (step <= 1 ? Math.round(value * 100) / 100 : Math.ceil(value / step) * step)

/**
 * One credit change for many customers: the selected rows, or a whole group of the branch
 * (everyone / no limit yet / with a limit / owes money). Server: POST /credit-control/bulk.
 * Shows before → after for the selected customers, and what was skipped once applied.
 */
export function BulkCreditDialog({
  open,
  onOpenChange,
  selected,
  initialAction = 'set',
  onDone,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  selected: BulkCreditCustomer[]
  initialAction?: BulkCreditAction
  onDone?: () => void
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [apply, { isLoading }] = useBulkUpdateCustomerCreditMutation()
  const [target, setTarget] = useState<Target>('selected')
  const [action, setAction] = useState<BulkCreditAction>(initialAction)
  const [amount, setAmount] = useState('')
  const [percent, setPercent] = useState('')
  const [roundTo, setRoundTo] = useState(1)
  const [until, setUntil] = useState(addDaysIso(7))
  const [terms, setTerms] = useState('net_30')
  const [reason, setReason] = useState('')
  const [result, setResult] = useState<BulkCreditResult | null>(null)

  useEffect(() => {
    if (!open) return
    setTarget(selected.length ? 'selected' : 'all')
    setAction(initialAction)
    setAmount('')
    setPercent(initialAction === 'match_balance' ? '10' : '')
    setRoundTo(initialAction === 'match_balance' ? 1000 : 1)
    setUntil(addDaysIso(7))
    setReason('')
    setResult(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const value = Number(amount) || 0
  const pct = Number(percent) || 0
  const needsAmount = action === 'set' || action === 'increase'
  const needsPercent = action === 'increase_percent' || action === 'match_balance' || action === 'temporary'
  const canRound = ['increase', 'increase_percent', 'match_balance', 'temporary'].includes(action)

  // Inputs the change needs before it can be previewed / applied.
  const invalidInput =
    (action === 'set' && amount === '') ||
    (action === 'increase' && value <= 0) ||
    (action === 'increase_percent' && pct === 0) ||
    (action === 'temporary' && value <= 0 && pct <= 0)
  const invalid = invalidInput || (target === 'selected' && selected.length === 0) || (action === 'hold' && !reason.trim())

  /** What happens to each selected customer, worked out the way the server will. */
  const preview = useMemo((): PreviewRow[] => {
    if (target !== 'selected' || invalidInput) return []
    const money = (n: number) => (n > 0 ? formatMoney(n) : t('No limit'))
    return selected.map((customer): PreviewRow => {
      const name = customer.name
      const base = Number(customer.creditLimit) || 0
      const owed = Math.max(0, Number(customer.balance) || 0)
      const skip = (why: string): PreviewRow => ({ name, kind: 'skip', from: money(base), to: t(why) })
      const limitTo = (after: number): PreviewRow =>
        after === base
          ? { name, kind: 'same', from: money(base), to: money(after) }
          : { name, kind: 'change', from: money(base), to: money(after), delta: after - base }
      switch (action) {
        case 'set':
          return limitTo(Math.max(0, value))
        case 'remove':
          return base > 0 ? limitTo(0) : skip('Already no limit')
        case 'increase':
          return base > 0 ? limitTo(roundUpTo(base + value, roundTo)) : skip('No limit to increase')
        case 'increase_percent':
          return base > 0 ? limitTo(Math.max(0, roundUpTo(base * (1 + pct / 100), roundTo))) : skip('No limit to increase')
        case 'match_balance': {
          const after = roundUpTo(owed * (1 + Math.max(0, pct) / 100) + value, roundTo)
          return after > 0 ? limitTo(after) : skip('Owes nothing')
        }
        case 'temporary': {
          if (base <= 0) return skip('Needs a limit first')
          const temp = roundUpTo(pct > 0 ? base * (1 + pct / 100) + value : base + value, roundTo)
          return temp > base
            ? { name, kind: 'change', from: money(base), to: `${money(temp)} · ${t('until {{date}}', { date: until })}`, delta: temp - base }
            : skip('Not above current limit')
        }
        case 'clear_temporary':
          return customer.credit?.temporary
            ? { name, kind: 'change', from: money(customer.credit.temporary.amount), to: money(base) }
            : skip('No temporary limit')
        case 'hold':
          return customer.creditHold ? skip('Already on hold') : { name, kind: 'change', from: t('Allowed'), to: t('On hold') }
        case 'release':
          return customer.creditHold ? { name, kind: 'change', from: t('On hold'), to: t('Allowed') } : skip('Not on hold')
        case 'payment_terms': {
          const next = terms === 'none' ? '' : terms
          const label = (key?: string) => (key ? t(PAYMENT_TERM_LABELS[key] || key) : t('Not set'))
          return (customer.paymentTerms || '') === next
            ? { name, kind: 'same', from: label(customer.paymentTerms), to: label(next) }
            : { name, kind: 'change', from: label(customer.paymentTerms), to: label(next) }
        }
        default:
          return { name, kind: 'same', from: '', to: '' }
      }
    })
  }, [target, selected, action, value, pct, roundTo, until, terms, invalidInput, formatMoney, t])

  const counts = useMemo(
    () => ({
      change: preview.filter((r) => r.kind === 'change').length,
      same: preview.filter((r) => r.kind === 'same').length,
      skip: preview.filter((r) => r.kind === 'skip').length,
    }),
    [preview],
  )

  const submit = async () => {
    if (invalid) return
    try {
      const res = await apply({
        ...(target === 'selected'
          ? { customerIds: selected.map((c) => String(c._id || c.id)).filter(Boolean) }
          : { scope: target }),
        action,
        amount: needsAmount || action === 'match_balance' || action === 'temporary' ? value : undefined,
        percent: needsPercent ? pct : undefined,
        roundTo: canRound ? roundTo : undefined,
        expiresAt: action === 'temporary' ? until : undefined,
        paymentTerms: action === 'payment_terms' ? (terms === 'none' ? null : terms) : undefined,
        reason: reason.trim() || undefined,
      }).unwrap()
      setResult(res)
      toast.success(t('{{n}} customer(s) updated', { n: res.updated }))
      onDone?.()
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not apply the credit change')))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='flex max-h-[92vh] max-w-4xl flex-col sm:max-w-4xl'>
        <DialogHeader className='shrink-0'>
          <DialogTitle>{t('Bulk credit actions')}</DialogTitle>
          <DialogDescription>{t('Change credit limits, terms or holds for many customers at once. Every change is logged in each customer’s credit history.')}</DialogDescription>
        </DialogHeader>

        {result ? (
          <div className='min-h-0 flex-1 space-y-3 overflow-y-auto'>
            <div className='flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'>
              <CheckCircle2 className='h-5 w-5 shrink-0' />
              {t('{{updated}} of {{total}} customers updated', { updated: result.updated, total: result.total })}
              {result.skippedCount > 0 && <> · {t('{{n}} skipped', { n: result.skippedCount })}</>}
            </div>
            {result.skipped.length > 0 && (
              <ul className='divide-y rounded-lg border text-sm'>
                {result.skipped.map((row) => (
                  <li key={row.customerId} className='flex flex-wrap justify-between gap-2 px-3 py-1.5'>
                    <span className='font-medium'>{row.name}</span>
                    <span className='text-muted-foreground'>{t(row.reason)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <div className='grid min-h-0 flex-1 gap-4 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_300px] lg:overflow-hidden'>
            <div className='space-y-5 pb-1 lg:min-h-0 lg:overflow-y-auto lg:pr-2'>
              <div className='space-y-1.5'>
                <Label>{t('Apply to')}</Label>
                <Select value={target} onValueChange={(v) => setTarget(v as Target)}>
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {selected.length > 0 && (
                      <SelectItem value='selected'>{t('Selected customers ({{n}})', { n: selected.length })}</SelectItem>
                    )}
                    <SelectItem value='all'>{t('All customers of this branch')}</SelectItem>
                    <SelectItem value='no_limit'>{t('Customers without a limit')}</SelectItem>
                    <SelectItem value='with_limit'>{t('Customers with a limit')}</SelectItem>
                    <SelectItem value='receivable'>{t('Customers who owe money')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className='space-y-1.5'>
                <Label>{t('What to do')}</Label>
                <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2'>
                  {ACTIONS.map(({ key, label, hint, icon: Icon, tone }) => (
                    <button
                      key={key}
                      type='button'
                      onClick={() => {
                        setAction(key)
                        if (key === 'match_balance') {
                          setPercent('10')
                          setRoundTo(1000)
                        }
                      }}
                      className={cn(
                        'flex items-start gap-2 rounded-lg border p-2.5 text-left text-sm transition-colors hover:bg-muted/60',
                        action === key && 'border-primary bg-primary/5 ring-1 ring-primary',
                      )}
                    >
                      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'danger' ? 'text-red-600' : 'text-primary')} />
                      <span className='min-w-0'>
                        <span className='block font-medium leading-tight'>{t(label)}</span>
                        <span className='block text-xs text-muted-foreground'>{t(hint)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <div className='grid gap-4 sm:grid-cols-2'>
                {(needsAmount || action === 'match_balance' || action === 'temporary') && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='bulk-credit-amount'>
                      {action === 'set'
                        ? t('New credit limit')
                        : action === 'match_balance'
                          ? t('Plus a fixed amount (optional)')
                          : action === 'temporary'
                            ? t('Add amount (or use %)')
                            : t('Add to each limit')}
                    </Label>
                    <Input id='bulk-credit-amount' type='number' min={0} inputMode='decimal' value={amount} onChange={(e) => setAmount(e.target.value)} />
                    {action === 'set' && <p className='text-xs text-muted-foreground'>{t('0 = no limit')}</p>}
                  </div>
                )}
                {needsPercent && (
                  <div className='space-y-1.5'>
                    <Label htmlFor='bulk-credit-percent'>{action === 'match_balance' ? t('Buffer over what they owe (%)') : t('Percent')}</Label>
                    <Input id='bulk-credit-percent' type='number' inputMode='decimal' value={percent} onChange={(e) => setPercent(e.target.value)} />
                    <div className='flex flex-wrap gap-1.5'>
                      {(action === 'increase_percent' ? [-10, 10, 20, 25, 50] : [0, 10, 20, 50]).map((p) => (
                        <Button key={p} type='button' size='sm' variant={pct === p && percent !== '' ? 'default' : 'outline'} className='h-7 px-2.5 text-xs' onClick={() => setPercent(String(p))}>
                          {p > 0 ? `+${p}%` : `${p}%`}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {canRound && (
                  <div className='space-y-1.5'>
                    <Label>{t('Round up to')}</Label>
                    <Select value={String(roundTo)} onValueChange={(v) => setRoundTo(Number(v))}>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROUND_OPTIONS.map((step) => (
                          <SelectItem key={step} value={String(step)}>
                            {step === 1 ? t('No rounding') : formatMoney(step)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {action === 'temporary' && (
                  <div className='space-y-1.5'>
                    <Label>{t('Until')}</Label>
                    <DatePicker value={until} onChange={setUntil} min={addDaysIso(0)} />
                    <div className='flex flex-wrap gap-1.5'>
                      {[7, 15, 30].map((d) => (
                        <Button key={d} type='button' size='sm' variant={until === addDaysIso(d) ? 'default' : 'outline'} className='h-7 px-2.5 text-xs' onClick={() => setUntil(addDaysIso(d))}>
                          {t('{{n}} days', { n: d })}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
                {action === 'payment_terms' && (
                  <div className='space-y-1.5'>
                    <Label>{t('Payment terms')}</Label>
                    <Select value={terms} onValueChange={setTerms}>
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(PAYMENT_TERM_LABELS).map(([key, label]) => (
                          <SelectItem key={key} value={key}>
                            {t(label)}
                          </SelectItem>
                        ))}
                        <SelectItem value='none'>{t('Not set')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className='text-xs text-muted-foreground'>{t('Invoices without their own due date become overdue after these days.')}</p>
                  </div>
                )}
              </div>

              {action !== 'payment_terms' && (
                <div className='space-y-1.5'>
                  <Label htmlFor='bulk-credit-reason'>
                    {t('Reason')} {action !== 'hold' && <span className='text-muted-foreground'>({t('optional')})</span>}
                  </Label>
                  <Textarea id='bulk-credit-reason' rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={action === 'hold' ? t('e.g. Overdue more than 60 days') : t('e.g. Yearly limit review')} />
                </div>
              )}

            </div>

            <PreviewPanel
              target={target}
              total={selected.length}
              rows={preview}
              counts={counts}
              needsInput={invalidInput}
            />
          </div>
        )}

        <DialogFooter className='shrink-0'>
          {result ? (
            <Button type='button' onClick={() => onOpenChange(false)}>
              {t('Done')}
            </Button>
          ) : (
            <>
              <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
                {t('Cancel')}
              </Button>
              <Button type='button' onClick={submit} disabled={invalid || isLoading} variant={action === 'hold' ? 'destructive' : 'default'}>
                {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
                {t('Apply')}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function PreviewPanel({
  target,
  total,
  rows,
  counts,
  needsInput,
}: {
  target: Target
  total: number
  rows: PreviewRow[]
  counts: { change: number; same: number; skip: number }
  needsInput: boolean
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  return (
    <div className='flex flex-col rounded-lg border bg-muted/30 lg:min-h-0'>
      <div className='shrink-0 border-b px-3 py-2'>
        <div className='text-sm font-semibold'>{t('Preview')}</div>
        {target === 'selected' && !needsInput && (
          <div className='mt-1 flex flex-wrap gap-1.5 text-[11px]'>
            <span className='rounded-full bg-emerald-100 px-2 py-0.5 font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'>
              {t('{{n}} will change', { n: counts.change })}
            </span>
            {counts.same > 0 && (
              <span className='rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300'>
                {t('{{n}} unchanged', { n: counts.same })}
              </span>
            )}
            {counts.skip > 0 && (
              <span className='rounded-full bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'>
                {t('{{n}} skipped', { n: counts.skip })}
              </span>
            )}
          </div>
        )}
      </div>
      <div className='lg:min-h-0 lg:flex-1 lg:overflow-y-auto'>
        {target !== 'selected' ? (
          <p className='p-3 text-xs text-muted-foreground'>
            {t('Applied to every matching customer of this branch. Customers the change doesn’t fit (e.g. “+10%” with no limit) are skipped and listed after you apply.')}
          </p>
        ) : needsInput ? (
          <p className='p-3 text-xs text-muted-foreground'>
            {t('Enter the amount or percent to see what changes for each of the {{n}} customers.', { n: total })}
          </p>
        ) : (
          <ul className='divide-y text-sm'>
            {rows.map((row, i) => (
              <li key={i} className={cn('px-3 py-2', row.kind !== 'change' && 'opacity-60')}>
                <div className='truncate font-medium'>{row.name}</div>
                <div className='flex flex-wrap items-baseline gap-x-1.5 text-xs tabular-nums'>
                  {row.kind === 'skip' ? (
                    <span className='text-amber-700 dark:text-amber-400'>{row.to}</span>
                  ) : (
                    <>
                      <span className='text-muted-foreground'>{row.from}</span>
                      <span className='text-muted-foreground'>→</span>
                      <span className={row.kind === 'change' ? 'font-semibold' : ''}>{row.to}</span>
                      {row.delta ? (
                        <span className={row.delta > 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600'}>
                          ({row.delta > 0 ? '+' : '−'}
                          {formatMoney(Math.abs(row.delta))})
                        </span>
                      ) : null}
                      {row.kind === 'same' && <span className='text-muted-foreground'>· {t('no change')}</span>}
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

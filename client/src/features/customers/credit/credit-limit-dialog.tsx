import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, CalendarClock, Loader2, Plus, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useChangeCreditLimitMutation, type ChangeLimitAction, type CreditStatus } from '@/stores/creditControl.api'
import { addDaysIso, suggestLimit } from './credit-utils'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  status: CreditStatus
  initialAction?: ChangeLimitAction
  /** Limit a pending sale needs — offered as the first quick choice. */
  neededLimit?: number
  onSaved?: (status: CreditStatus) => void
}

const DURATIONS = [3, 7, 15, 30]

/**
 * Quick credit-limit change: raise by an amount (one tap on a preset), set an exact limit,
 * or give a temporary limit until a date. Shows the limit and room left before/after.
 */
export function CreditLimitDialog({ open, onOpenChange, status, initialAction = 'increase', neededLimit, onSaved }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [changeLimit, { isLoading }] = useChangeCreditLimitMutation()
  const [action, setAction] = useState<ChangeLimitAction>(initialAction)
  const [amount, setAmount] = useState('')
  const [until, setUntil] = useState(addDaysIso(7))
  const [reason, setReason] = useState('')

  const base = status.baseLimit
  const suggested = neededLimit && neededLimit > status.limit ? suggestLimit(neededLimit) : 0

  useEffect(() => {
    if (!open) return
    setAction(initialAction)
    setReason('')
    setUntil(addDaysIso(7))
    if (suggested > 0) {
      setAmount(String(initialAction === 'increase' ? Math.max(0, suggested - base) : suggested))
    } else {
      setAmount('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const value = Number(amount) || 0
  const newLimit = action === 'increase' ? base + value : value

  const presets = useMemo(() => {
    if (action === 'increase') {
      const list: { label: string; value: number }[] = []
      if (suggested > base) list.push({ label: t('Cover this sale'), value: suggested - base })
      if (base > 0) {
        for (const pct of [10, 25, 50]) list.push({ label: `+${pct}%`, value: Math.round((base * pct) / 100) })
      }
      for (const step of [5000, 10000, 25000, 50000]) list.push({ label: `+${formatMoney(step)}`, value: step })
      return list.filter((p, i, all) => p.value > 0 && all.findIndex((q) => q.value === p.value) === i).slice(0, 7)
    }
    const list: { label: string; value: number }[] = []
    if (suggested > 0) list.push({ label: t('Cover this sale'), value: suggested })
    if (base > 0) {
      for (const mult of [1.25, 1.5, 2]) list.push({ label: `×${mult}`, value: Math.round(base * mult) })
    }
    return list.filter((p, i, all) => p.value > 0 && all.findIndex((q) => q.value === p.value) === i)
  }, [action, base, suggested, formatMoney, t])

  const invalid =
    (action === 'increase' && value <= 0) ||
    (action === 'set' && (value < 0 || amount === '' || value === base)) ||
    (action === 'temporary' && (value <= base || !until))

  const submit = async () => {
    if (invalid) return
    try {
      const result = await changeLimit({
        customerId: status.customerId,
        action,
        amount: value,
        expiresAt: action === 'temporary' ? until : undefined,
        reason: reason.trim() || undefined,
      }).unwrap()
      toast.success(
        action === 'temporary'
          ? t('Temporary limit {{amount}} until {{date}}', { amount: formatMoney(value), date: until })
          : t('Credit limit is now {{amount}}', { amount: formatMoney(result.baseLimit) }),
      )
      onSaved?.(result)
      onOpenChange(false)
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not change the credit limit')))
    }
  }

  const availableAfter = newLimit - status.exposure

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <TrendingUp className='h-5 w-5 text-primary' />
            {t('Credit limit')} — {status.customerName}
          </DialogTitle>
          <DialogDescription>
            {t('Owes {{amount}} now', { amount: formatMoney(status.exposure) })}
            {status.temporary
              ? ` · ${t('temporary limit {{amount}} active', { amount: formatMoney(status.temporary.amount) })}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={action} onValueChange={(v) => { setAction(v as ChangeLimitAction); setAmount('') }}>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='increase'><Plus className='mr-1 h-3.5 w-3.5' />{t('Increase')}</TabsTrigger>
            <TabsTrigger value='set'>{t('Set limit')}</TabsTrigger>
            <TabsTrigger value='temporary'><CalendarClock className='mr-1 h-3.5 w-3.5' />{t('Temporary')}</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className='space-y-4'>
          <div className='space-y-2'>
            <Label htmlFor='credit-limit-amount'>
              {action === 'increase' ? t('Add to the limit') : action === 'set' ? t('New credit limit') : t('Temporary limit')}
            </Label>
            <Input
              id='credit-limit-amount'
              type='number'
              inputMode='decimal'
              min={0}
              autoFocus
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
              placeholder={action === 'set' ? t('0 = no limit') : '0'}
            />
            {presets.length > 0 && (
              <div className='flex flex-wrap gap-1.5'>
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    type='button'
                    size='sm'
                    variant={value === preset.value ? 'default' : 'outline'}
                    className='h-7 px-2.5 text-xs'
                    onClick={() => setAmount(String(preset.value))}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
            {action === 'set' && <p className='text-xs text-muted-foreground'>{t('Set 0 to remove the limit (unlimited credit).')}</p>}
          </div>

          {action === 'temporary' && (
            <div className='space-y-2'>
              <Label>{t('Until')}</Label>
              <DatePicker value={until} onChange={setUntil} min={addDaysIso(0)} />
              <div className='flex flex-wrap gap-1.5'>
                {DURATIONS.map((days) => (
                  <Button
                    key={days}
                    type='button'
                    size='sm'
                    variant={until === addDaysIso(days) ? 'default' : 'outline'}
                    className='h-7 px-2.5 text-xs'
                    onClick={() => setUntil(addDaysIso(days))}
                  >
                    {t('{{n}} days', { n: days })}
                  </Button>
                ))}
              </div>
              <p className='text-xs text-muted-foreground'>
                {t('After this date the limit goes back to {{amount}} by itself.', { amount: base > 0 ? formatMoney(base) : t('no limit') })}
              </p>
            </div>
          )}

          <div className='grid grid-cols-[1fr_auto_1fr] items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm'>
            <div>
              <div className='text-xs text-muted-foreground'>{t('Current limit')}</div>
              <div className='font-semibold tabular-nums'>{base > 0 ? formatMoney(base) : t('No limit')}</div>
            </div>
            <ArrowRight className='h-4 w-4 text-muted-foreground' />
            <div>
              <div className='text-xs text-muted-foreground'>{action === 'temporary' ? t('Until {{date}}', { date: until }) : t('New limit')}</div>
              <div className='font-semibold tabular-nums text-primary'>
                {newLimit > 0 ? formatMoney(newLimit) : t('No limit')}
              </div>
            </div>
            {newLimit > 0 && (
              <div className='col-span-3 text-xs text-muted-foreground'>
                {t('Room left after the change')}:{' '}
                <span className={cn('font-medium tabular-nums', availableAfter < 0 ? 'text-red-600' : 'text-emerald-700 dark:text-emerald-400')}>
                  {formatMoney(availableAfter)}
                </span>
              </div>
            )}
          </div>

          <div className='space-y-2'>
            <Label htmlFor='credit-limit-reason'>{t('Reason')} <span className='text-muted-foreground'>({t('optional')})</span></Label>
            <Textarea
              id='credit-limit-reason'
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t('e.g. Regular buyer, pays every Friday')}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type='button' variant='outline' onClick={() => onOpenChange(false)}>
            {t('Cancel')}
          </Button>
          <Button type='button' onClick={submit} disabled={invalid || isLoading}>
            {isLoading && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {action === 'temporary' ? t('Give temporary limit') : t('Save limit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

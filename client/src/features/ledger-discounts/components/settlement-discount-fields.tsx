import { useEffect, useMemo } from 'react'
import { AlertTriangle, BadgePercent, Plus, ShieldCheck, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { LedgerDiscountReason, LedgerDiscountSettings } from '@/stores/ledgerDiscounts.api'

export type { DiscountDraft } from '../lib/discount-draft'

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
import { DISCOUNT_REASONS, checkDiscountLimit, type LedgerSide } from '../lib/ledger-discounts'
import { resolveDiscount, type DiscountDraft } from '../lib/discount-draft'

interface Props {
  side: LedgerSide
  draft: DiscountDraft
  onChange: (draft: DiscountDraft) => void
  /** Payment it rides with; 0 = discount on its own. */
  paymentAmount: number
  /** What the party owes now (customer receivable / supplier payable), ≥ 0. */
  outstanding: number
  settings: LedgerDiscountSettings
  canApprove: boolean
  /** Standalone discount: always open, no "remove" button. */
  standalone?: boolean
}

export function SettlementDiscountFields({ side, draft, onChange, paymentAmount, outstanding, settings, canApprove, standalone }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const set = (patch: Partial<DiscountDraft>) => onChange({ ...draft, ...patch })

  useEffect(() => {
    if (standalone && !draft.enabled) onChange({ ...draft, enabled: true })
  }, [standalone]) // eslint-disable-line react-hooks/exhaustive-deps

  const resolved = useMemo(
    () => resolveDiscount(draft, { paymentAmount, outstanding, settings, canApprove, t }),
    [draft, paymentAmount, outstanding, settings, canApprove, t]
  )
  const limit = checkDiscountLimit(settings, { discount: resolved.amount, paymentAmount, outstanding })
  const leftover = round2(outstanding - paymentAmount)
  const settled = round2(paymentAmount + resolved.amount)
  const balanceAfter = round2(outstanding - settled)
  const sideWord = side === 'customer' ? t('Discount allowed') : t('Discount received')

  if (!draft.enabled) {
    return (
      <Button
        type='button'
        variant='outline'
        size='sm'
        className='w-full justify-start border-dashed text-muted-foreground'
        onClick={() => set({ enabled: true })}
      >
        <Plus className='mr-2 h-4 w-4' />
        {side === 'customer' ? t('Add discount (allowed to customer)') : t('Add discount (received from supplier)')}
        {leftover > 0 && paymentAmount > 0 ? (
          <span className='ml-auto text-xs'>
            {t('Left after payment')}: {formatMoney(leftover)}
          </span>
        ) : null}
      </Button>
    )
  }

  return (
    <div className='space-y-3 rounded-lg border border-amber-300/70 bg-amber-50/60 p-3 dark:border-amber-800/60 dark:bg-amber-950/20'>
      <div className='flex items-center gap-2'>
        <BadgePercent className='h-4 w-4 text-amber-700 dark:text-amber-400' />
        <span className='text-sm font-semibold'>{sideWord}</span>
        <span className='text-xs text-muted-foreground'>
          {t('Owing now')}: {formatMoney(outstanding)}
        </span>
        {!standalone && (
          <Button type='button' variant='ghost' size='sm' className='ml-auto h-7 w-7 p-0' onClick={() => onChange({ ...draft, enabled: false, value: '' })} title={t('Remove discount')}>
            <X className='h-4 w-4' />
          </Button>
        )}
      </div>

      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='space-y-1.5'>
          <Label className='text-xs'>{t('Reason')}</Label>
          <Select value={draft.reason} onValueChange={(v) => set({ reason: v as LedgerDiscountReason })}>
            <SelectTrigger className='w-full bg-background'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DISCOUNT_REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  <span>{t(r.label)}</span>
                  <span className='ml-2 text-xs text-muted-foreground'>{t(r.hint)}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className='space-y-1.5'>
          <Label className='text-xs'>{t('Discount')}</Label>
          <div className='flex gap-1.5'>
            <Input
              type='number'
              inputMode='decimal'
              min='0'
              step='0.01'
              value={draft.value}
              onChange={(e) => set({ value: e.target.value })}
              placeholder={draft.mode === 'percent' ? '0 %' : '0.00'}
              className='bg-background'
              aria-label={t('Discount')}
            />
            <div className='flex shrink-0 overflow-hidden rounded-md border bg-background'>
              {(['amount', 'percent'] as const).map((m) => (
                <button
                  key={m}
                  type='button'
                  onClick={() => set({ mode: m, value: '' })}
                  className={cn('px-2.5 text-xs font-medium', draft.mode === m ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
                >
                  {m === 'amount' ? t('Amount') : '%'}
                </button>
              ))}
            </div>
          </div>
          {draft.mode === 'percent' && resolved.amount > 0 ? (
            <p className='text-xs text-muted-foreground'>
              {draft.value}% {t('of')} {formatMoney(outstanding)} = <span className='font-medium text-foreground'>{formatMoney(resolved.amount)}</span>
            </p>
          ) : null}
        </div>
      </div>

      <div className='flex flex-wrap gap-1.5'>
        {settings.quickPercents.map((p) => (
          <Button key={p} type='button' size='sm' variant='outline' className='h-7 bg-background text-xs' onClick={() => set({ mode: 'percent', value: String(p) })}>
            {p}%
          </Button>
        ))}
        {leftover > 0.005 && (
          <Button
            type='button'
            size='sm'
            variant='outline'
            className='h-7 bg-background text-xs'
            onClick={() => set({ mode: 'amount', value: String(leftover), reason: paymentAmount > 0 && leftover < 1000 && draft.reason === 'cash_discount' ? 'round_off' : draft.reason })}
            title={t('Discount whatever is left so the account is settled')}
          >
            {paymentAmount > 0 ? t('Leave the rest') : t('Whole balance')} ({formatMoney(leftover)})
          </Button>
        )}
      </div>

      <Input
        value={draft.note}
        onChange={(e) => set({ note: e.target.value })}
        placeholder={settings.requireNote ? t('Note (required)') : t('Note (optional) — e.g. owner approved on phone')}
        className='bg-background'
        maxLength={300}
      />

      {limit.overLimit && canApprove ? (
        <div className='space-y-1.5 rounded-md border border-orange-300 bg-orange-50 p-2 dark:border-orange-900 dark:bg-orange-950/30'>
          <p className='flex items-center gap-1.5 text-xs font-medium text-orange-800 dark:text-orange-300'>
            <ShieldCheck className='h-3.5 w-3.5' />
            {t('Above the limit of')} {limit.limitText} ({limit.percent}%) — {t('you can approve it')}
          </p>
          <Input
            value={draft.approvalNote}
            onChange={(e) => set({ approvalNote: e.target.value })}
            placeholder={settings.requireApprovalNote ? t('Why is it approved? (required)') : t('Why is it approved?')}
            className='bg-background'
            maxLength={300}
          />
        </div>
      ) : null}

      {resolved.amount > 0 && (
        <div className='grid grid-cols-3 gap-2 rounded-md bg-background p-2 text-center text-xs'>
          {paymentAmount > 0 ? (
            <div>
              <p className='text-muted-foreground'>{side === 'customer' ? t('Received') : t('Paid')}</p>
              <p className='font-semibold tabular-nums'>{formatMoney(paymentAmount)}</p>
            </div>
          ) : (
            <div>
              <p className='text-muted-foreground'>{t('Owing now')}</p>
              <p className='font-semibold tabular-nums'>{formatMoney(outstanding)}</p>
            </div>
          )}
          <div>
            <p className='text-muted-foreground'>+ {t('Discount')}</p>
            <p className='font-semibold tabular-nums text-amber-700 dark:text-amber-400'>
              {formatMoney(resolved.amount)}
              {limit.percent > 0 ? <span className='ml-1 font-normal text-muted-foreground'>({limit.percent}%)</span> : null}
            </p>
          </div>
          <div>
            <p className='text-muted-foreground'>{t('Balance after')}</p>
            <p className={cn('font-semibold tabular-nums', Math.abs(balanceAfter) < 0.005 ? 'text-emerald-600' : '')}>
              {Math.abs(balanceAfter) < 0.005 ? t('Settled') : formatMoney(balanceAfter)}
            </p>
          </div>
        </div>
      )}

      {resolved.error && Number(draft.value) > 0 ? (
        <p className='flex items-center gap-1.5 text-xs font-medium text-red-600'>
          <AlertTriangle className='h-3.5 w-3.5' />
          {resolved.error}
        </p>
      ) : null}
    </div>
  )
}

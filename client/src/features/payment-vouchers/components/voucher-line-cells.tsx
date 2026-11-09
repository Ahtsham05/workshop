import { forwardRef, useState } from 'react'
import { AlertTriangle, BadgePercent, BookOpen, CheckCircle2, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { LedgerDiscountReason, LedgerDiscountSettings } from '@/stores/ledgerDiscounts.api'
import { DISCOUNT_REASONS, discountReasonLabel, percentOf } from '@/features/ledger-discounts/lib/ledger-discounts'
import type { LineAccountState } from '../utils/line-account-state'

/*
 * One-row voucher cells: Balance · Discount (with a small popover for reason / quick % /
 * approval) · Balance After. Everything a line needs stays on its own row, like a ledger grid.
 */

const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100

/** What the party owes before this line. Customer: owes us. Supplier: we owe them. */
export function PartyBalanceCell({ side, owing }: { side: 'customer' | 'supplier'; owing: number | undefined }) {
  const formatMoney = useFormatMoney()
  const { t } = useLanguage()
  if (owing === undefined) return <span className='block pt-2 text-right text-xs text-muted-foreground'>—</span>
  const advance = owing < -0.005
  return (
    <div className='flex h-9 flex-col items-end justify-center leading-tight'>
      <span className={cn('text-sm font-semibold tabular-nums', advance ? 'text-sky-700 dark:text-sky-400' : owing > 0.005 ? 'text-foreground' : 'text-muted-foreground')}>
        {formatMoney(Math.abs(owing))}
      </span>
      <span className='text-[10px] text-muted-foreground'>
        {advance ? t('advance') : side === 'customer' ? t('receivable') : t('payable')}
      </span>
    </div>
  )
}

/** Balance once this line (payment + discount) is posted. */
export function BalanceAfterCell({ state, active }: { state: LineAccountState | null; active: boolean }) {
  const formatMoney = useFormatMoney()
  const { t } = useLanguage()
  if (!state || state.remaining === undefined || !active) {
    return <span className='block pt-2 text-right text-xs text-muted-foreground'>—</span>
  }
  const remaining = state.remaining
  if (Math.abs(remaining) < 0.005) {
    return (
      <div className='flex h-9 items-center justify-end'>
        <span className='inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'>
          <CheckCircle2 className='h-3.5 w-3.5' />
          {t('Settled')}
        </span>
      </div>
    )
  }
  const advance = remaining < 0
  return (
    <div className='flex h-9 flex-col items-end justify-center leading-tight'>
      <span className={cn('text-sm font-semibold tabular-nums', advance ? 'text-sky-700 dark:text-sky-400' : 'text-amber-700 dark:text-amber-400')}>
        {formatMoney(Math.abs(remaining))}
      </span>
      <span className='text-[10px] text-muted-foreground'>{advance ? t('advance') : t('remaining')}</span>
    </div>
  )
}

/** Small book icon beside the party picker — opens the read-only ledger panel. */
export const QuickLedgerButton = forwardRef<HTMLButtonElement, { onClick: () => void; disabled?: boolean }>(({ onClick, disabled }, ref) => {
  const { t } = useLanguage()
  return (
    <Button
      ref={ref}
      type='button'
      variant='outline'
      size='icon'
      className='h-9 w-9 shrink-0'
      onClick={onClick}
      disabled={disabled}
      title={t('View ledger (your voucher is kept)')}
      aria-label={t('View ledger')}
      tabIndex={-1}
    >
      <BookOpen className='h-4 w-4' />
    </Button>
  )
})
QuickLedgerButton.displayName = 'QuickLedgerButton'

interface DiscountCellProps {
  side: 'customer' | 'supplier'
  amount: number
  discount: number
  reason: LedgerDiscountReason
  approvalNote: string
  state: LineAccountState | null
  settings: LedgerDiscountSettings
  canGive: boolean
  canApprove: boolean
  /** react-hook-form register() props for the number input. */
  inputProps: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }
  onDiscount: (amount: number) => void
  onReason: (reason: LedgerDiscountReason) => void
  onApprovalNote: (note: string) => void
}

/** Discount amount input + a % button that opens reason, quick %, "leave the rest", approval. */
export function LineDiscountCell(props: DiscountCellProps) {
  const { side, amount, discount, reason, approvalNote, state, settings, canGive, canApprove } = props
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [open, setOpen] = useState(false)
  const owing = state?.owingBefore
  const leftAfterPayment = owing === undefined ? undefined : round2(owing - amount)
  const hasDiscount = discount > 0
  const error = state?.error && hasDiscount ? state.error : null
  const needsNote = Boolean(state?.overLimit && canApprove)

  return (
    <div className='relative'>
      <div className='flex'>
        <Input
          type='number'
          min={0}
          step='0.01'
          aria-label={t('Discount')}
          disabled={!canGive}
          title={
            !canGive
              ? t('You do not have permission to give discounts')
              : error || (hasDiscount ? `${discountReasonLabel(reason, t)}` : side === 'customer' ? t('Discount allowed (no cash)') : t('Discount received (no cash)'))
          }
          className={cn(
            'rounded-r-none text-right',
            hasDiscount && 'border-amber-400 bg-amber-50/70 font-medium text-amber-800 dark:bg-amber-950/30 dark:text-amber-300',
            error && 'border-red-500 bg-red-50/60 text-red-700 dark:bg-red-950/30'
          )}
          {...props.inputProps}
        />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type='button'
              variant='outline'
              size='icon'
              disabled={!canGive}
              tabIndex={-1}
              className={cn(
                'h-9 w-8 shrink-0 rounded-l-none border-l-0',
                hasDiscount && 'border-amber-400 text-amber-700',
                error && 'border-red-500 text-red-600'
              )}
              title={t('Reason, quick % and approval')}
              aria-label={t('Discount options')}
            >
              {error ? <AlertTriangle className='h-3.5 w-3.5' /> : <BadgePercent className='h-3.5 w-3.5' />}
            </Button>
          </PopoverTrigger>
          <PopoverContent align='end' className='w-72 space-y-3 p-3'>
            <div className='flex items-baseline justify-between gap-2'>
              <p className='text-sm font-semibold'>{side === 'customer' ? t('Discount allowed') : t('Discount received')}</p>
              {owing !== undefined && (
                <p className='text-xs text-muted-foreground'>
                  {t('Owing')}: <span className='font-medium text-foreground'>{formatMoney(owing)}</span>
                </p>
              )}
            </div>
            <div className='space-y-1'>
              <p className='text-xs text-muted-foreground'>{t('Reason')}</p>
              <Select value={reason} onValueChange={(v) => props.onReason(v as LedgerDiscountReason)}>
                <SelectTrigger className='h-8 w-full text-sm'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISCOUNT_REASONS.map((r) => (
                    <SelectItem key={r.value} value={r.value}>
                      {t(r.label)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {owing !== undefined && owing > 0 && (
              <div className='space-y-1'>
                <p className='text-xs text-muted-foreground'>{t('Quick')}</p>
                <div className='flex flex-wrap gap-1.5'>
                  {settings.quickPercents.map((p) => (
                    <Button key={p} type='button' variant='outline' size='sm' className='h-7 px-2 text-xs' onClick={() => props.onDiscount(percentOf(owing, p))}>
                      {p}% · {formatMoney(percentOf(owing, p))}
                    </Button>
                  ))}
                  {leftAfterPayment !== undefined && leftAfterPayment > 0.005 && amount > 0 && (
                    <Button
                      type='button'
                      variant='secondary'
                      size='sm'
                      className='h-7 px-2 text-xs'
                      onClick={() => {
                        props.onDiscount(leftAfterPayment)
                        setOpen(false)
                      }}
                    >
                      {t('Leave the rest')} · {formatMoney(leftAfterPayment)}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {needsNote && (
              <div className='space-y-1 rounded-md border border-orange-300 bg-orange-50 p-2 dark:border-orange-900 dark:bg-orange-950/30'>
                <p className='flex items-center gap-1 text-xs font-medium text-orange-800 dark:text-orange-300'>
                  <ShieldCheck className='h-3.5 w-3.5' />
                  {t('Above the limit — you can approve it')}
                </p>
                <Input
                  value={approvalNote}
                  onChange={(e) => props.onApprovalNote(e.target.value)}
                  placeholder={t('Why is it approved?')}
                  className='h-8 bg-background text-sm'
                  maxLength={300}
                />
              </div>
            )}
            {error && <p className='text-xs font-medium text-red-600'>{error}</p>}
            <div className='flex justify-between'>
              {hasDiscount ? (
                <Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-xs text-muted-foreground' onClick={() => props.onDiscount(0)}>
                  {t('Remove discount')}
                </Button>
              ) : (
                <span />
              )}
              <Button type='button' size='sm' className='h-7 px-3 text-xs' onClick={() => setOpen(false)}>
                {t('Done')}
              </Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

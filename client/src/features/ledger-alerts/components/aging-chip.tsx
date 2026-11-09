import { CalendarClock } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatAppDate } from '@/lib/date-format'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import type { CustomerAging, LedgerAlertSettings } from '@/stores/ledgerAlerts.api'
import { getBusinessToday } from '@/lib/business-timezone'
import { calendarOfDue, daysBetween, describeDays, hexToRgba, toneForCustomer, toneForState, type LedgerTone } from '../lib/ledger-colors'

/** Solid-dot pill in a band colour — the building block of every ledger colour label. */
export function TonePill({ tone, children, className, size = 'sm' }: { tone: LedgerTone; children: React.ReactNode; className?: string; size?: 'xs' | 'sm' }) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 whitespace-nowrap rounded-full border font-medium',
        size === 'xs' ? 'px-1.5 py-0 text-[10px]' : 'px-2 py-0.5 text-xs',
        className
      )}
      style={{ backgroundColor: hexToRgba(tone.color, 0.14), borderColor: hexToRgba(tone.color, 0.45), color: 'inherit' }}
    >
      <span className='h-2 w-2 shrink-0 rounded-full' style={{ backgroundColor: tone.color }} />
      <span className='truncate'>{children}</span>
    </span>
  )
}

/**
 * Customer due status chip: "13 days overdue" in the band colour, with a tooltip of what is
 * late (amount, oldest due date, worst invoices) and what falls due next.
 * Renders nothing for a customer with no colour (not late, nothing due soon).
 */
export function AgingChip({
  aging,
  settings,
  size = 'sm',
  showAmount = false,
  className,
}: {
  aging: CustomerAging | null | undefined
  settings: LedgerAlertSettings
  size?: 'xs' | 'sm'
  showAmount?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const tone = toneForCustomer(aging, settings)
  if (!aging || !tone) return null

  let text: string
  if (aging.state === 'overdue') text = t(describeDays('overdue', aging.oldestDaysOverdue, null))
  else if (aging.state === 'due_today') text = t(settings.dueTodayLabel)
  else {
    const until = aging.nextDueDate ? Math.max(1, daysBetween(getBusinessToday(), aging.nextDueDate)) : null
    text = until ? t(describeDays('due_soon', 0, until)) : t(settings.dueSoonLabel)
  }
  const amount = aging.state === 'overdue' ? aging.overdueAmount : aging.state === 'due_today' ? aging.dueTodayAmount : aging.dueSoonAmount

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={cn('inline-flex cursor-default', className)} onClick={(e) => e.stopPropagation()}>
          <TonePill tone={tone} size={size}>
            {text}
            {showAmount ? <span className='ml-1 tabular-nums opacity-80'>· {formatMoney(amount)}</span> : null}
          </TonePill>
        </span>
      </TooltipTrigger>
      <TooltipContent side='top' className='max-w-xs text-left'>
        <div className='space-y-1 py-0.5'>
          <div className='flex items-center gap-1.5 font-semibold'>
            <span className='h-2 w-2 rounded-full' style={{ backgroundColor: tone.color }} />
            {t(tone.label)}
          </div>
          {aging.overdueAmount > 0 && (
            <div>
              {t('Overdue')}: <span className='font-semibold tabular-nums'>{formatMoney(aging.overdueAmount)}</span>
              {aging.overdueCount > 1 ? ` (${aging.overdueCount} ${t('items')})` : ''}
            </div>
          )}
          {aging.oldestDueDate && (
            <div>
              {t('Oldest due date')}: {formatAppDate(aging.oldestDueDate)}
            </div>
          )}
          {(aging.topOverdue || []).map((item, i) => (
            <div key={i} className='flex justify-between gap-3 opacity-90'>
              <span className='truncate'>
                {item.reference || item.description || t('Opening / other')} · {item.daysOverdue}d
              </span>
              <span className='tabular-nums'>{formatMoney(item.openAmount)}</span>
            </div>
          ))}
          {aging.nextDueDate && (
            <div className='flex items-center gap-1 opacity-90'>
              <CalendarClock className='h-3 w-3' />
              {t('Next due')}: {formatAppDate(aging.nextDueDate)} · {formatMoney(aging.nextDueAmount)}
            </div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}

/** Chip for ONE invoice/item (invoice list rows, aging detail rows). */
export function DueStateChip({
  state,
  daysOverdue,
  daysUntilDue,
  bandIndex,
  settings,
  dueDate,
  size = 'xs',
  showWhenCalm = true,
}: {
  state: string
  daysOverdue: number
  daysUntilDue: number | null
  bandIndex: number
  settings: LedgerAlertSettings
  dueDate?: string | Date | null
  size?: 'xs' | 'sm'
  /** Also show plain "Due in 12 days" / due date for an item that isn't coloured. */
  showWhenCalm?: boolean
}) {
  const { t } = useLanguage()
  if (state === 'settled') return null
  const tone = toneForState(state as never, bandIndex, settings)
  const text = describeDays(state, daysOverdue, daysUntilDue)
  if (tone) {
    return (
      <TonePill tone={tone} size={size}>
        {t(text)}
      </TonePill>
    )
  }
  if (!showWhenCalm) return null
  const due = calendarOfDue(dueDate ?? null)
  return (
    <span className='text-[11px] text-muted-foreground whitespace-nowrap'>
      {due ? `${t('Due')} ${formatAppDate(due)}` : t(text)}
    </span>
  )
}

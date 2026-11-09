import { BadgePercent } from 'lucide-react'
import { useFormatMoney } from '@/lib/format-money'
import { discountReasonLabel } from '../lib/ledger-discounts'

interface DiscountLike {
  debit?: number
  credit?: number
  description?: string
  discount?: {
    reason?: string
    percent?: number
    linkedAmount?: number
    overLimit?: boolean
    approvalNote?: string
  } | null
}

/** Auto-written server text ("Discount allowed — …") adds nothing next to the chips. */
const isAutoText = (desc?: string) => !desc || /^discount (allowed|received)\b/i.test(desc.trim())

/**
 * How a Discount Allowed / Received ledger line explains itself on screen: reason chip, %,
 * the payment it came with and what was settled, plus the over-limit approval.
 */
export function DiscountLineInfo({ entry, t, compact }: { entry: DiscountLike; t: (k: string) => string; compact?: boolean }) {
  const formatMoney = useFormatMoney()
  const amount = (Number(entry.debit) || 0) + (Number(entry.credit) || 0)
  const d = entry.discount || {}
  return (
    <div className='flex flex-col items-start gap-0.5'>
      {!isAutoText(entry.description) && <span className='text-sm'>{entry.description}</span>}
      <div className='flex flex-wrap items-center gap-1'>
        <span className='inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300'>
          <BadgePercent className='h-3 w-3' />
          {discountReasonLabel(d.reason, t)}
          {d.percent ? ` · ${d.percent}%` : ''}
        </span>
        {d.overLimit && (
          <span
            className='rounded bg-orange-100 px-1.5 py-0.5 text-[11px] font-medium text-orange-800 dark:bg-orange-900/40 dark:text-orange-300'
            title={d.approvalNote || ''}
          >
            {t('Approved over limit')}
          </span>
        )}
      </div>
      {!compact && d.linkedAmount ? (
        <span className='text-[11px] text-muted-foreground'>
          {t('with payment')} {formatMoney(d.linkedAmount)} → {t('settled')} {formatMoney(d.linkedAmount + amount)}
        </span>
      ) : null}
      {!compact && d.overLimit && d.approvalNote ? (
        <span className='text-[11px] text-orange-700 dark:text-orange-400'>
          {t('Approved')}: {d.approvalNote}
        </span>
      ) : null}
    </div>
  )
}

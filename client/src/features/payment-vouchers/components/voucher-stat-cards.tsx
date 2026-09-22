import { ArrowDownLeft, ArrowUpRight, CalendarDays, Clock3, Landmark, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { VoucherStatBucket } from '../hooks/use-voucher-summary'

type Tone = 'rose' | 'emerald' | 'sky' | 'violet' | 'amber'

const TONE_ICON_BG: Record<Tone, string> = {
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  violet: 'bg-violet-500/12 text-violet-600 dark:text-violet-400',
  amber: 'bg-amber-500/12 text-amber-600 dark:text-amber-400',
}

interface StatTileProps {
  icon: LucideIcon
  tone: Tone
  label: string
  value: string
  subtitle: string
}

function StatTile({ icon: Icon, tone, label, value, subtitle }: StatTileProps) {
  return (
    <Card className='rounded-xl border bg-card shadow-sm'>
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-full', TONE_ICON_BG[tone])}>
          <Icon className='h-5 w-5' />
        </div>
        <div className='min-w-0'>
          <p className='truncate text-xs font-medium text-muted-foreground'>{label}</p>
          <p className='text-lg font-bold tabular-nums'>{value}</p>
          <p className='truncate text-xs text-muted-foreground'>{subtitle}</p>
        </div>
      </CardContent>
    </Card>
  )
}

interface Props {
  kind: 'payment' | 'receipt'
  total: VoucherStatBucket
  month: VoucherStatBucket
  cashBank: VoucherStatBucket
}

export function VoucherStatCards({ kind, total, month, cashBank }: Props) {
  const formatMoney = useFormatMoney()
  const isPayment = kind === 'payment'

  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
      <StatTile
        icon={isPayment ? ArrowUpRight : ArrowDownLeft}
        tone={isPayment ? 'rose' : 'emerald'}
        label={isPayment ? 'Total Payments' : 'Total Receipts'}
        value={formatMoney(total.amount)}
        subtitle={`${total.count} ${total.count === 1 ? 'voucher' : 'vouchers'}`}
      />
      <StatTile
        icon={CalendarDays}
        tone='sky'
        label='This Month'
        value={formatMoney(month.amount)}
        subtitle={`${month.count} ${month.count === 1 ? 'voucher' : 'vouchers'}`}
      />
      <StatTile
        icon={Landmark}
        tone='violet'
        label='Cash & Bank'
        value={formatMoney(cashBank.amount)}
        subtitle={`${cashBank.count} ${cashBank.count === 1 ? 'account' : 'accounts'}`}
      />
      <StatTile icon={Clock3} tone='amber' label='Pending / Review' value={formatMoney(0)} subtitle='0 vouchers' />
    </div>
  )
}

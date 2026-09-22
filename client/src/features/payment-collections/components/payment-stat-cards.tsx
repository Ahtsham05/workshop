import { ArrowDownLeft, ArrowUpRight, Ban, CalendarDays, RotateCcw, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { PaymentStatBucket } from '../hooks/use-payment-summary'

type Tone = 'rose' | 'emerald' | 'sky' | 'orange' | 'slate'

const TONE_ICON_BG: Record<Tone, string> = {
  rose: 'bg-rose-500/12 text-rose-600 dark:text-rose-400',
  emerald: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  sky: 'bg-sky-500/12 text-sky-600 dark:text-sky-400',
  orange: 'bg-orange-500/12 text-orange-600 dark:text-orange-400',
  slate: 'bg-slate-500/12 text-slate-600 dark:text-slate-400',
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
  kind: 'customer' | 'supplier'
  total: PaymentStatBucket
  month: PaymentStatBucket
  refunded: PaymentStatBucket
  voided: PaymentStatBucket
}

export function PaymentStatCards({ kind, total, month, refunded, voided }: Props) {
  const formatMoney = useFormatMoney()
  const isCustomer = kind === 'customer'

  return (
    <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
      <StatTile
        icon={isCustomer ? ArrowDownLeft : ArrowUpRight}
        tone={isCustomer ? 'emerald' : 'rose'}
        label={isCustomer ? 'Payments Received' : 'Payments Paid'}
        value={formatMoney(total.amount)}
        subtitle={`${total.count} ${total.count === 1 ? 'payment' : 'payments'}`}
      />
      <StatTile
        icon={CalendarDays}
        tone='sky'
        label='This Month'
        value={formatMoney(month.amount)}
        subtitle={`${month.count} ${month.count === 1 ? 'payment' : 'payments'}`}
      />
      <StatTile
        icon={RotateCcw}
        tone='orange'
        label='Refunded'
        value={formatMoney(refunded.amount)}
        subtitle={`${refunded.count} ${refunded.count === 1 ? 'refund' : 'refunds'}`}
      />
      <StatTile
        icon={Ban}
        tone='slate'
        label='Voided'
        value={formatMoney(voided.amount)}
        subtitle={`${voided.count} ${voided.count === 1 ? 'payment' : 'payments'}`}
      />
    </div>
  )
}

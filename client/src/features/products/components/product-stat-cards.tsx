import { PackageX, AlertTriangle, AlertOctagon, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'

interface Props {
  outOfStock: number
  lowStock: number
  criticalStock: number
  totalProducts: number
  loading?: boolean
}

const CARD_TONES = {
  rose: {
    card: 'border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/20',
    icon: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  orange: {
    card: 'border-orange-200 bg-orange-50 dark:border-orange-900/50 dark:bg-orange-950/20',
    icon: 'bg-orange-500/15 text-orange-600 dark:text-orange-400',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20',
    icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
} as const

/** Top-of-page snapshot cards — real current counts only (no trend %/sparkline, since
 * there's no historical stats tracking to back a real "vs last month" comparison). */
export function ProductStatCards({ outOfStock, lowStock, criticalStock, totalProducts, loading }: Props) {
  const { t } = useLanguage()

  const cards: { label: string; value: number; icon: typeof PackageX; tone: keyof typeof CARD_TONES }[] = [
    { label: t('out_of_stock'), value: outOfStock, icon: PackageX, tone: 'rose' },
    { label: t('low_stock'), value: lowStock, icon: AlertTriangle, tone: 'orange' },
    { label: t('critical_stock'), value: criticalStock, icon: AlertOctagon, tone: 'amber' },
    { label: t('total_products'), value: totalProducts, icon: Boxes, tone: 'emerald' },
  ]

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <div key={label} className={cn('flex items-center gap-4 rounded-xl border p-4', CARD_TONES[tone].card)}>
          <span className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', CARD_TONES[tone].icon)}>
            <Icon className='h-5 w-5' />
          </span>
          <div className='min-w-0'>
            <p className='truncate text-sm font-medium text-muted-foreground'>{label}</p>
            <p className='text-2xl font-bold tabular-nums text-foreground'>{loading ? '…' : value.toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

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
    // Phones: two cards per row. Each becomes a small grid — icon and label on the first row, the number
    // under them — so a long label wraps beside the icon instead of being cut. All `max-sm:`, so from 640px
    // up the cards are laid out exactly as before.
    <div className='grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4 max-sm:gap-3'>
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <div
          key={label}
          className={cn(
            'flex items-center gap-4 rounded-xl border p-4',
            'max-sm:grid max-sm:grid-cols-[2.25rem_minmax(0,1fr)] max-sm:grid-rows-[minmax(2.25rem,auto)] max-sm:content-start max-sm:gap-x-2.5 max-sm:p-3',
            CARD_TONES[tone].card,
          )}
        >
          <span
            className={cn(
              'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl',
              'max-sm:col-start-1 max-sm:row-start-1 max-sm:h-9 max-sm:w-9 max-sm:self-center',
              CARD_TONES[tone].icon,
            )}
          >
            <Icon className='h-5 w-5 max-sm:h-4 max-sm:w-4' />
          </span>
          <div className='min-w-0 max-sm:contents'>
            <p className='truncate text-sm font-medium text-muted-foreground max-sm:col-start-2 max-sm:row-start-1 max-sm:line-clamp-2 max-sm:self-center max-sm:whitespace-normal max-sm:break-words max-sm:text-[13px] max-sm:leading-snug'>
              {label}
            </p>
            <p className='text-2xl font-bold tabular-nums text-foreground max-sm:col-span-2 max-sm:row-start-2 max-sm:mt-1'>
              {loading ? '…' : value.toLocaleString()}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}

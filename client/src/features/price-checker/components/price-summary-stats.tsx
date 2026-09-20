import { ChevronRight, Store, TrendingDown, TrendingUp, Globe2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'

// Same tile look as features/products/components/product-stat-cards.tsx (tone-tinted
// border/bg + icon badge) — reused here rather than invented fresh, for visual
// consistency with the rest of the app's "snapshot stats" convention.
const CARD_TONES = {
  sky: {
    card: 'border-sky-200 bg-sky-50 dark:border-sky-900/50 dark:bg-sky-950/20',
    icon: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  },
  emerald: {
    card: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/20',
    icon: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  amber: {
    card: 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20',
    icon: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  slate: {
    card: 'border-slate-200 bg-slate-50 dark:border-slate-800/60 dark:bg-slate-900/20',
    icon: 'bg-slate-500/15 text-slate-600 dark:text-slate-400',
  },
} as const

interface CompetitorStat {
  price: number
  sourceName: string
}

interface PriceSummaryStatsProps {
  ownPrice: number | null
  lowest: CompetitorStat | null
  highest: CompetitorStat | null
  sitesChecked: number
  sitesWithPrice: number
  formatMoney: (amount: number) => string
  onGoToCatalog: () => void
  onGoToLowest: () => void
  onGoToHighest: () => void
  onGoToSites: () => void
}

/** At-a-glance comparison strip shown above the detailed results — the page's "so what"
 * before the user scans every card individually. Each tile is clickable and jumps to the
 * matching detail below (or opens Manage Sites for "Sites Checked") rather than being a
 * purely decorative chevron. */
export function PriceSummaryStats({
  ownPrice,
  lowest,
  highest,
  sitesChecked,
  sitesWithPrice,
  formatMoney,
  onGoToCatalog,
  onGoToLowest,
  onGoToHighest,
  onGoToSites,
}: PriceSummaryStatsProps) {
  const { t } = useLanguage()

  const tiles: {
    label: string
    value: string
    sub: string
    icon: typeof Store
    tone: keyof typeof CARD_TONES
    onClick: () => void
  }[] = [
    {
      label: t('Your Price'),
      value: ownPrice !== null ? formatMoney(ownPrice) : '—',
      sub: ownPrice !== null ? t('In your catalog') : t('Not in your catalog'),
      icon: Store,
      tone: 'sky',
      onClick: onGoToCatalog,
    },
    {
      label: t('Lowest Found'),
      value: lowest ? formatMoney(lowest.price) : '—',
      sub: lowest ? lowest.sourceName : t('No prices found yet'),
      icon: TrendingDown,
      tone: 'emerald',
      onClick: onGoToLowest,
    },
    {
      label: t('Highest Found'),
      value: highest ? formatMoney(highest.price) : '—',
      sub: highest ? highest.sourceName : t('No prices found yet'),
      icon: TrendingUp,
      tone: 'amber',
      onClick: onGoToHighest,
    },
    {
      label: t('Sites Checked'),
      value: `${sitesWithPrice}/${sitesChecked}`,
      sub: t('found a price'),
      icon: Globe2,
      tone: 'slate',
      onClick: onGoToSites,
    },
  ]

  // Each tile lays itself out from its OWN width (container query), not the viewport: a
  // tile in a 2-column phone grid, or one of four columns on a desktop with DevTools/sidebar
  // eating width, is often ~140-230px — too narrow for icon + text + chevron in one row (the
  // label/value all truncated to "Yo…"/"£…"). Below 15rem the icon and chevron share a top
  // row and the text gets the tile's full width underneath; at 15rem+ it's the horizontal
  // icon | text | chevron layout.
  return (
    <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4'>
      {tiles.map(({ label, value, sub, icon: Icon, tone, onClick }) => (
        <div key={label} className='@container min-w-0'>
          <button
            type='button'
            onClick={onClick}
            className={cn(
              'grid w-full grid-cols-[1fr_auto] items-start gap-y-2 rounded-xl border p-3 text-left transition-colors hover:brightness-95 dark:hover:brightness-110',
              '@[15rem]:grid-cols-[auto_minmax(0,1fr)_auto] @[15rem]:items-center @[15rem]:gap-x-3 @[15rem]:gap-y-0 @[15rem]:p-4',
              CARD_TONES[tone].card,
            )}
          >
            <span
              className={cn(
                'col-start-1 row-start-1 inline-flex h-9 w-9 items-center justify-center rounded-xl @[15rem]:h-10 @[15rem]:w-10',
                CARD_TONES[tone].icon,
              )}
            >
              <Icon className='h-[18px] w-[18px] @[15rem]:h-5 @[15rem]:w-5' />
            </span>
            <div className='col-span-2 row-start-2 min-w-0 @[15rem]:col-span-1 @[15rem]:col-start-2 @[15rem]:row-start-1'>
              <p className='truncate text-xs font-medium text-muted-foreground'>{label}</p>
              <p className='truncate text-base font-bold tabular-nums text-foreground @[15rem]:text-xl'>{value}</p>
              <p className='truncate text-[11px] text-muted-foreground'>{sub}</p>
            </div>
            <ChevronRight className='col-start-2 row-start-1 h-4 w-4 justify-self-end text-muted-foreground/60 @[15rem]:col-start-3' />
          </button>
        </div>
      ))}
    </div>
  )
}

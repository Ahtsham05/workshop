import { useMemo, useState } from 'react'
import { Info, Loader2 } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { useGetProductListInsightsQuery } from '@/stores/productList.api'

/**
 * A product list's decision figures — stock health, money held, and what it sold over a
 * period. Lists are for planning only: nothing here (or anywhere on a list) changes stock.
 */

export const LIST_PERIOD_OPTIONS = [7, 30, 90, 365] as const
const PERIOD_KEY = 'productListPeriodDays'

export interface ListPeriod {
  days: number
  setDays: (days: number) => void
  startDate: string
  endDate: string
}

/** The sales period list views use (header totals and the table's sales columns), remembered. */
export function useListPeriod(): ListPeriod {
  const [days, setDaysState] = useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(PERIOD_KEY))
      return (LIST_PERIOD_OPTIONS as readonly number[]).includes(v) ? v : 30
    } catch {
      return 30
    }
  })
  const setDays = (next: number) => {
    setDaysState(next)
    try {
      localStorage.setItem(PERIOD_KEY, String(next))
    } catch {
      // Not remembered — fine.
    }
  }
  return useMemo(() => {
    const endDate = getBusinessToday()
    return { days, setDays, startDate: shiftBusinessCalendarDate(endDate, -(days - 1)), endDate }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days])
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: string }) {
  return (
    <div className='min-w-0 rounded-lg border bg-background px-3 py-2'>
      <p className='truncate text-[11px] text-muted-foreground'>{label}</p>
      <p className={cn('truncate text-base font-semibold tabular-nums', tone)} title={value}>
        {value}
      </p>
      {/* Wraps rather than cuts off — "Potential profit Rs70,000.00" must stay readable. */}
      {sub && <p className='text-[11px] leading-tight text-muted-foreground [overflow-wrap:anywhere]'>{sub}</p>}
    </div>
  )
}

export function ListInsightsPanel({ listId, period }: { listId: string; period: ListPeriod }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data, isFetching } = useGetProductListInsightsQuery({ id: listId, startDate: period.startDate, endDate: period.endDate })
  const n = (v: number | undefined) => (v ?? 0).toLocaleString()
  const m = (v: number | undefined) => formatMoney(v ?? 0)

  return (
    <div className='mt-3 space-y-2'>
      <div className='flex flex-wrap items-center justify-between gap-2'>
        <p className='flex items-center gap-1.5 text-xs text-muted-foreground'>
          <Info className='h-3.5 w-3.5 shrink-0' />
          {t('For planning only — adding to or removing from a list never changes stock.')}
        </p>
        <div className='flex items-center gap-2'>
          {isFetching && <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />}
          <span className='text-xs text-muted-foreground'>{t('Sales in')}</span>
          <Select value={String(period.days)} onValueChange={(v) => period.setDays(Number(v))}>
            <SelectTrigger className='h-8 w-[130px] text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIST_PERIOD_OPTIONS.map((d) => (
                <SelectItem key={d} value={String(d)}>
                  {t('Last {{n}} days', { n: String(d) })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className='grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8'>
        <Tile
          label={t('Products')}
          value={n(data?.productCount)}
          sub={`${n(data?.inStock)} ${t('in stock')} · ${n(data?.outOfStock)} ${t('out')}`}
        />
        <Tile
          label={t('Low stock')}
          value={n(data?.lowStock)}
          tone={data?.lowStock ? 'text-amber-600 dark:text-amber-400' : undefined}
          sub={data?.outOfStock ? `${n(data.outOfStock)} ${t('out of stock')}` : undefined}
        />
        <Tile label={t('Stock qty')} value={n(data?.stockQuantity)} />
        <Tile label={t('Value at cost')} value={m(data?.stockValue)} />
        <Tile label={t('Value at sale price')} value={m(data?.saleValue)} sub={`${t('Potential profit')} ${m(data?.potentialProfit)}`} />
        <Tile
          label={t('Sold ({{n}}d)', { n: String(period.days) })}
          value={n(data?.unitsSold)}
          sub={`${n(data?.sellingProducts)} ${t('of')} ${n(data?.productCount)} ${t('products sold')}`}
        />
        <Tile
          label={t('Revenue ({{n}}d)', { n: String(period.days) })}
          value={m(data?.revenue)}
          sub={`${t('Profit')} ${m(data?.profit)}${data?.margin != null ? ` · ${data.margin}%` : ''}`}
          tone={data && data.profit < 0 ? 'text-red-600 dark:text-red-400' : undefined}
        />
        <Tile
          label={t('Dead stock')}
          value={n(data?.deadStock)}
          sub={data?.deadStockValue ? `${m(data.deadStockValue)} ${t('held')}` : t('Not sold in 90 days')}
          tone={data?.deadStock ? 'text-rose-600 dark:text-rose-400' : undefined}
        />
      </div>
    </div>
  )
}

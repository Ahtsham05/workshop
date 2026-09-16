import { Award, Boxes, CircleDollarSign, Package, Tag, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { getUnitLabel } from '@/lib/units'
import { cn } from '@/lib/utils'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { KpiTile } from '../../analytics/components/kpi-tile'
import { formatDays, formatPct, formatQty } from '../../analytics/lib/analytics-format'

export function ProductKpis({ data, refreshing }: { data: ProductAnalyticsResponse; refreshing: boolean }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { metrics, product, rankedCounts, totalProducts } = data
  const unit = getUnitLabel(product.unit)

  const listPrice = product.hasVariants ? null : product.price
  const priceGap = listPrice && metrics.avgSellingPrice !== null ? ((metrics.avgSellingPrice - listPrice) / listPrice) * 100 : null

  return (
    <div className={cn('grid grid-cols-1 gap-3 transition-opacity sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6', refreshing && 'opacity-60')}>
      <KpiTile
        label={t('Net sales')}
        value={formatMoney(metrics.netRevenue)}
        icon={CircleDollarSign}
        growth={metrics.revenueGrowth}
        isNew={metrics.isNew}
        hint={t('{{count}} invoices · was {{amount}}', { count: metrics.invoiceCount, amount: formatMoney(metrics.previous.netRevenue) })}
      />
      <KpiTile
        label={t('Gross profit')}
        value={formatMoney(metrics.netProfit)}
        icon={TrendingUp}
        tone={metrics.netProfit < 0 ? 'danger' : 'success'}
        growth={metrics.profitGrowth}
        isNew={metrics.isNew}
        hint={t('{{margin}} margin', { margin: formatPct(metrics.margin) })}
      />
      <KpiTile
        label={t('Units sold')}
        value={`${formatQty(metrics.netUnits)} ${unit}`}
        icon={Boxes}
        tone='info'
        growth={metrics.unitsGrowth}
        isNew={metrics.isNew}
        hint={
          metrics.unitsReturned > 0
            ? t('{{rate}}/day · {{returned}} returned', { rate: formatQty(metrics.velocity), returned: formatQty(metrics.unitsReturned) })
            : t('{{rate}}/day', { rate: formatQty(metrics.velocity) })
        }
      />
      <KpiTile
        label={t('In stock')}
        value={`${formatQty(metrics.currentStock)} ${unit}`}
        icon={Package}
        tone={metrics.currentStock <= 0 ? 'danger' : metrics.daysOfCover !== null && metrics.daysOfCover <= 14 ? 'warning' : 'default'}
        hint={
          metrics.daysOfCover !== null
            ? t('{{days}} left · {{value}}', { days: formatDays(metrics.daysOfCover, t), value: formatMoney(metrics.stockValue) })
            : t('Worth {{value}}', { value: formatMoney(metrics.stockValue) })
        }
      />
      <KpiTile
        label={t('Avg selling price')}
        value={metrics.avgSellingPrice !== null ? formatMoney(metrics.avgSellingPrice) : '—'}
        icon={Tag}
        hint={
          priceGap !== null && Math.abs(priceGap) >= 0.5
            ? t('{{pct}} vs list price {{price}}', {
                pct: `${priceGap > 0 ? '+' : '−'}${Math.abs(priceGap).toFixed(1)}%`,
                price: formatMoney(listPrice || 0),
              })
            : metrics.avgPurchaseCost !== null
              ? t('Bought at {{cost}} on average', { cost: formatMoney(metrics.avgPurchaseCost) })
              : t('At list price')
        }
      />
      <KpiTile
        label={t('Sales rank')}
        value={metrics.ranks.revenue ? `#${metrics.ranks.revenue}` : '—'}
        icon={Award}
        tone={metrics.abcClass === 'A' ? 'success' : 'default'}
        hint={
          metrics.ranks.revenue
            ? t('of {{count}} selling · {{share}} of sales', { count: rankedCounts.revenue, share: formatPct(metrics.revenueShare) })
            : t('Not ranked — no net sales among {{count}} products', { count: totalProducts })
        }
      />
    </div>
  )
}

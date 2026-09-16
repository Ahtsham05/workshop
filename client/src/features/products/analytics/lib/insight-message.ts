import type { ProductInsight } from '@/stores/productAnalytics.api'
import { formatDays, formatPct, formatQty } from './analytics-format'

type Translate = (key: string, vars?: Record<string, string | number>) => string

/**
 * Wording for the server's insight codes (see server/src/utils/productAnalyticsMetrics.js
 * buildProductInsights — thresholds live there, wording lives here). Unknown codes return
 * null so a newer server never renders a blank row on an older client.
 */
export function describeInsight(
  insight: ProductInsight,
  t: Translate,
  formatMoney: (amount: number) => string,
): { title: string; detail: string } | null {
  const p = insight.params
  const num = (key: string) => Number(p[key] ?? 0)

  switch (insight.code) {
    case 'out_of_stock_while_selling':
      return {
        title: t('Out of stock while in demand'),
        detail: t('{{units}} units sold in this period, but nothing is left on the shelf. Restock to avoid losing sales.', {
          units: formatQty(num('units')),
        }),
      }
    case 'stockout_risk':
      return {
        title: t('Stock runs out in {{when}}', { when: formatDays(p.cover === undefined ? num('days') : num('cover'), t) }),
        detail: t('Selling about {{perDay}} units a day at the current pace. Consider reordering soon.', {
          perDay: formatQty(num('perDay')),
        }),
      }
    case 'price_below_cost':
      return {
        title: t('Selling price is below cost'),
        detail: t('Price {{price}} is lower than cost {{cost}} — every sale loses money.', {
          price: formatMoney(num('price')),
          cost: formatMoney(num('cost')),
        }),
      }
    case 'selling_at_loss':
      return {
        title: t('Sold at a loss this period'),
        detail: t('Net loss of {{loss}} after discounts and returns.', { loss: formatMoney(num('loss')) }),
      }
    case 'margin_drop':
      return {
        title: t('Margin fell from {{from}} to {{to}}', { from: formatPct(num('from')), to: formatPct(num('to')) }),
        detail: t('Compared with the previous period. Check recent cost increases or discounts.'),
      }
    case 'dead_stock':
      return {
        title: p.neverSold ? t('Never sold') : t('No sale in {{days}} days', { days: num('days') }),
        detail: t('{{value}} of stock is tied up. Consider a discount, bundle or return to supplier.', {
          value: formatMoney(num('stockValue')),
        }),
      }
    case 'overstock':
      return {
        title: t('Overstocked: about {{days}} days of stock', { days: num('days') }),
        detail: t('{{value}} held at the current selling pace. Slow down reordering.', { value: formatMoney(num('stockValue')) }),
      }
    case 'high_return_rate':
      return {
        title: t('High return rate: {{rate}}', { rate: formatPct(num('rate')) }),
        detail: t('{{units}} units came back this period. Check quality or the supplier batch.', { units: formatQty(num('units')) }),
      }
    case 'sales_growth':
      return {
        title: t('Sales up {{pct}}', { pct: formatPct(num('pct')) }),
        detail: t('Compared with the previous period of the same length.'),
      }
    case 'sales_decline':
      return {
        title: t('Sales down {{pct}}', { pct: formatPct(num('pct')) }),
        detail: t('Compared with the previous period of the same length.'),
      }
    case 'discounting':
      return {
        title: t('Selling {{pct}} below list price', { pct: formatPct(num('pct')) }),
        detail: t('Average selling price {{avg}} vs list price {{list}}.', {
          avg: formatMoney(num('avgPrice')),
          list: formatMoney(num('listPrice')),
        }),
      }
    case 'cheaper_supplier':
      return {
        title: t('{{supplier}} is cheaper', { supplier: String(p.supplier ?? '') }),
        detail: t('Averaged {{cost}} vs {{currentCost}} from {{currentSupplier}} — saves {{saving}} per unit.', {
          cost: formatMoney(num('cost')),
          currentCost: formatMoney(num('currentCost')),
          currentSupplier: String(p.currentSupplier ?? ''),
          saving: formatMoney(num('savingPerUnit')),
        }),
      }
    case 'cost_increase':
      return {
        title: t('Purchase cost up {{pct}}', { pct: formatPct(num('pct')) }),
        detail: t('Last bought at {{last}} vs {{avg}} average this period. Review the selling price.', {
          last: formatMoney(num('lastCost')),
          avg: formatMoney(num('avgCost')),
        }),
      }
    case 'top_performer':
      return {
        title: t('#{{rank}} best seller by sales', { rank: num('rank') }),
        detail: t('Brings in {{share}} of all product sales. Keep it in stock.', { share: formatPct(num('share')) }),
      }
    default:
      return null
  }
}

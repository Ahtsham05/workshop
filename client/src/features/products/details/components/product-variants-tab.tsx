import { AlertTriangle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { formatPct, formatQty } from '../../analytics/lib/analytics-format'

export function ProductVariantsTab({ data }: { data: ProductAnalyticsResponse }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const totalRevenue = data.variants.reduce((sum, variant) => sum + variant.revenue, 0)

  return (
    <div className='overflow-x-auto rounded-lg border'>
      <Table className='min-w-[760px]'>
        <TableHeader>
          <TableRow>
            <TableHead>{t('Variant')}</TableHead>
            <TableHead className='text-right'>{t('Price')}</TableHead>
            <TableHead className='text-right'>{t('Cost')}</TableHead>
            <TableHead className='text-right'>{t('In stock')}</TableHead>
            <TableHead className='text-right'>{t('Units sold')}</TableHead>
            <TableHead className='text-right'>{t('Sales')}</TableHead>
            <TableHead className='text-right'>{t('Profit')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.variants.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className='py-10 text-center text-sm text-muted-foreground'>
                {t('No variants yet.')}
              </TableCell>
            </TableRow>
          ) : (
            data.variants.map((variant) => {
              const belowCost = variant.price < variant.cost
              const share = totalRevenue > 0 ? (variant.revenue / totalRevenue) * 100 : 0
              return (
                <TableRow key={variant.variantId} className={cn(!variant.isActive && 'text-muted-foreground')}>
                  <TableCell>
                    <p className='flex items-center gap-1.5 text-sm font-medium'>
                      {variant.label}
                      {!variant.isActive ? (
                        <Badge variant='outline' className='text-[10px]'>
                          {t('Inactive')}
                        </Badge>
                      ) : null}
                    </p>
                    <p className='text-xs text-muted-foreground'>{[variant.sku, variant.barcode].filter(Boolean).join(' · ') || '—'}</p>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>
                    <span className={cn('inline-flex items-center gap-1', belowCost && 'text-rose-600 dark:text-rose-400')}>
                      {belowCost ? <AlertTriangle className='h-3.5 w-3.5' aria-label={t('Price below cost')} /> : null}
                      {formatMoney(variant.price)}
                    </span>
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{formatMoney(variant.cost)}</TableCell>
                  <TableCell className={cn('text-right tabular-nums', variant.currentStock <= 0 && 'text-rose-600 dark:text-rose-400')}>
                    {formatQty(variant.currentStock)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{formatQty(variant.unitsSold)}</TableCell>
                  <TableCell className='text-right'>
                    <p className='font-medium tabular-nums'>{formatMoney(variant.revenue)}</p>
                    <p className='text-xs text-muted-foreground tabular-nums'>{share > 0 ? formatPct(share) : '—'}</p>
                  </TableCell>
                  <TableCell className='text-right'>
                    <p className='tabular-nums'>{formatMoney(variant.profit)}</p>
                    <p className='text-xs text-muted-foreground tabular-nums'>{formatPct(variant.margin)}</p>
                  </TableCell>
                </TableRow>
              )
            })
          )}
        </TableBody>
      </Table>
    </div>
  )
}

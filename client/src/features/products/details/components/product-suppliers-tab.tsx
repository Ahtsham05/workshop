import { useNavigate } from '@tanstack/react-router'
import { BadgeCheck, ShoppingCart } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { formatBusinessDate } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { EMPTY_VALUE, formatQty, formatRangeLabel } from '../../analytics/lib/analytics-format'
import { suggestReorderQuantity } from '../lib/reorder'

/** Supplier price comparison over the last 12 months, cheapest average cost first. */
export function ProductSuppliersTab({ data }: { data: ProductAnalyticsResponse }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const { hasPermission } = usePermissions()
  const canPurchase = hasPermission('createPurchases') && !data.product.hasVariants
  const { suppliers, supplierWindow } = data
  const cheapest = suppliers.find((supplier) => supplier.avgUnitCost !== null)

  return (
    <div className='space-y-3'>
      <p className='text-xs text-muted-foreground'>
        {t('Purchases from {{range}} — effective unit cost includes bill discounts.', {
          range: formatRangeLabel(supplierWindow.startDate, supplierWindow.endDate),
        })}
      </p>
      <div className='overflow-x-auto rounded-lg border'>
        <Table className='min-w-[760px]'>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Supplier')}</TableHead>
              <TableHead className='text-right'>{t('Avg unit cost')}</TableHead>
              <TableHead className='text-right'>{t('Range')}</TableHead>
              <TableHead className='text-right'>{t('Last cost')}</TableHead>
              <TableHead className='text-right'>{t('Units')}</TableHead>
              <TableHead className='text-right'>{t('Spend')}</TableHead>
              <TableHead className='text-right'>{t('Last purchase')}</TableHead>
              {canPurchase ? <TableHead className='w-10' /> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {suppliers.length === 0 ? (
              <TableRow>
                <TableCell colSpan={canPurchase ? 8 : 7} className='py-10 text-center text-sm text-muted-foreground'>
                  {t('Not purchased in the last 12 months.')}
                </TableCell>
              </TableRow>
            ) : (
              suppliers.map((supplier) => {
                const isCheapest = suppliers.length > 1 && cheapest && supplier.supplierId === cheapest.supplierId
                return (
                  <TableRow key={supplier.supplierId || supplier.name}>
                    <TableCell>
                      <p className='flex items-center gap-1.5 text-sm font-medium'>
                        {supplier.name}
                        {isCheapest ? (
                          <span className='inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400'>
                            <BadgeCheck className='h-3 w-3' aria-hidden />
                            {t('Best price')}
                          </span>
                        ) : null}
                      </p>
                      <p className='text-xs text-muted-foreground'>
                        {t('{{count}} purchases', { count: supplier.purchases })}
                        {supplier.phone ? ` · ${supplier.phone}` : ''}
                      </p>
                    </TableCell>
                    <TableCell className='text-right font-semibold tabular-nums'>
                      {supplier.avgUnitCost !== null ? formatMoney(supplier.avgUnitCost) : EMPTY_VALUE}
                    </TableCell>
                    <TableCell className='whitespace-nowrap text-right text-xs text-muted-foreground tabular-nums'>
                      {supplier.minUnitCost !== null && supplier.maxUnitCost !== null && supplier.minUnitCost !== supplier.maxUnitCost
                        ? `${formatMoney(supplier.minUnitCost)} – ${formatMoney(supplier.maxUnitCost)}`
                        : EMPTY_VALUE}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {supplier.lastUnitCost !== null ? formatMoney(supplier.lastUnitCost) : EMPTY_VALUE}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{formatQty(supplier.units)}</TableCell>
                    <TableCell className='text-right tabular-nums'>{formatMoney(supplier.spend)}</TableCell>
                    <TableCell className='text-right text-xs tabular-nums'>{formatBusinessDate(supplier.lastPurchasedAt)}</TableCell>
                    {canPurchase ? (
                      <TableCell>
                        {supplier.supplierId ? (
                          <Button
                            size='icon'
                            variant='ghost'
                            className='h-8 w-8'
                            aria-label={t('Reorder from {{supplier}}', { supplier: supplier.name })}
                            title={t('Reorder from {{supplier}}', { supplier: supplier.name })}
                            onClick={() =>
                              navigate({
                                to: '/purchase-invoice',
                                search: {
                                  supplierId: supplier.supplierId as string,
                                  prefillItems: [{ productId: data.product.id, quantity: suggestReorderQuantity(data.metrics) }],
                                },
                              })
                            }
                          >
                            <ShoppingCart className='h-4 w-4' />
                          </Button>
                        ) : null}
                      </TableCell>
                    ) : null}
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

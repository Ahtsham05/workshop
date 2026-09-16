import { Users, UserRound } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useLanguage } from '@/context/language-context'
import { formatBusinessDate } from '@/lib/business-timezone'
import { useFormatMoney } from '@/lib/format-money'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { formatPct, formatQty } from '../../analytics/lib/analytics-format'

export function ProductCustomersTab({ data }: { data: ProductAnalyticsResponse }) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { customers, metrics } = data
  const walkInShare = metrics.revenue > 0 ? (customers.walkIn.revenue / metrics.revenue) * 100 : null

  return (
    <div className='space-y-3'>
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
        <div className='flex items-center gap-3 rounded-lg border p-3'>
          <Users className='h-5 w-5 text-primary' aria-hidden />
          <div>
            <p className='text-lg font-semibold'>{customers.uniqueCustomers.toLocaleString()}</p>
            <p className='text-xs text-muted-foreground'>{t('Named customers bought this product')}</p>
          </div>
        </div>
        <div className='flex items-center gap-3 rounded-lg border p-3'>
          <UserRound className='h-5 w-5 text-muted-foreground' aria-hidden />
          <div>
            <p className='text-lg font-semibold'>{formatMoney(customers.walkIn.revenue)}</p>
            <p className='text-xs text-muted-foreground'>
              {t('Walk-in sales · {{units}} units · {{share}} of sales', {
                units: formatQty(customers.walkIn.units),
                share: formatPct(walkInShare),
              })}
            </p>
          </div>
        </div>
      </div>

      <div className='overflow-x-auto rounded-lg border'>
        <Table className='min-w-[640px]'>
          <TableHeader>
            <TableRow>
              <TableHead className='w-10 text-right'>#</TableHead>
              <TableHead>{t('Customer')}</TableHead>
              <TableHead className='text-right'>{t('Units')}</TableHead>
              <TableHead className='text-right'>{t('Sales')}</TableHead>
              <TableHead className='text-right'>{t('Profit')}</TableHead>
              <TableHead className='text-right'>{t('Invoices')}</TableHead>
              <TableHead className='text-right'>{t('Last bought')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {customers.top.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className='py-10 text-center text-sm text-muted-foreground'>
                  {t('No named customer bought this product in the selected period.')}
                </TableCell>
              </TableRow>
            ) : (
              customers.top.map((customer, index) => (
                <TableRow key={customer.customerId}>
                  <TableCell className='text-right text-xs text-muted-foreground tabular-nums'>{index + 1}</TableCell>
                  <TableCell>
                    <p className='text-sm font-medium'>{customer.name}</p>
                    {customer.phone ? <p className='text-xs text-muted-foreground'>{customer.phone}</p> : null}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{formatQty(customer.units)}</TableCell>
                  <TableCell className='text-right font-medium tabular-nums'>{formatMoney(customer.revenue)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{formatMoney(customer.profit)}</TableCell>
                  <TableCell className='text-right tabular-nums'>{customer.invoices}</TableCell>
                  <TableCell className='text-right text-xs tabular-nums'>{formatBusinessDate(customer.lastPurchasedAt)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      {customers.uniqueCustomers > customers.top.length ? (
        <p className='text-xs text-muted-foreground'>
          {t('Showing the top {{shown}} of {{total}} customers by sales.', { shown: customers.top.length, total: customers.uniqueCustomers })}
        </p>
      ) : null}
    </div>
  )
}

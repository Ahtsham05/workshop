import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PackageCheck } from 'lucide-react'
import { useGetProductionReceiptsQuery } from '@/stores/manufacturing.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { EmptyState, SectionHeader } from '../components/manufacturing-shell'
import { Pager } from '../components/pager'
import { fmtDate, fmtQty, refName } from '../lib/constants'

export default function FinishedGoodsPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useGetProductionReceiptsQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Finished goods')}
        description={t(
          'Output received into stock from production orders, valued at material cost.'
        )}
      />
      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder={t('Search receipt, order or product…')}
              value={search}
              onChange={(e) => {
                setSearch(e.target.value)
                setPage(1)
              }}
              className='h-9 w-72 max-sm:w-full'
            />
            <Input
              type='date'
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value)
                setPage(1)
              }}
              className='h-9 w-40'
              aria-label={t('From')}
            />
            <Input
              type='date'
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value)
                setPage(1)
              }}
              className='h-9 w-40'
              aria-label={t('To')}
            />
          </div>
          <div className='overflow-x-auto rounded-lg border'>
            <Table>
              <TableHeader>
                <TableRow className='bg-muted/40'>
                  <TableHead>{t('Receipt')}</TableHead>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('Order')}</TableHead>
                  <TableHead className='text-right'>{t('Quantity')}</TableHead>
                  <TableHead className='text-right'>{t('Unit cost')}</TableHead>
                  <TableHead className='text-right'>{t('Value')}</TableHead>
                  <TableHead>{t('Location')}</TableHead>
                  <TableHead>{t('By')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <Skeleton className='h-16 w-full' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !data?.results.length && (
                  <TableRow>
                    <TableCell colSpan={8}>
                      <EmptyState
                        icon={PackageCheck}
                        title={t('No finished goods received yet')}
                        description={t(
                          'Receive output from a released production order to add it to stock.'
                        )}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {data?.results.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <div className='font-mono text-xs font-medium'>
                        {r.receiptNumber}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {fmtDate(r.receiptDate)}
                      </div>
                    </TableCell>
                    <TableCell className='font-medium'>
                      {r.productName}
                    </TableCell>
                    <TableCell>
                      <Link
                        to={
                          `/manufacturing/production-orders/${r.productionOrderId}` as never
                        }
                        className='text-primary font-mono text-xs hover:underline'
                      >
                        {r.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      +{fmtQty(r.quantity)}{' '}
                      <span className='text-muted-foreground text-xs'>
                        {r.unit}
                      </span>
                    </TableCell>
                    <TableCell className='text-muted-foreground text-right tabular-nums'>
                      {formatMoney(r.unitCost)}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(r.totalCost)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {r.location || '—'}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {refName(r.createdBy) || '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Pager data={data} page={page} onPageChange={setPage} />
        </CardContent>
      </Card>
    </div>
  )
}

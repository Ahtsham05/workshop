import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { PackageMinus } from 'lucide-react'
import { useGetMaterialIssuesQuery } from '@/stores/manufacturing.api'
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

export default function MaterialIssuesPage() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [page, setPage] = useState(1)
  const { data, isLoading } = useGetMaterialIssuesQuery({
    page,
    limit: 20,
    search: debounced || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
  })

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Material issues')}
        description={t(
          'Every component taken out of stock for production. Issue from an order’s page; each issue is permanent and appears in the stock ledger.'
        )}
      />
      <Card>
        <CardContent className='space-y-3 p-4 max-sm:p-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <Input
              placeholder={t('Search issue, order or material…')}
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
                  <TableHead>{t('Issue')}</TableHead>
                  <TableHead>{t('Order')}</TableHead>
                  <TableHead>{t('Materials')}</TableHead>
                  <TableHead className='text-right'>{t('Value')}</TableHead>
                  <TableHead>{t('By')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <Skeleton className='h-16 w-full' />
                    </TableCell>
                  </TableRow>
                )}
                {!isLoading && !data?.results.length && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <EmptyState
                        icon={PackageMinus}
                        title={t('No material issues yet')}
                        description={t(
                          'Release a production order, then issue its materials from the order page.'
                        )}
                      />
                    </TableCell>
                  </TableRow>
                )}
                {data?.results.map((issue) => (
                  <TableRow key={issue.id}>
                    <TableCell>
                      <div className='font-mono text-xs font-medium'>
                        {issue.issueNumber}
                      </div>
                      <div className='text-muted-foreground text-xs'>
                        {fmtDate(issue.issueDate)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Link
                        to={
                          `/manufacturing/production-orders/${issue.productionOrderId}` as never
                        }
                        className='text-primary font-mono text-xs hover:underline'
                      >
                        {issue.orderNumber}
                      </Link>
                    </TableCell>
                    <TableCell className='max-w-md'>
                      <div className='truncate text-sm'>
                        {issue.lines
                          .map((l) => `${l.productName} ×${fmtQty(l.quantity)}`)
                          .join(', ')}
                      </div>
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>
                      {formatMoney(issue.totalCost)}
                    </TableCell>
                    <TableCell className='text-muted-foreground text-sm'>
                      {refName(issue.createdBy) || '—'}
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

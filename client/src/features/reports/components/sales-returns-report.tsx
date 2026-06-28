import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetSalesReturnsReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { RotateCcw, Package, DollarSign } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'

interface SalesReturnsReportProps {
  startDate: string
  endDate: string
}

export const SalesReturnsReport = forwardRef<{ exportToExcel: () => void }, SalesReturnsReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading } = useGetSalesReturnsReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }

          const wb = XLSX.utils.book_new()

          // Summary sheet
          const summaryData = [
            { [t('metric')]: t('Total Returns'), [t('value')]: data.summary.totalReturns },
            { [t('metric')]: t('Total Amount'), [t('value')]: data.summary.totalReturnsAmount },
            { [t('metric')]: t('Items Returned'), [t('value')]: data.summary.totalItemsReturned },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          // Date-wise sheet
          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(row => ({ [t('date')]: row._id, [t('count')]: row.count, [t('amount')]: row.totalAmount }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }

          // Product-wise sheet
          if (data.productwise.length > 0) {
            const pwData = data.productwise.map(row => ({
              [t('product')]: reportEntityName(language, row.productName, row.productNameUrdu),
              [t('qty_returned')]: row.totalQty,
              [t('total_value')]: row.totalValue,
              [t('return_count')]: row.returnCount,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pwData), 'Product-wise')
          }

          // Per-line detail sheet (variant/batch/expiry)
          if (data.lineItems?.length > 0) {
            const liData = data.lineItems.map(row => ({
              [t('date')]: format(new Date(row.date), 'yyyy-MM-dd'),
              'Return #': row.returnNumber,
              [t('product')]: reportEntityName(language, row.productName, row.productNameUrdu),
              Variant: row.variantLabel || '',
              'Batch #': row.batchNumber || '',
              Expiry: row.expiryDate ? format(new Date(row.expiryDate), 'yyyy-MM-dd') : '',
              Qty: row.quantity,
              Total: row.total,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liData), 'Line Items')
          }

          XLSX.writeFile(wb, `sales-returns-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />

    const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)
    const s = data?.summary

    return (
      <div className='space-y-6'>
        {/* Summary cards */}
        <div className='grid gap-4 md:grid-cols-3'>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Returns')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <RotateCcw className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalReturns ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('return transactions')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Amount Refunded')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <DollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{fmt(s?.totalReturnsAmount ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>{t('refunded to customers')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('violet')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Items Returned')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('violet'))}>
                <Package className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalItemsReturned ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('total units returned to stock')}</p>
            </CardContent>
          </Card>
        </div>

        {/* Date-wise breakdown */}
        {(data?.datewise?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Date-wise Returns')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead className='text-right'>{t('count')}</TableHead>
                    <TableHead className='text-right'>{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.datewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'>
                        <Badge variant='secondary'>{row.count}</Badge>
                      </TableCell>
                      <TableCell className='text-right text-red-600 font-medium'>{fmt(row.totalAmount)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Product-wise breakdown */}
        {(data?.productwise?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Product-wise Returns')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead className='text-right'>{t('Qty Returned')}</TableHead>
                    <TableHead className='text-right'>{t('Total Value')}</TableHead>
                    <TableHead className='text-right'>{t('Return Count')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.productwise.map(row => {
                    const pn = reportEntityName(language, row.productName, row.productNameUrdu)
                    return (
                    <TableRow key={row._id}>
                      <TableCell className={`font-medium ${reportEntityNameClass(language, pn)}`}>{pn}</TableCell>
                      <TableCell className='text-right'>{row.totalQty}</TableCell>
                      <TableCell className='text-right text-red-600 font-medium'>{fmt(row.totalValue)}</TableCell>
                      <TableCell className='text-right'>
                        <Badge variant='outline'>{row.returnCount}</Badge>
                      </TableCell>
                    </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Per-line detail (variant/batch/expiry) */}
        {(data?.lineItems?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Returned Items — Variant &amp; Batch Detail</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>Return #</TableHead>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className='text-right'>Qty</TableHead>
                    <TableHead className='text-right'>{t('amount')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.lineItems.map((row, idx) => {
                    const pn = reportEntityName(language, row.productName, row.productNameUrdu)
                    return (
                      <TableRow key={`${row.returnNumber}-${idx}`}>
                        <TableCell className='whitespace-nowrap'>{format(new Date(row.date), 'MMM dd, yyyy')}</TableCell>
                        <TableCell className='font-mono text-xs'>{row.returnNumber}</TableCell>
                        <TableCell className={cn('font-medium', reportEntityNameClass(language, pn))}>{pn}</TableCell>
                        <TableCell className='text-muted-foreground text-sm'>{row.variantLabel || '—'}</TableCell>
                        <TableCell className='font-mono text-xs text-muted-foreground'>{row.batchNumber || '—'}</TableCell>
                        <TableCell>{expiryBadge(row.expiryDate)}</TableCell>
                        <TableCell className='text-right'>{row.quantity}</TableCell>
                        <TableCell className='text-right text-red-600 font-medium'>{fmt(row.total)}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {(data?.datewise?.length ?? 0) === 0 && (data?.productwise?.length ?? 0) === 0 && (
          <Card>
            <CardContent className='py-12 text-center text-muted-foreground'>
              {t('No sales returns found for the selected period')}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)
SalesReturnsReport.displayName = 'SalesReturnsReport'

import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetPurchaseReturnsReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { RotateCcw, Package, DollarSign } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface PurchaseReturnsReportProps {
  startDate: string
  endDate: string
}

export const PurchaseReturnsReport = forwardRef<{ exportToExcel: () => void }, PurchaseReturnsReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetPurchaseReturnsReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }

          const wb = XLSX.utils.book_new()

          const summaryData = [
            { [t('metric')]: t('Total Returns'), [t('value')]: data.summary.totalReturns },
            { [t('metric')]: t('Total Amount'), [t('value')]: data.summary.totalReturnsAmount },
            { [t('metric')]: t('Items Returned'), [t('value')]: data.summary.totalItemsReturned },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(row => ({ [t('date')]: row._id, [t('count')]: row.count, [t('amount')]: row.totalAmount }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }

          if (data.productwise.length > 0) {
            const pwData = data.productwise.map(row => ({
              [t('product')]: row.productName,
              [t('qty_returned')]: row.totalQty,
              [t('total_value')]: row.totalValue,
              [t('return_count')]: row.returnCount,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(pwData), 'Product-wise')
          }

          XLSX.writeFile(wb, `purchase-returns-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Returns')}</CardTitle>
              <RotateCcw className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalReturns ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('return transactions')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Amount Recovered')}</CardTitle>
              <DollarSign className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s?.totalReturnsAmount ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>{t('recovered from suppliers')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Items Returned')}</CardTitle>
              <Package className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalItemsReturned ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('total units returned to supplier')}</p>
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
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalAmount)}</TableCell>
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
                  {data!.productwise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium'>{row.productName}</TableCell>
                      <TableCell className='text-right'>{row.totalQty}</TableCell>
                      <TableCell className='text-right text-blue-600 font-medium'>{fmt(row.totalValue)}</TableCell>
                      <TableCell className='text-right'>
                        <Badge variant='outline'>{row.returnCount}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {(data?.datewise?.length ?? 0) === 0 && (data?.productwise?.length ?? 0) === 0 && (
          <Card>
            <CardContent className='py-12 text-center text-muted-foreground'>
              {t('No purchase returns found for the selected period')}
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)
PurchaseReturnsReport.displayName = 'PurchaseReturnsReport'

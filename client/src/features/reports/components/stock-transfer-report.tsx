import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetStockTransferReportQuery, type StockTransferReportStatus } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { ArrowLeftRight, Package, Truck } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { TransferStatusBadge } from '@/features/stock-transfer/components/transfer-status-badge'

interface StockTransferReportProps {
  startDate: string
  endDate: string
}

const STATUS_ORDER: StockTransferReportStatus[] = ['suggested', 'approved', 'in_transit', 'completed', 'cancelled']

export const StockTransferReport = forwardRef<{ exportToExcel: () => void }, StockTransferReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetStockTransferReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error(t('No data available to export'))
            return
          }

          const wb = XLSX.utils.book_new()

          const summaryData = [
            { [t('metric')]: t('Total Transfers'), [t('value')]: data.summary.totalTransfers },
            { [t('metric')]: t('Total Units Moved'), [t('value')]: data.summary.totalUnitsMoved },
            ...STATUS_ORDER.map((status) => ({
              [t('metric')]: t(status),
              [t('value')]: data.summary.statusCounts[status] ?? 0,
            })),
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.datewise.length > 0) {
            const dwData = data.datewise.map((row) => ({
              [t('date')]: row._id,
              [t('count')]: row.count,
              [t('Units Moved')]: row.quantity,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }

          if (data.lineItems.length > 0) {
            const liData = data.lineItems.map((row) => ({
              [t('date')]: format(new Date(row.date), 'yyyy-MM-dd'),
              [t('product')]: row.productName,
              [t('From')]: row.fromBranchName,
              [t('To')]: row.toBranchName,
              Qty: row.quantity,
              [t('IMEI/Serial')]: row.imeis.join(', '),
              [t('Batch')]: row.batchNumber || '',
              [t('Status')]: row.status,
              [t('Reason')]: row.reason || '',
              [t('By')]: row.decidedByName || '',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liData), 'Transfers')
          }

          XLSX.writeFile(wb, `stock-transfers-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />

    const s = data?.summary
    const statusCounts = s?.statusCounts ?? {}

    return (
      <div className='space-y-6'>
        <div className='grid gap-4 md:grid-cols-3'>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Transfers')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <ArrowLeftRight className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalTransfers ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('across all branches')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Units Moved')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <Package className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalUnitsMoved ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('pcs')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('In Transit')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
                <Truck className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{statusCounts.in_transit ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('not yet received')}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('Breakdown by Status')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('count')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {STATUS_ORDER.filter((status) => (statusCounts[status] ?? 0) > 0).map((status) => (
                  <TableRow key={status}>
                    <TableCell>
                      <TransferStatusBadge status={status} />
                    </TableCell>
                    <TableCell className='text-right'>{statusCounts[status]}</TableCell>
                  </TableRow>
                ))}
                {STATUS_ORDER.every((status) => (statusCounts[status] ?? 0) === 0) && (
                  <TableRow>
                    <TableCell colSpan={2} className='text-center text-muted-foreground'>
                      {t('No stock transfers found for the selected period')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {(data?.lineItems?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t('Transfer History')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead>{t('From')}</TableHead>
                    <TableHead>{t('To')}</TableHead>
                    <TableHead className='text-right'>Qty</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead>{t('By')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.lineItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>
                        {format(new Date(row.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className='font-medium max-w-[200px]' title={row.productName}>
                        <div className='truncate'>{row.productName}</div>
                        {row.imeis.length > 0 && (
                          <div className='truncate text-xs font-normal text-muted-foreground' title={row.imeis.join(', ')}>
                            IMEI/Serial: {row.imeis.join(', ')}
                          </div>
                        )}
                        {row.batchNumber && (
                          <div className='truncate text-xs font-normal text-blue-600'>{t('Batch')}: {row.batchNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{row.fromBranchName || '—'}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{row.toBranchName || '—'}</TableCell>
                      <TableCell className='text-right font-medium'>{row.quantity}</TableCell>
                      <TableCell>
                        <TransferStatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{row.decidedByName || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)
StockTransferReport.displayName = 'StockTransferReport'

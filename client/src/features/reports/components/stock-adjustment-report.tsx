import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetStockAdjustmentReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { ClipboardEdit, TrendingDown, ListChecks } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { AdjustmentTypeBadge } from '@/features/stock-adjustments/components/adjustment-type-badge'
import { ADJUSTMENT_TYPE_ORDER, ADJUSTMENT_TYPE_META } from '@/features/stock-adjustments/lib/adjustment-types'
import { expiryBadge } from '../utils/expiry-badge'

interface StockAdjustmentReportProps {
  startDate: string
  endDate: string
}

export const StockAdjustmentReport = forwardRef<{ exportToExcel: () => void }, StockAdjustmentReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetStockAdjustmentReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error(t('No data available to export'))
            return
          }

          const wb = XLSX.utils.book_new()

          const summaryData = [
            { [t('metric')]: t('Total Adjustments'), [t('value')]: data.summary.totalAdjustments },
            { [t('metric')]: t('Total Shrinkage Value'), [t('value')]: data.summary.totalLossValue },
            ...ADJUSTMENT_TYPE_ORDER.map((type) => ({
              [t('metric')]: t(ADJUSTMENT_TYPE_META[type].label),
              [t('value')]: data.byType[type]?.value ?? 0,
            })),
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.datewise.length > 0) {
            const dwData = data.datewise.map((row) => ({
              [t('date')]: row._id,
              [t('count')]: row.count,
              [t('Shrinkage Value')]: row.lossValue,
              [t('Gain Value')]: row.gainValue,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }

          if (data.lineItems.length > 0) {
            const liData = data.lineItems.map((row) => ({
              [t('date')]: format(new Date(row.date), 'yyyy-MM-dd'),
              [t('product')]: row.productName,
              [t('Type')]: t(ADJUSTMENT_TYPE_META[row.type].label),
              Variant: row.variantLabel || '',
              'Batch #': row.batchNumber || '',
              Expiry: row.expiryDate ? format(new Date(row.expiryDate), 'yyyy-MM-dd') : '',
              [t('Direction')]: row.direction,
              Qty: row.quantity,
              [t('Stock')]: `${row.previousQuantity} -> ${row.newQuantity}`,
              [t('value')]: row.totalValue,
              [t('Reason')]: row.reason || '',
              [t('Status')]: row.status,
              [t('By')]: row.createdByName || '',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(liData), 'Adjustments')
          }

          XLSX.writeFile(wb, `stock-adjustments-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
        <div className='grid gap-4 md:grid-cols-3'>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Adjustments')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <ListChecks className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalAdjustments ?? 0}</div>
              <p className='text-xs text-muted-foreground'>{t('all reason types')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Total Shrinkage Value')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <TrendingDown className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{fmt(s?.totalLossValue ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>{t('damage + theft + expired + lost')}</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>{t('Most Common Reason')}</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <ClipboardEdit className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const top = data
                  ? ADJUSTMENT_TYPE_ORDER.reduce((best, type) =>
                      (data.byType[type]?.count ?? 0) > (data.byType[best]?.count ?? 0) ? type : best,
                      ADJUSTMENT_TYPE_ORDER[0]
                    )
                  : null
                return (
                  <>
                    <div className='text-2xl font-bold'>{top ? t(ADJUSTMENT_TYPE_META[top].label) : '—'}</div>
                    <p className='text-xs text-muted-foreground'>
                      {top ? `${data?.byType[top]?.count ?? 0} ${t('report(s)')}` : ''}
                    </p>
                  </>
                )
              })()}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t('Breakdown by Reason')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Type')}</TableHead>
                  <TableHead className='text-right'>{t('count')}</TableHead>
                  <TableHead className='text-right'>Qty</TableHead>
                  <TableHead className='text-right'>{t('value')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ADJUSTMENT_TYPE_ORDER.filter((type) => (data?.byType[type]?.count ?? 0) > 0).map((type) => {
                  const stat = data!.byType[type]
                  return (
                    <TableRow key={type}>
                      <TableCell>
                        <AdjustmentTypeBadge type={type} />
                      </TableCell>
                      <TableCell className='text-right'>{stat.count}</TableCell>
                      <TableCell className='text-right'>{stat.quantity}</TableCell>
                      <TableCell className='text-right font-medium'>{fmt(stat.value)}</TableCell>
                    </TableRow>
                  )
                })}
                {ADJUSTMENT_TYPE_ORDER.every((type) => (data?.byType[type]?.count ?? 0) === 0) && (
                  <TableRow>
                    <TableCell colSpan={4} className='text-center text-muted-foreground'>
                      {t('No stock adjustments found for the selected period')}
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
              <CardTitle>{t('Adjustment History')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('date')}</TableHead>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead>{t('Type')}</TableHead>
                    <TableHead>Variant</TableHead>
                    <TableHead>Batch #</TableHead>
                    <TableHead>Expiry</TableHead>
                    <TableHead className='text-right'>Qty</TableHead>
                    <TableHead className='text-right'>{t('Stock')}</TableHead>
                    <TableHead className='text-right'>{t('value')}</TableHead>
                    <TableHead>{t('By')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.lineItems.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>
                        {format(new Date(row.date), 'MMM dd, yyyy')}
                      </TableCell>
                      <TableCell className='font-medium max-w-[200px] truncate' title={row.productName}>
                        {row.productName}
                      </TableCell>
                      <TableCell>
                        <AdjustmentTypeBadge type={row.type} />
                      </TableCell>
                      <TableCell className='text-muted-foreground text-sm'>{row.variantLabel || '—'}</TableCell>
                      <TableCell className='font-mono text-xs text-muted-foreground'>{row.batchNumber || '—'}</TableCell>
                      <TableCell>{row.expiryDate ? expiryBadge(row.expiryDate) : '—'}</TableCell>
                      <TableCell className={cn('text-right font-medium', row.direction === 'increase' ? 'text-emerald-600' : 'text-rose-600')}>
                        {row.direction === 'increase' ? '+' : '−'}
                        {row.quantity}
                      </TableCell>
                      <TableCell className='text-right text-sm text-muted-foreground whitespace-nowrap'>
                        {row.previousQuantity} → {row.newQuantity}
                      </TableCell>
                      <TableCell className='text-right'>{row.totalValue ? fmt(row.totalValue) : '—'}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>
                        {row.createdByName || '—'}
                        {row.status === 'reversed' && (
                          <Badge variant='outline' className='ml-2 bg-slate-50 text-slate-500 border-slate-200'>
                            {t('Reversed')}
                          </Badge>
                        )}
                      </TableCell>
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
StockAdjustmentReport.displayName = 'StockAdjustmentReport'

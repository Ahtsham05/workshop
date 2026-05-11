import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetSupplierReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { formatDistanceToNow, format } from 'date-fns'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { kpiCardClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { cn } from '@/lib/utils'

interface SupplierReportProps {
  startDate: string
  endDate: string
}

export const SupplierReport = forwardRef<{ exportToExcel: () => void }, SupplierReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading } = useGetSupplierReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((supplier) => ({
            [t('supplier')]: reportEntityName(language, supplier.supplierName, supplier.supplierNameUrdu),
            [t('phone')]: supplier.phone || 'N/A',
            [t('purchases')]: supplier.totalPurchases,
            [t('total_amount')]: supplier.totalAmount,
            'Avg Purchase': supplier.avgPurchaseValue,
            'Last Purchase': supplier.lastPurchase ? format(new Date(supplier.lastPurchase), 'yyyy-MM-dd') : 'N/A',
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Supplier Report')
          XLSX.writeFile(wb, `supplier-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

  if (isLoading) return <Skeleton className='h-[400px] w-full' />

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  return (
    <div className='space-y-6'>
      <div className='grid gap-4 md:grid-cols-3'>
        <Card className={kpiCardClass('indigo')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('unique_suppliers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.uniqueSuppliers || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('orange')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_purchases')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalPurchases || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>{data?.summary?.purchaseCount || 0} {t('invoices')}</p>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('cyan')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('avg_transaction')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.avgTransactionValue || 0)}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('supplier_analysis')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('supplier')}</TableHead>
                <TableHead>{t('phone')}</TableHead>
                <TableHead className='text-right'>{t('purchases')}</TableHead>
                <TableHead className='text-right'>{t('total_amount')}</TableHead>
                <TableHead className='text-right'>Avg Purchase</TableHead>
                <TableHead className='text-right'>Last Purchase</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((supplier) => {
                const label = reportEntityName(language, supplier.supplierName, supplier.supplierNameUrdu)
                return (
                <TableRow key={supplier._id}>
                  <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>{label}</TableCell>
                  <TableCell>{supplier.phone || 'N/A'}</TableCell>
                  <TableCell className='text-right'>{supplier.totalPurchases}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(supplier.totalAmount)}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(supplier.avgPurchaseValue || 0)}</TableCell>
                  <TableCell className='text-right text-sm text-muted-foreground'>
                    {supplier.lastPurchase
                      ? formatDistanceToNow(new Date(supplier.lastPurchase), { addSuffix: true })
                      : 'N/A'}
                  </TableCell>
                </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
)

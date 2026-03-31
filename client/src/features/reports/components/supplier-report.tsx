import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetSupplierReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface SupplierReportProps {
  startDate: string
  endDate: string
}

export const SupplierReport = forwardRef<{ exportToExcel: () => void }, SupplierReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetSupplierReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((supplier) => ({
            [t('supplier')]: supplier.supplierName,
            [t('phone')]: supplier.phone || 'N/A',
            [t('purchases')]: supplier.totalPurchases,
            [t('total_amount')]: supplier.totalAmount,
            [t('cash_paid')]: supplier.totalCashPaid,
            [t('paid')]: supplier.totalPaid,
            [t('balance')]: supplier.totalBalance,
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
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader><CardTitle className='text-sm'>{t('total_purchases')}</CardTitle></CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalPurchases || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>{data?.summary?.purchaseCount || 0} {t('invoices')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className='text-sm'>{t('cash_paid')}</CardTitle></CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>{formatCurrency(data?.summary?.totalCashPaid || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>{t('cash_purchases_fully_paid')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className='text-sm'>{t('total_paid')}</CardTitle></CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalPaid || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className='text-sm'>{t('balance_due')}</CardTitle></CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>{formatCurrency(data?.summary?.totalBalance || 0)}</div>
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
                <TableHead className='text-right'>{t('cash_paid')}</TableHead>
                <TableHead className='text-right'>{t('paid')}</TableHead>
                <TableHead className='text-right'>{t('balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((supplier) => (
                <TableRow key={supplier._id}>
                  <TableCell className='font-medium'>{supplier.supplierName}</TableCell>
                  <TableCell>{supplier.phone || 'N/A'}</TableCell>
                  <TableCell className='text-right'>{supplier.totalPurchases}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(supplier.totalAmount)}</TableCell>
                  <TableCell className='text-right text-green-600'>{formatCurrency(supplier.totalCashPaid || 0)}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(supplier.totalPaid)}</TableCell>
                  <TableCell className='text-right'>
                    {supplier.totalBalance > 0
                      ? <Badge variant='destructive'>{formatCurrency(supplier.totalBalance)}</Badge>
                      : <Badge variant='default'>{formatCurrency(0)}</Badge>
                    }
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
)
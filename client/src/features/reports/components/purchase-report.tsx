import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetPurchaseReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface PurchaseReportProps {
  startDate: string
  endDate: string
}

export const PurchaseReport = forwardRef<{ exportToExcel: () => void }, PurchaseReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetPurchaseReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((row) => ({
            [t('date')]: row._id.date,
            [t('supplier')]: row._id.supplier,
            [t('count')]: row.purchaseCount,
            [t('amount')]: row.totalAmount,
            [t('cash_paid')]: row.cashPaid,
            [t('paid')]: row.paidAmount,
            [t('balance')]: row.balance,
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Purchase Report')
          XLSX.writeFile(wb, `purchase-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_purchases')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalPurchases || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>{data?.summary?.purchaseCount || 0} {t('invoices')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('cash_paid')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-green-600'>{formatCurrency(data?.summary?.totalCashPaid || 0)}</div>
            <p className='text-xs text-muted-foreground mt-1'>{t('cash_purchases_fully_paid')}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_paid')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalPaid || 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className='text-sm'>{t('balance_due')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold text-red-600'>{formatCurrency(data?.summary?.totalBalance || 0)}</div>
          </CardContent>
        </Card>
      </div>

      {/* Payment Type Breakdown */}
      {data?.paymentBreakdown && data.paymentBreakdown.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('payment_type_breakdown')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid gap-3 md:grid-cols-2 lg:grid-cols-4'>
              {data.paymentBreakdown.map((item: { _id: string; count: number; totalAmount: number; paidAmount: number; balance: number }) => (
                <div key={item._id} className='rounded-lg border p-3 space-y-1'>
                  <div className='flex items-center justify-between'>
                    <Badge variant={item._id === 'Cash' ? 'default' : item._id === 'Credit' ? 'destructive' : 'secondary'}>
                      {item._id}
                    </Badge>
                    <span className='text-xs text-muted-foreground'>{item.count} {t('invoices')}</span>
                  </div>
                  <div className='text-sm font-semibold'>{formatCurrency(item.totalAmount)}</div>
                  <div className='text-xs text-green-600'>{t('paid')}: {formatCurrency(item.paidAmount)}</div>
                  {item.balance > 0 && <div className='text-xs text-red-600'>{t('balance')}: {formatCurrency(item.balance)}</div>}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('purchase_details')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('date')}</TableHead>
                <TableHead>{t('supplier')}</TableHead>
                <TableHead className='text-right'>{t('count')}</TableHead>
                <TableHead className='text-right'>{t('amount')}</TableHead>
                <TableHead className='text-right'>{t('cash_paid')}</TableHead>
                <TableHead className='text-right'>{t('paid')}</TableHead>
                <TableHead className='text-right'>{t('balance')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row._id.date}</TableCell>
                  <TableCell>{row._id.supplier}</TableCell>
                  <TableCell className='text-right'>{row.purchaseCount}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(row.totalAmount)}</TableCell>
                  <TableCell className='text-right text-green-600'>{formatCurrency(row.cashPaid || 0)}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(row.paidAmount)}</TableCell>
                  <TableCell className='text-right text-red-600'>{formatCurrency(row.balance)}</TableCell>
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

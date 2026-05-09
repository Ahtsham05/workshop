import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetCustomerReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { formatDistanceToNow, format } from 'date-fns'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { toast } from 'sonner'
import { kpiCardClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { cn } from '@/lib/utils'

interface CustomerReportProps {
  startDate: string
  endDate: string
}

export const CustomerReport = forwardRef<{ exportToExcel: () => void }, CustomerReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading } = useGetCustomerReportQuery({ startDate, endDate, top: 50 })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((customer) => ({
            [t('customer')]: reportEntityName(language, customer.customerName, customer.customerNameUrdu),
            [t('phone')]: customer.phone || 'N/A',
            Sales: customer.totalPurchases,
            [t('total_spent')]: customer.totalSpent,
            'Avg Sale': customer.avgPurchaseValue,
            'Last Sale': format(new Date(customer.lastPurchase), 'yyyy-MM-dd'),
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Customer Report')
          XLSX.writeFile(wb, `customer-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
            <CardTitle className='text-sm'>{t('unique_customers')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.uniqueCustomers || 0}</div>
          </CardContent>
        </Card>
        <Card className={kpiCardClass('emerald')}>
          <CardHeader>
            <CardTitle className='text-sm'>{t('total_revenue')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalRevenue || 0)}</div>
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
          <CardTitle>{t('top_customers')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('customer')}</TableHead>
                <TableHead>{t('phone')}</TableHead>
                <TableHead className='text-right'>Sales</TableHead>
                <TableHead className='text-right'>{t('total_spent')}</TableHead>
                <TableHead className='text-right'>Avg Sale</TableHead>
                <TableHead className='text-right'>Last Sale</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((customer) => {
                const label = reportEntityName(language, customer.customerName, customer.customerNameUrdu)
                return (
                <TableRow key={customer._id}>
                  <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>{label}</TableCell>
                  <TableCell>{customer.phone || 'N/A'}</TableCell>
                  <TableCell className='text-right'>{customer.totalPurchases}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(customer.totalSpent)}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(customer.avgPurchaseValue)}</TableCell>
                  <TableCell className='text-right text-sm text-muted-foreground'>
                    {formatDistanceToNow(new Date(customer.lastPurchase), { addSuffix: true })}
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
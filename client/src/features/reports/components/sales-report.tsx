import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetSalesReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { TrendingUp, DollarSign, ShoppingCart, Package } from 'lucide-react'
import { forwardRef, useImperativeHandle } from 'react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface SalesReportProps {
  startDate: string
  endDate: string
}

export const SalesReport = forwardRef<{ exportToExcel: () => void }, SalesReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetSalesReportQuery({ startDate, endDate, groupBy: 'day' })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data?.data || data.data.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const excelData = data.data.map((row) => ({
            [t('date')]: row._id,
            [t('invoices')]: row.invoiceCount,
            [t('sales')]: row.totalSales,
            [t('cost')]: row.totalCost,
            [t('profit')]: row.totalProfit,
            [t('margin')]: row.totalSales > 0 ? `${((row.totalProfit / row.totalSales) * 100).toFixed(2)}%` : '0%',
          }))

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'Sales Report')
          XLSX.writeFile(wb, `sales-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <Skeleton className='h-[200px] w-full' />
          <Skeleton className='h-[400px] w-full' />
        </div>
      )
    }

    const formatCurrency = (value: number) => {
      return new Intl.NumberFormat('en-PK', {
        style: 'currency',
        currency: 'PKR',
      }).format(value)
    }

  return (
    <div className='space-y-6'>
      {/* Summary Cards */}
      <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{t('total_revenue')}</CardTitle>
            <DollarSign className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {formatCurrency(data?.summary?.totalRevenue || 0)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{t('total_profit')}</CardTitle>
            <TrendingUp className='h-4 w-4 text-green-500' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {formatCurrency(data?.summary?.totalProfit || 0)}
            </div>
            <p className='text-xs text-muted-foreground mt-1'>
              {t('margin')}: {data?.summary?.totalRevenue ? 
                ((data.summary.totalProfit / data.summary.totalRevenue) * 100).toFixed(2) : 0}%
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{t('total_invoices')}</CardTitle>
            <ShoppingCart className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>{data?.summary?.totalInvoices || 0}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className='text-sm font-medium'>{t('avg_invoice_value')}</CardTitle>
            <Package className='h-4 w-4 text-muted-foreground' />
          </CardHeader>
          <CardContent>
            <div className='text-2xl font-bold'>
              {formatCurrency(data?.summary?.avgInvoiceValue || 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sales Chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('sales_trend')}</CardTitle>
          <CardDescription>{t('daily_sales_and_profit')}</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width='100%' height={400}>
            <BarChart data={data?.data || []}>
              <CartesianGrid strokeDasharray='3 3' />
              <XAxis dataKey='_id' />
              <YAxis />
              <Tooltip formatter={(value: any) => formatCurrency(value)} />
              <Legend />
              <Bar dataKey='totalSales' fill='#3b82f6' name={t('sales')} />
              <Bar dataKey='totalProfit' fill='#10b981' name={t('profit')} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Detailed Data Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('detailed_sales_data')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('date')}</TableHead>
                <TableHead className='text-right'>{t('invoices')}</TableHead>
                <TableHead className='text-right'>{t('sales')}</TableHead>
                <TableHead className='text-right'>{t('cost')}</TableHead>
                <TableHead className='text-right'>{t('profit')}</TableHead>
                <TableHead className='text-right'>{t('margin')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.data?.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row._id}</TableCell>
                  <TableCell className='text-right'>{row.invoiceCount}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(row.totalSales)}</TableCell>
                  <TableCell className='text-right'>{formatCurrency(row.totalCost)}</TableCell>
                  <TableCell className='text-right text-green-600'>
                    {formatCurrency(row.totalProfit)}
                  </TableCell>
                  <TableCell className='text-right'>
                    {row.totalSales > 0 ? ((row.totalProfit / row.totalSales) * 100).toFixed(2) : 0}%
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

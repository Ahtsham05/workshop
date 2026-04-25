import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGetServiceReportQuery } from '@/stores/reports.api'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface ServiceReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)

export const ServiceReport = forwardRef<{ exportToExcel: () => void }, ServiceReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data, isLoading } = useGetServiceReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error('No data available to export')
            return
          }

          const wb = XLSX.utils.book_new()

          const summaryRows = [
            { Metric: 'Total Invoices', Value: data.summary.totalInvoices },
            { Metric: 'Service Revenue', Value: data.summary.totalAmount },
            { Metric: 'Service Profit', Value: data.summary.totalProfit },
            { Metric: 'Average Invoice', Value: data.summary.avgInvoice },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          const byServiceRows = data.byService.map((r) => ({
            Service: r._id,
            Quantity: r.totalQuantity,
            Amount: r.totalAmount,
            AvgUnitPrice: r.avgUnitPrice,
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(byServiceRows), 'By Service')

          const recentRows = data.recentInvoices.map((r) => ({
            Date: r.date,
            Invoice: r.invoiceNumber,
            Customer: r.customerName || '',
            Services: (r.items || []).map((item) => `${item.serviceName} x${item.quantity}`).join(', '),
            Amount: r.totalAmount,
            PaymentMethod: r.paymentMethod,
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(recentRows), 'Recent')

          XLSX.writeFile(wb, `service-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Data exported successfully')
        } catch {
          toast.error('Failed to export data')
        }
      },
    }))

    if (isLoading) {
      return <Skeleton className='h-[420px] w-full' />
    }

    const summary = data?.summary

    return (
      <div className='space-y-4'>
        <div className='grid gap-4 md:grid-cols-4'>
          <Card>
            <CardContent className='p-4'>
              <p className='text-xs text-muted-foreground'>Total Invoices</p>
              <p className='text-xl font-bold'>{summary?.totalInvoices ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4'>
              <p className='text-xs text-muted-foreground'>Service Revenue</p>
              <p className='text-xl font-bold text-blue-600'>{fmt(summary?.totalAmount ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4'>
              <p className='text-xs text-muted-foreground'>Service Profit</p>
              <p className='text-xl font-bold text-green-600'>{fmt(summary?.totalProfit ?? 0)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className='p-4'>
              <p className='text-xs text-muted-foreground'>Average Invoice</p>
              <p className='text-xl font-bold'>{fmt(summary?.avgInvoice ?? 0)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Service Sales Breakdown</CardTitle>
          </CardHeader>
          <CardContent className='overflow-x-auto'>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead className='text-right'>Quantity</TableHead>
                  <TableHead className='text-right'>Amount</TableHead>
                  <TableHead className='text-right'>Avg Unit Price</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.byService?.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className='text-center text-muted-foreground py-8'>
                      No service invoices in selected range
                    </TableCell>
                  </TableRow>
                )}
                {data?.byService?.map((row) => (
                  <TableRow key={row._id}>
                    <TableCell>{row._id}</TableCell>
                    <TableCell className='text-right'>{row.totalQuantity}</TableCell>
                    <TableCell className='text-right font-medium'>{fmt(row.totalAmount)}</TableCell>
                    <TableCell className='text-right'>{fmt(row.avgUnitPrice)}</TableCell>
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

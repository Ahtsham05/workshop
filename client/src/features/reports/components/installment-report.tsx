import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetInstallmentReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Users, TrendingUp, CircleDollarSign, AlertTriangle } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface InstallmentReportProps {
  startDate: string
  endDate: string
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  completed: 'secondary',
  defaulted: 'destructive',
  cancelled: 'outline',
}

export const InstallmentReport = forwardRef<{ exportToExcel: () => void }, InstallmentReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading, isError } = useGetInstallmentReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const wb = XLSX.utils.book_new()

          const planSummaryData = [
            { Metric: 'Total Plans', Value: data.planSummary.totalPlans },
            { Metric: 'Total Amount', Value: data.planSummary.totalAmount },
            { Metric: 'Total Down Payment', Value: data.planSummary.totalDownPayment },
            { Metric: 'Total Paid', Value: data.planSummary.totalPaid },
            { Metric: 'Total Outstanding', Value: data.planSummary.totalOutstanding },
            { Metric: 'Overdue Plans', Value: data.overdueCount },
            { Metric: 'Payments in Period', Value: data.paymentSummary.totalPayments },
            { Metric: 'Collected in Period', Value: data.paymentSummary.totalCollected },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(planSummaryData), 'Summary')

          if (data.byStatus.length > 0) {
            const statusData = data.byStatus.map(r => ({
              Status: r._id,
              Count: r.count,
              'Total Amount': r.totalAmount,
              'Total Paid': r.totalPaid,
              'Outstanding': r.totalOutstanding,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(statusData), 'By Status')
          }

          if (data.paymentDatewise.length > 0) {
            const dwData = data.paymentDatewise.map(r => ({
              Date: r._id,
              Payments: r.payments,
              'Total Collected': r.totalCollected,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Payments Date-wise')
          }

          if (data.recentPlans.length > 0) {
            const plansData = data.recentPlans.map(r => ({
              'Plan #': r.planNumber,
              Customer: r.customerName,
              Phone: r.customerPhone ?? '',
              Item: r.itemDescription,
              'Total Amount': r.totalAmount,
              'Total Paid': r.totalPaid,
              'Outstanding': r.totalOutstanding,
              Status: r.status,
              'Next Due': r.nextDueDate ? format(new Date(r.nextDueDate), 'yyyy-MM-dd') : '',
              'Start Date': r.startDate ? format(new Date(r.startDate), 'yyyy-MM-dd') : '',
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(plansData), 'Recent Plans')
          }

          XLSX.writeFile(wb, `installment-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[400px] w-full' />
    if (isError) {
      return (
        <div className='rounded-md border border-destructive/30 p-8 text-center text-destructive'>
          Failed to load installment report. Please refresh and try again.
        </div>
      )
    }

    const fmt = (v: number) => new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)
    const ps = data ? data.planSummary : null
    const pmtS = data ? data.paymentSummary : null

    return (
      <div className='space-y-6'>
        {/* Plan Summary cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Plans</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <Users className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{ps ? ps.totalPlans : 0}</div>
              <div className='mt-1 flex gap-2 text-xs text-muted-foreground'>
                <span className='text-red-600'>{data ? data.overdueCount : 0} overdue</span>
              </div>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Outstanding</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <CircleDollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{fmt(ps ? ps.totalOutstanding : 0)}</div>
              <p className='text-xs text-muted-foreground'>yet to be collected</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Collected</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(ps ? ps.totalPaid : 0)}</div>
              <p className='text-xs text-muted-foreground'>all time</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('sky')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Collected This Period</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('sky'))}>
                <AlertTriangle className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(pmtS ? pmtS.totalCollected : 0)}</div>
              <p className='text-xs text-muted-foreground'>{pmtS ? pmtS.totalPayments : 0} payments made</p>
            </CardContent>
          </Card>
        </div>

        {/* By Status */}
        {data && data.byStatus.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Plans by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Count</TableHead>
                    <TableHead className='text-right'>Total Amount</TableHead>
                    <TableHead className='text-right'>Total Paid</TableHead>
                    <TableHead className='text-right'>Outstanding</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.byStatus.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[row._id] ?? 'outline'}>
                          {row._id}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right'>{row.count}</TableCell>
                      <TableCell className='text-right'>{fmt(row.totalAmount)}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(row.totalPaid)}</TableCell>
                      <TableCell className='text-right text-red-600'>{fmt(row.totalOutstanding)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Payment Date-wise */}
        {data && data.paymentDatewise.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Payments (Selected Period)</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Payments</TableHead>
                    <TableHead className='text-right'>Total Collected</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.paymentDatewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'>{row.payments}</TableCell>
                      <TableCell className='text-right text-green-600'>{fmt(row.totalCollected)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent Plans */}
        {data && data.recentPlans.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Plans</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Plan #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Item</TableHead>
                      <TableHead className='text-right'>Total Amt</TableHead>
                      <TableHead className='text-right'>Paid</TableHead>
                      <TableHead className='text-right'>Outstanding</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Next Due</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.recentPlans.map(row => (
                      <TableRow key={row._id}>
                        <TableCell className='font-medium'>{row.planNumber}</TableCell>
                        <TableCell>
                          <div>{row.customerName}</div>
                          {row.customerPhone && <div className='text-xs text-muted-foreground'>{row.customerPhone}</div>}
                        </TableCell>
                        <TableCell>{row.itemDescription}</TableCell>
                        <TableCell className='text-right'>{fmt(row.totalAmount)}</TableCell>
                        <TableCell className='text-right text-green-600'>{fmt(row.totalPaid)}</TableCell>
                        <TableCell className='text-right text-red-600'>{fmt(row.totalOutstanding)}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_COLORS[row.status] ?? 'outline'}>
                            {row.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {row.nextDueDate ? format(new Date(row.nextDueDate), 'dd MMM yyyy') : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {!data && !isLoading && (
          <div className='rounded-md border p-8 text-center text-muted-foreground'>
            No installment data available for the selected period.
          </div>
        )}
      </div>
    )
  }
)

InstallmentReport.displayName = 'InstallmentReport'

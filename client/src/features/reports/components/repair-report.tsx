import { forwardRef, useImperativeHandle } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { useGetRepairReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { Wrench, TrendingUp, CircleDollarSign, Clock } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'

interface RepairReportProps {
  startDate: string
  endDate: string
}

const STATUS_COLORS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending: 'secondary',
  in_progress: 'outline',
  completed: 'default',
  delivered: 'default',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  completed: 'Completed',
  delivered: 'Delivered',
}

export const RepairReport = forwardRef<{ exportToExcel: () => void }, RepairReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const { data, isLoading } = useGetRepairReportQuery({ startDate, endDate })

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const wb = XLSX.utils.book_new()

          const summaryData = [
            { Metric: 'Total Jobs', Value: data.summary.totalJobs },
            { Metric: 'Total Revenue', Value: data.summary.totalRevenue },
            { Metric: 'Total Cost', Value: data.summary.totalCost },
            { Metric: 'Total Profit', Value: data.summary.totalProfit },
            { Metric: 'Total Advance', Value: data.summary.totalAdvance },
            { Metric: 'Completed Jobs', Value: data.summary.completedJobs },
            { Metric: 'Delivered Jobs', Value: data.summary.deliveredJobs },
            { Metric: 'Pending Jobs', Value: data.summary.pendingJobs },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryData), 'Summary')

          if (data.datewise.length > 0) {
            const dwData = data.datewise.map(r => ({ Date: r._id, Jobs: r.jobs, Revenue: r.revenue, Cost: r.cost, Profit: r.profit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dwData), 'Date-wise')
          }
          if (data.byTechnician.length > 0) {
            const techData = data.byTechnician.map(r => ({ Technician: r._id, Jobs: r.jobs, Revenue: r.revenue, Cost: r.cost, Profit: r.profit }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(techData), 'By Technician')
          }
          if (data.recentJobs.length > 0) {
            const jobsData = data.recentJobs.map(r => ({
              Customer: r.customerName,
              Phone: r.phone ?? '',
              Device: r.deviceModel,
              Issue: r.issue,
              Status: r.status,
              Charges: r.charges,
              Cost: r.cost,
              Technician: r.technician ?? '',
              Date: r.date,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(jobsData), 'Recent Jobs')
          }

          XLSX.writeFile(wb, `repair-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
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
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Jobs</CardTitle>
              <Wrench className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.totalJobs ?? 0}</div>
              <div className='mt-1 flex gap-2 text-xs text-muted-foreground'>
                <span className='text-yellow-600'>{s?.pendingJobs ?? 0} pending</span>
                <span>·</span>
                <span className='text-green-600'>{s?.completedJobs ?? 0} done</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Revenue</CardTitle>
              <CircleDollarSign className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(s?.totalRevenue ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>charges billed to customers</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Cost</CardTitle>
              <CircleDollarSign className='h-4 w-4 text-red-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{fmt(s?.totalCost ?? 0)}</div>
              <p className='text-xs text-muted-foreground'>parts &amp; labour cost</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Net Profit</CardTitle>
              <TrendingUp className='h-4 w-4 text-green-500' />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${(s?.totalProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(s?.totalProfit ?? 0)}
              </div>
              <p className='text-xs text-muted-foreground'>revenue minus cost</p>
            </CardContent>
          </Card>
        </div>

        {/* Additional metrics */}
        <div className='grid gap-4 sm:grid-cols-2'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Delivered Jobs</CardTitle>
              <Wrench className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{s?.deliveredJobs ?? 0}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Advance Collected</CardTitle>
              <Clock className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{fmt(s?.totalAdvance ?? 0)}</div>
            </CardContent>
          </Card>
        </div>

        {/* By Status */}
        {(data?.byStatus?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Jobs by Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Count</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Cost</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.byStatus.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>
                        <Badge variant={STATUS_COLORS[row._id] ?? 'secondary'}>
                          {STATUS_LABEL[row._id] ?? row._id}
                        </Badge>
                      </TableCell>
                      <TableCell className='text-right font-medium'>{row.count}</TableCell>
                      <TableCell className='text-right text-blue-600'>{fmt(row.revenue)}</TableCell>
                      <TableCell className='text-right text-red-600'>{fmt(row.cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${row.revenue - row.cost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(row.revenue - row.cost)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* By Technician */}
        {(data?.byTechnician?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Performance by Technician</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Technician</TableHead>
                    <TableHead className='text-right'>Jobs</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Cost</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.byTechnician.map(row => (
                    <TableRow key={row._id}>
                      <TableCell className='font-medium'>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.jobs}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600'>{fmt(row.revenue)}</TableCell>
                      <TableCell className='text-right text-red-600'>{fmt(row.cost)}</TableCell>
                      <TableCell className={`text-right font-bold ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(row.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Date-wise */}
        {(data?.datewise?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Date-wise Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Jobs</TableHead>
                    <TableHead className='text-right'>Revenue</TableHead>
                    <TableHead className='text-right'>Cost</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data!.datewise.map(row => (
                    <TableRow key={row._id}>
                      <TableCell>{row._id}</TableCell>
                      <TableCell className='text-right'><Badge variant='secondary'>{row.jobs}</Badge></TableCell>
                      <TableCell className='text-right text-blue-600'>{fmt(row.revenue)}</TableCell>
                      <TableCell className='text-right text-red-600'>{fmt(row.cost)}</TableCell>
                      <TableCell className={`text-right font-medium ${row.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {fmt(row.profit)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Recent Jobs */}
        {(data?.recentJobs?.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Recent Repair Jobs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Device</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead>Technician</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className='text-right'>Charge</TableHead>
                      <TableHead className='text-right'>Cost</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data!.recentJobs.map(job => (
                      <TableRow key={job._id}>
                        <TableCell className='font-medium'>{job.customerName}</TableCell>
                        <TableCell>{job.deviceModel}</TableCell>
                        <TableCell className='max-w-[160px] truncate'>{job.issue}</TableCell>
                        <TableCell>{job.technician ?? '—'}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_COLORS[job.status] ?? 'secondary'}>
                            {STATUS_LABEL[job.status] ?? job.status}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right text-blue-600'>{fmt(job.charges)}</TableCell>
                        <TableCell className='text-right text-red-600'>{fmt(job.cost)}</TableCell>
                        <TableCell className={`text-right font-medium ${job.charges - job.cost >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmt(job.charges - job.cost)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {!s?.totalJobs && (
          <Card>
            <CardContent className='py-12 text-center text-muted-foreground'>
              No repair jobs found for the selected date range.
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)

RepairReport.displayName = 'RepairReport'

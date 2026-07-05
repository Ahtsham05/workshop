import { forwardRef, useImperativeHandle, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  Receipt,
  TrendingUp,
  Banknote,
  Clock,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useGetAgentBillReportQuery, useGetUtilityCompaniesQuery, type AgentBillRecord } from '@/stores/mobile-shop.api'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentBillReportProps {
  startDate: string
  endDate: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16']

const fmtDate = (d?: string) =>
  d ? new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** What the agent owes/paid for this bill: current + previous + previous-overdue are
 *  always payable; current-cycle overdue is only added once the due date passes. */
const billPayable = (bill: AgentBillRecord) => {
  const base = bill.currentBillAmount + bill.previousBillAmount + bill.previousOverdueAmount
  const duePassed = bill.dueDate ? new Date(bill.dueDate) < new Date() : false
  const overdueApplies = bill.overdueAmount > 0 && (bill.overdueCharged || duePassed)
  const payable = overdueApplies ? base + bill.overdueAmount : base
  return { base, payable, overdueApplies }
}

// ─── Component ────────────────────────────────────────────────────────────────

export const AgentBillReport = forwardRef<{ exportToExcel: () => void }, AgentBillReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data: companiesData } = useGetUtilityCompaniesQuery({})
    const allCompanies = companiesData?.results ?? []

    const [companyFilter, setCompanyFilter] = useState<string>('all')

    const { data, isLoading } = useGetAgentBillReportQuery({
      startDate,
      endDate,
      companyId: companyFilter !== 'all' ? companyFilter : undefined,
    })

    // ── Export ──────────────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error('No data available to export')
            return
          }
          const wb = XLSX.utils.book_new()

          const summaryRows = [
            { Metric: 'Total Bills', Value: data.totalBills },
            { Metric: 'Current Bill (Rs.)', Value: data.totalCurrentBill },
            { Metric: 'Current Overdue (Rs.)', Value: data.totalOverdue },
            { Metric: 'Previous Bill (Rs.)', Value: data.totalPreviousBill },
            { Metric: 'Previous Overdue (Rs.)', Value: data.totalPreviousOverdue },
            { Metric: 'Total Collection (Rs.)', Value: data.totalCollection },
            { Metric: 'Total Profit (Rs.)', Value: data.totalProfit },
            { Metric: 'Pending Bills', Value: data.totalPending },
            { Metric: 'Bills Due Today', Value: data.totalDueToday },
            { Metric: 'Overdue Bills', Value: data.totalOverdueBills },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          if (data.trend?.length) {
            const trendRows = data.trend.map((r) => ({
              Date: r._id,
              Bills: r.billCount,
              'Collection (Rs.)': r.totalCollection,
              'Profit (Rs.)': r.totalProfit,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Daily Trend')
          }

          if (data.byCompany?.length) {
            const coRows = data.byCompany.map((r) => ({
              Company: r._id,
              Bills: r.billCount,
              'Collection (Rs.)': r.totalCollection,
              'Profit (Rs.)': r.totalProfit,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coRows), 'By Company')
          }

          if (data.bills?.length) {
            const billRows = data.bills.map((b) => {
              const { payable } = billPayable(b)
              return {
                Customer: b.customerName,
                'Ref #': b.referenceNumber,
                Mobile: b.mobileNo || '',
                Company: b.companyName || '',
                'Collection Date': fmtDate(b.collectionDate),
                'Due Date': fmtDate(b.dueDate),
                'Current Bill (Rs.)': b.currentBillAmount,
                'Current Overdue (Rs.)': b.overdueAmount,
                'Previous Bill (Rs.)': b.previousBillAmount,
                'Previous Overdue (Rs.)': b.previousOverdueAmount,
                'Profit (Rs.)': b.profit,
                'Amount to Pay (Rs.)': payable,
                'Amount Paid (Rs.)': b.isPaid ? b.totalAmount : 0,
                Status: b.isPaid ? 'Paid' : 'Pending',
              }
            })
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(billRows), 'Bill Details')
          }

          XLSX.writeFile(wb, `agent-bill-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Report exported successfully')
        } catch {
          toast.error('Failed to export report')
        }
      },
    }))

    // ── Loading ─────────────────────────────────────────────────────────────

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {[...Array(6)].map((_, i) => <Skeleton key={i} className='h-[100px] w-full' />)}
          </div>
          <Skeleton className='h-[300px] w-full' />
        </div>
      )
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const trendChartData = (data?.trend ?? []).map((r) => ({
      date: r._id.slice(5), // show MM-DD
      Collection: r.totalCollection,
      Profit: r.totalProfit,
    }))

    return (
      <div className='space-y-6'>

        {/* ── Filters ── */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-wrap gap-3 items-center'>
              <span className='text-sm font-medium text-muted-foreground'>Filter:</span>
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className='w-[180px]'>
                  <SelectValue placeholder='All Companies' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Companies</SelectItem>
                  {allCompanies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── Summary Cards ── */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Bills</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <CheckCircle2 className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.totalBills ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>collected in selected period</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('cyan')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Payable</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('cyan'))}>
                <Banknote className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {fmt((data?.totalCurrentBill ?? 0) + (data?.totalPreviousBill ?? 0) + (data?.totalPreviousOverdue ?? 0))}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>Total Bill Payable (before due date)</p>
              <p className='text-xs text-orange-600 mt-0.5'>
                {fmt(data?.totalCollection ?? 0)} after due date
              </p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Profit</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(data?.totalProfit ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>agent service margin</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Pending Bills</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
                <Receipt className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-600'>{data?.totalPending ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                {fmt(data?.totalPendingPayable ?? 0)} payable
                {(data?.totalPendingOverdueIncluded ?? 0) > 0 && (
                  <> (incl. {fmt(data?.totalPendingOverdueIncluded ?? 0)} overdue)</>
                )}
              </p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('orange')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Due Today</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
                <Clock className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{data?.totalDueToday ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>bills due today</p>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Overdue</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <AlertCircle className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{data?.totalOverdueBills ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                missed due date · unpaid: {fmt(data?.totalPendingOverdueIncluded ?? 0)} · paid: {fmt(data?.totalOverduePaid ?? 0)}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* ── Daily Trend Chart ── */}
        {trendChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Collection Trend</CardTitle>
              <CardDescription>Collection vs profit per collection day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <BarChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='date' tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Legend />
                  <Bar dataKey='Collection' fill='#3b82f6' radius={[3, 3, 0, 0]} />
                  <Bar dataKey='Profit' fill='#10b981' radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Company Breakdown ── */}
        <Card>
          <CardHeader>
            <CardTitle>Top Companies</CardTitle>
            <CardDescription>Most bills collected by utility company</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.byCompany ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No data for selected period</p>
            ) : (
              <>
                <ResponsiveContainer width='100%' height={200}>
                  <BarChart
                    layout='vertical'
                    data={data?.byCompany ?? []}
                    margin={{ top: 0, right: 10, left: 10, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray='3 3' />
                    <XAxis type='number' tick={{ fontSize: 10 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <YAxis type='category' dataKey='_id' tick={{ fontSize: 11 }} width={80} />
                    <Tooltip formatter={(value: number) => fmt(value)} />
                    <Bar dataKey='totalProfit' name='Profit' fill='#10b981' radius={[0, 3, 3, 0]} />
                    <Bar dataKey='totalCollection' name='Collection' fill='#3b82f6' radius={[0, 3, 3, 0]} />
                  </BarChart>
                </ResponsiveContainer>
                <Table className='mt-3'>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Company</TableHead>
                      <TableHead className='text-right'>Bills</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                      <TableHead className='text-right'>Collection</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.byCompany ?? []).map((row, i) => (
                      <TableRow key={row._id}>
                        <TableCell>
                          <div className='flex items-center gap-2'>
                            <span
                              className='h-2.5 w-2.5 rounded-full flex-shrink-0'
                              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                            />
                            {row._id}
                          </div>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Badge variant='secondary'>{row.billCount}</Badge>
                        </TableCell>
                        <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(row.totalCollection)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Detailed Daily Table ── */}
        {(data?.trend ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Breakdown</CardTitle>
              <CardDescription>Day-by-day agent bill collection detail</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Bills</TableHead>
                    <TableHead className='text-right'>Collection</TableHead>
                    <TableHead className='text-right'>Profit</TableHead>
                    <TableHead className='text-right'>Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.trend ?? []).map((row) => {
                    const margin = row.totalCollection
                      ? ((row.totalProfit / row.totalCollection) * 100).toFixed(1)
                      : '0'
                    return (
                      <TableRow key={row._id}>
                        <TableCell className='font-medium'>{format(new Date(row._id), 'dd MMM yyyy')}</TableCell>
                        <TableCell className='text-right'>{row.billCount}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(row.totalCollection)}</TableCell>
                        <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalProfit)}</TableCell>
                        <TableCell className='text-right'>
                          <Badge variant={parseFloat(margin) > 0 ? 'default' : 'secondary'}>
                            {margin}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Full Bill Details ── */}
        <Card>
          <CardHeader>
            <CardTitle>Bill Details</CardTitle>
            <CardDescription>Every bill collected in the selected period — bill, overdue, and payment status</CardDescription>
          </CardHeader>
          <CardContent className='p-0'>
            {(data?.bills ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No bills for selected period</p>
            ) : (
              <div className='overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Customer</TableHead>
                      <TableHead>Ref #</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Collection Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead className='text-right'>Current Bill</TableHead>
                      <TableHead className='text-right'>Current Overdue</TableHead>
                      <TableHead className='text-right'>Previous Bill</TableHead>
                      <TableHead className='text-right'>Previous Overdue</TableHead>
                      <TableHead className='text-right'>Profit</TableHead>
                      <TableHead className='text-right'>Amount to Pay</TableHead>
                      <TableHead className='text-right'>Amount Paid</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.bills ?? []).map((bill) => {
                      const { payable, overdueApplies } = billPayable(bill)
                      return (
                        <TableRow key={bill.id}>
                          <TableCell className='font-medium'>{bill.customerName}</TableCell>
                          <TableCell className='font-mono text-xs'>{bill.referenceNumber}</TableCell>
                          <TableCell className='text-sm'>{bill.companyName || '—'}</TableCell>
                          <TableCell className='text-sm'>{fmtDate(bill.collectionDate)}</TableCell>
                          <TableCell className='text-sm'>{fmtDate(bill.dueDate)}</TableCell>
                          <TableCell className='text-right text-sm'>
                            {bill.currentBillAmount > 0 ? fmt(bill.currentBillAmount) : '—'}
                          </TableCell>
                          <TableCell className='text-right text-sm'>
                            {bill.overdueAmount > 0 ? (
                              <span className={overdueApplies ? 'text-red-600' : 'text-orange-500'}>
                                {fmt(bill.overdueAmount)}
                                {!overdueApplies && <span className='ml-1 text-xs text-muted-foreground'>(pending)</span>}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell className='text-right text-sm'>
                            {bill.previousBillAmount > 0 ? fmt(bill.previousBillAmount) : '—'}
                          </TableCell>
                          <TableCell className='text-right text-sm'>
                            {bill.previousOverdueAmount > 0
                              ? <span className='text-red-600'>{fmt(bill.previousOverdueAmount)}</span>
                              : '—'}
                          </TableCell>
                          <TableCell className='text-right text-sm text-green-600 font-medium'>
                            {bill.profit > 0 ? fmt(bill.profit) : '—'}
                          </TableCell>
                          <TableCell className='text-right text-sm font-semibold'>{fmt(payable)}</TableCell>
                          <TableCell className='text-right text-sm'>
                            {bill.isPaid ? fmt(bill.totalAmount) : '—'}
                          </TableCell>
                          <TableCell>
                            {bill.isPaid ? (
                              <span className='inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded-full'>
                                <CheckCircle2 className='h-3 w-3' /> Paid
                              </span>
                            ) : overdueApplies ? (
                              <span className='inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-100 px-2 py-0.5 rounded-full'>
                                Overdue
                              </span>
                            ) : (
                              <span className='inline-flex items-center gap-1 text-xs font-medium text-yellow-700 bg-yellow-100 px-2 py-0.5 rounded-full'>
                                Pending
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
)

AgentBillReport.displayName = 'AgentBillReport'

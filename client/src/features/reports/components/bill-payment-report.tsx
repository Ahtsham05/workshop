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
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  Receipt,
  TrendingUp,
  Banknote,
  Clock,
  AlertCircle,
  CheckCircle2,
  Zap,
  Flame,
  Droplets,
  Wifi,
  Package,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useGetBillPaymentReportQuery, useGetUtilityCompaniesQuery } from '@/stores/mobile-shop.api'

// ─── Props ────────────────────────────────────────────────────────────────────

interface BillPaymentReportProps {
  startDate: string
  endDate: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

const BILL_TYPE_COLORS: Record<string, string> = {
  electricity: '#f59e0b',
  gas: '#ef4444',
  water: '#3b82f6',
  internet: '#8b5cf6',
  other: '#6b7280',
}

const BILL_TYPE_LABELS: Record<string, string> = {
  electricity: 'Electricity',
  gas: 'Gas',
  water: 'Water',
  internet: 'Internet',
  other: 'Other',
}

const BILL_TYPE_ICONS: Record<string, React.ReactNode> = {
  electricity: <Zap className='h-4 w-4' />,
  gas: <Flame className='h-4 w-4' />,
  water: <Droplets className='h-4 w-4' />,
  internet: <Wifi className='h-4 w-4' />,
  other: <Package className='h-4 w-4' />,
}

const CHART_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899', '#14b8a6', '#f97316', '#84cc16']

// ─── Component ────────────────────────────────────────────────────────────────

export const BillPaymentReport = forwardRef<{ exportToExcel: () => void }, BillPaymentReportProps>(
  ({ startDate, endDate }, ref) => {
    const [billTypeFilter, setBillTypeFilter] = useState<string>('all')
    const { data: companiesData } = useGetUtilityCompaniesQuery({})
    const allCompanies = companiesData?.results ?? []

    const [companyFilter, setCompanyFilter] = useState<string>('all')

    const { data, isLoading } = useGetBillPaymentReportQuery({
      startDate,
      endDate,
      billType: billTypeFilter !== 'all' ? billTypeFilter : undefined,
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

          // Summary sheet
          const summaryRows = [
            { Metric: 'Total Bills Collected', Value: data.totalBills },
            { Metric: 'Total Bill Amount (Rs.)', Value: data.totalBillAmount },
            { Metric: 'Total Service Charges / Profit (Rs.)', Value: data.totalServiceCharges },
            { Metric: 'Total Collection (Rs.)', Value: data.totalCollection },
            { Metric: 'Pending Bills', Value: data.totalPending ?? 0 },
            { Metric: 'Pending Amount (Rs.)', Value: data.totalPendingAmount ?? 0 },
            { Metric: 'Bills Due Today', Value: data.totalDueToday },
            { Metric: 'Overdue Bills', Value: data.totalOverdue },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          // Daily trend sheet
          if (data.trend?.length) {
            const trendRows = data.trend.map((r) => ({
              Date: r._id,
              'Bills Collected': r.billCount,
              'Bill Amount (Rs.)': r.totalBillAmount,
              'Service Charges (Rs.)': r.totalServiceCharges,
              'Total Collection (Rs.)': r.totalCollection,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Daily Trend')
          }

          // By bill type sheet
          if (data.byBillType?.length) {
            const btRows = data.byBillType.map((r) => ({
              'Bill Type': BILL_TYPE_LABELS[r._id] || r._id,
              Bills: r.billCount,
              'Bill Amount (Rs.)': r.totalBillAmount,
              'Service Charges (Rs.)': r.totalServiceCharges,
              'Total Collection (Rs.)': r.totalCollection,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(btRows), 'By Bill Type')
          }

          // By company sheet
          if (data.byCompany?.length) {
            const coRows = data.byCompany.map((r) => ({
              Company: r._id,
              Bills: r.billCount,
              'Bill Amount (Rs.)': r.totalBillAmount,
              'Service Charges (Rs.)': r.totalServiceCharges,
              'Total Collection (Rs.)': r.totalCollection,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(coRows), 'By Company')
          }

          XLSX.writeFile(wb, `bill-payment-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
            {[...Array(8)].map((_, i) => <Skeleton key={i} className='h-[100px] w-full' />)}
          </div>
          <Skeleton className='h-[300px] w-full' />
          <Skeleton className='h-[300px] w-full' />
        </div>
      )
    }

    // ── Render ───────────────────────────────────────────────────────────────

    const profitMargin = data?.totalCollection
      ? ((data.totalServiceCharges / data.totalCollection) * 100).toFixed(1)
      : '0'

    const trendChartData = (data?.trend ?? []).map((r) => ({
      date: r._id.slice(5), // show MM-DD
      'Bill Amt': r.totalBillAmount,
      'Service Charges': r.totalServiceCharges,
      Collection: r.totalCollection,
    }))

    return (
      <div className='space-y-6'>

        {/* ── Filters ── */}
        <Card>
          <CardContent className='p-4'>
            <div className='flex flex-wrap gap-3 items-center'>
              <span className='text-sm font-medium text-muted-foreground'>Filter:</span>
              <Select value={billTypeFilter} onValueChange={setBillTypeFilter}>
                <SelectTrigger className='w-[160px]'>
                  <SelectValue placeholder='All Bill Types' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All Bill Types</SelectItem>
                  <SelectItem value='electricity'>Electricity</SelectItem>
                  <SelectItem value='gas'>Gas</SelectItem>
                  <SelectItem value='water'>Water</SelectItem>
                  <SelectItem value='internet'>Internet</SelectItem>
                  <SelectItem value='other'>Other</SelectItem>
                </SelectContent>
              </Select>
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
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
          {/* Paid bills */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Bills Collected</CardTitle>
              <CheckCircle2 className='h-4 w-4 text-green-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.totalBills ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>paid in selected period</p>
            </CardContent>
          </Card>
          {/* Total collection */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Collection</CardTitle>
              <Banknote className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(data?.totalCollection ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                Bill amt: {fmt(data?.totalBillAmount ?? 0)}
              </p>
            </CardContent>
          </Card>
          {/* Service charges / profit */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Your Profit</CardTitle>
              <TrendingUp className='h-4 w-4 text-green-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(data?.totalServiceCharges ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>Margin: {profitMargin}% of collection</p>
            </CardContent>
          </Card>
          {/* Pending */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Pending Bills</CardTitle>
              <Receipt className='h-4 w-4 text-yellow-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-600'>{data?.totalPending ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                {fmt(data?.totalPendingAmount ?? 0)} outstanding
              </p>
            </CardContent>
          </Card>
          {/* Due Today */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Due Today</CardTitle>
              <Clock className='h-4 w-4 text-orange-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-orange-600'>{data?.totalDueToday ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>bills due today</p>
            </CardContent>
          </Card>
          {/* Overdue */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Overdue</CardTitle>
              <AlertCircle className='h-4 w-4 text-red-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{data?.totalOverdue ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>missed due date</p>
            </CardContent>
          </Card>
          {/* Pending profit estimate */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Pending Profit</CardTitle>
              <TrendingUp className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(data?.totalPendingServiceCharges ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>expected when collected</p>
            </CardContent>
          </Card>
          {/* Avg service charge */}
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Avg Service Charge</CardTitle>
              <Banknote className='h-4 w-4 text-muted-foreground' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>
                {fmt(data?.totalBills ? (data.totalServiceCharges / data.totalBills) : 0)}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>per bill collected</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Daily Trend Chart ── */}
        {trendChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Collection Trend</CardTitle>
              <CardDescription>Bill amount vs service charges collected per day</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={300}>
                <BarChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='date' tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Legend />
                  <Bar dataKey='Bill Amt' fill='#3b82f6' radius={[3, 3, 0, 0]} />
                  <Bar dataKey='Service Charges' fill='#10b981' radius={[3, 3, 0, 0]} />
                  <Bar dataKey='Collection' fill='#8b5cf6' radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Bill Type + Company Breakdown ── */}
        <div className='grid gap-4 lg:grid-cols-2'>
          {/* By Bill Type */}
          <Card>
            <CardHeader>
              <CardTitle>By Bill Type</CardTitle>
              <CardDescription>Collection breakdown by utility type</CardDescription>
            </CardHeader>
            <CardContent>
              {(data?.byBillType ?? []).length === 0 ? (
                <p className='text-sm text-muted-foreground py-8 text-center'>No data for selected period</p>
              ) : (
                <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1'>
                  {/* Pie chart */}
                  <ResponsiveContainer width='100%' height={200}>
                    <PieChart>
                      <Pie
                        data={data?.byBillType ?? []}
                        dataKey='totalCollection'
                        nameKey='_id'
                        cx='50%'
                        cy='50%'
                        outerRadius={80}
                        label={({ _id, percent }) =>
                          `${BILL_TYPE_LABELS[_id] ?? _id} ${(percent * 100).toFixed(0)}%`
                        }
                        labelLine={false}
                      >
                        {(data?.byBillType ?? []).map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={BILL_TYPE_COLORS[entry._id] ?? CHART_COLORS[index % CHART_COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => fmt(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* Table */}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Type</TableHead>
                        <TableHead className='text-right'>Bills</TableHead>
                        <TableHead className='text-right'>Profit</TableHead>
                        <TableHead className='text-right'>Collection</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data?.byBillType ?? []).map((row) => (
                        <TableRow key={row._id}>
                          <TableCell>
                            <div className='flex items-center gap-2'>
                              <span
                                className='flex items-center gap-1'
                                style={{ color: BILL_TYPE_COLORS[row._id] ?? '#6b7280' }}
                              >
                                {BILL_TYPE_ICONS[row._id]}
                              </span>
                              <span>{BILL_TYPE_LABELS[row._id] ?? row._id}</span>
                            </div>
                          </TableCell>
                          <TableCell className='text-right'>{row.billCount}</TableCell>
                          <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalServiceCharges)}</TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(row.totalCollection)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* By Company */}
          <Card>
            <CardHeader>
              <CardTitle>Top Companies</CardTitle>
              <CardDescription>Most bills collected by company</CardDescription>
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
                      <Bar dataKey='totalServiceCharges' name='Profit' fill='#10b981' radius={[0, 3, 3, 0]} />
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
                          <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalServiceCharges)}</TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(row.totalCollection)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Detailed Daily Table ── */}
        {(data?.trend ?? []).length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Breakdown</CardTitle>
              <CardDescription>Day-by-day bill collection detail</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Bills</TableHead>
                    <TableHead className='text-right'>Bill Amount</TableHead>
                    <TableHead className='text-right'>Service Charges (Profit)</TableHead>
                    <TableHead className='text-right'>Total Collected</TableHead>
                    <TableHead className='text-right'>Margin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.trend ?? []).map((row) => {
                    const margin = row.totalCollection
                      ? ((row.totalServiceCharges / row.totalCollection) * 100).toFixed(1)
                      : '0'
                    return (
                      <TableRow key={row._id}>
                        <TableCell className='font-medium'>{format(new Date(row._id), 'dd MMM yyyy')}</TableCell>
                        <TableCell className='text-right'>{row.billCount}</TableCell>
                        <TableCell className='text-right'>{fmt(row.totalBillAmount)}</TableCell>
                        <TableCell className='text-right text-green-600 font-medium'>{fmt(row.totalServiceCharges)}</TableCell>
                        <TableCell className='text-right font-semibold'>{fmt(row.totalCollection)}</TableCell>
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
      </div>
    )
  }
)

BillPaymentReport.displayName = 'BillPaymentReport'

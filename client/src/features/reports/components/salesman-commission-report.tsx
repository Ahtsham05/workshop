import { forwardRef, Fragment, useImperativeHandle, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
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
  ResponsiveContainer,
} from 'recharts'
import { TrendingUp, Banknote, Wallet, Users, Undo2, ShoppingCart, ChevronRight, ChevronDown } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useGetSalesmanCommissionReportQuery } from '@/stores/reports.api'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface SalesmanCommissionReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

export const SalesmanCommissionReport = forwardRef<{ exportToExcel: () => void }, SalesmanCommissionReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data, isFetching: isLoading } = useGetSalesmanCommissionReportQuery({ startDate, endDate })
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const toggleExpanded = (salesmanId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(salesmanId)) next.delete(salesmanId)
        else next.add(salesmanId)
        return next
      })
    }

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) {
            toast.error('No data available to export')
            return
          }
          const wb = XLSX.utils.book_new()

          const summaryRows = [
            { Metric: 'Total Commission Earned (Rs.)', Value: data.summary.totalEarned },
            { Metric: 'Total Commission Reversed (Rs.)', Value: data.summary.totalReversed },
            { Metric: 'Net Commission (Rs.)', Value: data.summary.netCommission },
            { Metric: 'Total Commission Paid (Rs.)', Value: data.summary.totalPaid },
            { Metric: 'Total Outstanding / Payable (Rs.)', Value: data.summary.totalOutstanding },
            { Metric: 'Total Sales Attributed (Rs.)', Value: data.summary.totalSalesAmount },
            { Metric: 'Sales Count', Value: data.summary.totalSalesCount },
            { Metric: 'Active Salesmen', Value: data.summary.activeSalesmenCount },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          if (data.salesmen.length) {
            const salesmenRows = data.salesmen.map((s) => ({
              Salesman: s.name,
              Code: s.salesmanCode,
              'Sales Count': s.salesCount,
              'Sales Amount (Rs.)': s.salesAmount,
              'Commission Earned (Rs.)': s.earned,
              'Commission Reversed (Rs.)': s.reversed,
              'Commission Paid (Rs.)': s.paid,
              'Current Balance (Rs.)': s.currentBalance,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(salesmenRows), 'By Salesman')

            const invoiceRows = data.salesmen.flatMap((s) =>
              s.invoices.map((inv) => ({
                Salesman: s.name,
                'Invoice / Return': inv.reference,
                Date: format(new Date(inv.date), 'yyyy-MM-dd'),
                Type: inv.transactionType === 'commission_earned' ? 'Earned' : 'Reversed',
                'Sale Amount (Rs.)': inv.saleAmount,
                'Rate (%)': inv.rate ?? '',
                'Commission (Rs.)': inv.transactionType === 'commission_earned' ? inv.amount : -inv.amount,
              }))
            )
            if (invoiceRows.length) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(invoiceRows), 'Invoice Detail')
            }
          }

          if (data.trend.length) {
            const trendRows = data.trend.map((r) => ({
              Date: r.date,
              'Commission Earned (Rs.)': r.earned,
              'Sales Count': r.count,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Daily Trend')
          }

          XLSX.writeFile(wb, `salesman-commission-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success('Report exported successfully')
        } catch {
          toast.error('Failed to export report')
        }
      },
    }))

    if (isLoading) {
      return (
        <div className='space-y-4'>
          <div className='grid gap-4 md:grid-cols-2 lg:grid-cols-4'>
            {[...Array(6)].map((_, i) => <Skeleton key={i} className='h-[100px] w-full' />)}
          </div>
          <Skeleton className='h-[300px] w-full' />
          <Skeleton className='h-[300px] w-full' />
        </div>
      )
    }

    const trendChartData = (data?.trend ?? []).map((r) => ({
      date: r.date.slice(5),
      Earned: r.earned,
    }))

    return (
      <div className='space-y-6'>
        {/* ── Summary Cards ── */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
          <Card className={kpiCardClass('emerald')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Commission Earned</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(data?.summary.totalEarned ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                Net of returns: {fmt(data?.summary.netCommission ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Commission Reversed</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <Undo2 className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-red-600'>{fmt(data?.summary.totalReversed ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>from sales returns / cancellations</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('cyan')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Commission Paid</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('cyan'))}>
                <Banknote className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(data?.summary.totalPaid ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>paid out in selected period</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('amber')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Outstanding / Payable</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('amber'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-yellow-600'>{fmt(data?.summary.totalOutstanding ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>owed to salesmen right now</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Sales Attributed</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <ShoppingCart className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(data?.summary.totalSalesAmount ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>{data?.summary.totalSalesCount ?? 0} invoices</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Active Salesmen</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <Users className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.summary.activeSalesmenCount ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>with commission activity</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Daily Trend Chart ── */}
        {trendChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Commission Trend</CardTitle>
              <CardDescription>Commission earned per day, selected period</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={280}>
                <BarChart data={trendChartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='date' tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(value: number) => fmt(value)} />
                  <Bar dataKey='Earned' fill='#10b981' radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* ── Per-Salesman Leaderboard ── */}
        <Card>
          <CardHeader>
            <CardTitle>By Salesman</CardTitle>
            <CardDescription>Ranked by commission earned in the selected period</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.salesmen ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No commission activity for selected period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10' />
                    <TableHead>Salesman</TableHead>
                    <TableHead className='text-right'>Sales</TableHead>
                    <TableHead className='text-right'>Sales Amount</TableHead>
                    <TableHead className='text-right'>Earned</TableHead>
                    <TableHead className='text-right'>Reversed</TableHead>
                    <TableHead className='text-right'>Paid</TableHead>
                    <TableHead className='text-right'>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.salesmen ?? []).map((row) => {
                    const isExpanded = expandedIds.has(row.salesmanId)
                    const hasInvoices = row.invoices.length > 0
                    return (
                      <Fragment key={row.salesmanId}>
                        <TableRow
                          className={hasInvoices ? 'cursor-pointer hover:bg-muted/50' : undefined}
                          onClick={() => hasInvoices && toggleExpanded(row.salesmanId)}
                        >
                          <TableCell className='text-muted-foreground'>
                            {hasInvoices ? (
                              isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className='font-medium'>{row.name}</div>
                            {row.salesmanCode && <div className='text-xs text-muted-foreground'>{row.salesmanCode}</div>}
                          </TableCell>
                          <TableCell className='text-right'>
                            <Badge variant='secondary'>{row.salesCount}</Badge>
                          </TableCell>
                          <TableCell className='text-right'>{fmt(row.salesAmount)}</TableCell>
                          <TableCell className='text-right text-green-600 font-medium'>{fmt(row.earned)}</TableCell>
                          <TableCell className='text-right text-red-600'>
                            {row.reversed > 0 ? fmt(row.reversed) : '—'}
                          </TableCell>
                          <TableCell className='text-right'>{row.paid > 0 ? fmt(row.paid) : '—'}</TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(row.currentBalance)}</TableCell>
                        </TableRow>
                        {isExpanded && hasInvoices && (
                          <TableRow key={`${row.salesmanId}-detail`} className='bg-muted/30 hover:bg-muted/30'>
                            <TableCell colSpan={8} className='p-0'>
                              <div className='px-4 py-3'>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Invoice / Return</TableHead>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead className='text-right'>Sale Amount</TableHead>
                                      <TableHead className='text-right'>Rate</TableHead>
                                      <TableHead className='text-right'>Commission</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.invoices.map((inv, idx) => (
                                      <TableRow key={`${inv.referenceId || idx}-${inv.transactionType}`}>
                                        <TableCell className='font-mono text-sm'>{inv.reference || '—'}</TableCell>
                                        <TableCell className='text-sm'>{format(new Date(inv.date), 'dd MMM yyyy')}</TableCell>
                                        <TableCell>
                                          <Badge
                                            className={
                                              inv.transactionType === 'commission_earned'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'
                                            }
                                          >
                                            {inv.transactionType === 'commission_earned' ? 'Earned' : 'Reversed'}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className='text-right'>{fmt(inv.saleAmount)}</TableCell>
                                        <TableCell className='text-right text-muted-foreground'>
                                          {inv.rate !== undefined ? `${inv.rate}%` : '—'}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            'text-right font-medium',
                                            inv.transactionType === 'commission_earned' ? 'text-green-600' : 'text-red-600',
                                          )}
                                        >
                                          {inv.transactionType === 'commission_earned' ? '+' : '−'}{fmt(inv.amount)}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </TableCell>
                          </TableRow>
                        )}
                      </Fragment>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
)

SalesmanCommissionReport.displayName = 'SalesmanCommissionReport'

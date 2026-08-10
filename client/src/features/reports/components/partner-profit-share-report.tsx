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
import { TrendingUp, Banknote, Wallet, Users, Undo2, PieChart, ChevronRight, ChevronDown, Package } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useGetPartnerProfitShareReportQuery } from '@/stores/reports.api'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface PartnerProfitShareReportProps {
  startDate: string
  endDate: string
}

const fmt = (v: number) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(v)

const PARTNER_TYPE_LABEL: Record<string, string> = {
  business_partner: 'Business Partner',
  product_investor: 'Product Investor',
}

export const PartnerProfitShareReport = forwardRef<{ exportToExcel: () => void }, PartnerProfitShareReportProps>(
  ({ startDate, endDate }, ref) => {
    const { data, isLoading } = useGetPartnerProfitShareReportQuery({ startDate, endDate })
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())

    const toggleExpanded = (partnerId: string) => {
      setExpandedIds((prev) => {
        const next = new Set(prev)
        if (next.has(partnerId)) next.delete(partnerId)
        else next.add(partnerId)
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
            { Metric: 'Total Profit Share Earned (Rs.)', Value: data.summary.totalEarned },
            { Metric: 'Total Profit Share Reversed (Rs.)', Value: data.summary.totalReversed },
            { Metric: 'Net Profit Share (Rs.)', Value: data.summary.netShare },
            { Metric: 'Total Profit Share Paid (Rs.)', Value: data.summary.totalPaid },
            { Metric: 'Total Outstanding / Payable (Rs.)', Value: data.summary.totalOutstanding },
            { Metric: 'Total Profit Base (Rs.)', Value: data.summary.totalProfitBase },
            { Metric: 'Sale Count', Value: data.summary.totalSaleCount },
            { Metric: 'Active Partners', Value: data.summary.activePartnersCount },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

          if (data.partners.length) {
            const partnerRows = data.partners.map((p) => ({
              Partner: p.name,
              Type: PARTNER_TYPE_LABEL[p.partnerType] || p.partnerType,
              'Sale Count': p.saleCount,
              'Profit Base (Rs.)': p.profitBase,
              'Earned (Rs.)': p.earned,
              'Reversed (Rs.)': p.reversed,
              'Paid (Rs.)': p.paid,
              'Current Balance (Rs.)': p.currentBalance,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(partnerRows), 'By Partner')

            const entryRows = data.partners.flatMap((p) =>
              p.entries.map((e) => ({
                Partner: p.name,
                Reference: e.reference,
                Date: format(new Date(e.date), 'yyyy-MM-dd'),
                Type: e.transactionType === 'share_earned' ? 'Earned' : 'Reversed',
                Product: e.productName || 'Org / Branch-wide',
                'Profit Base (Rs.)': e.saleProfit,
                Rate: e.shareType === 'fixed_per_unit' ? `Rs ${e.rate ?? 0}/unit` : `${e.rate ?? 0}%`,
                'Share (Rs.)': e.transactionType === 'share_earned' ? e.amount : -e.amount,
              }))
            )
            if (entryRows.length) {
              XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(entryRows), 'Ledger Detail')
            }
          }

          if (data.byProduct.length) {
            const productRows = data.byProduct.map((p) => ({
              Product: p.name,
              'Sale Count': p.count,
              'Profit Base (Rs.)': p.saleProfit,
              'Partner Share (Rs.)': p.earned,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productRows), 'By Product')
          }

          if (data.trend.length) {
            const trendRows = data.trend.map((r) => ({
              Date: r.date,
              'Profit Share Earned (Rs.)': r.earned,
              'Sale Count': r.count,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(trendRows), 'Daily Trend')
          }

          XLSX.writeFile(wb, `partner-profit-share-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
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
              <CardTitle className='text-sm font-medium'>Profit Share Earned</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                <TrendingUp className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-green-600'>{fmt(data?.summary.totalEarned ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                Net of returns: {fmt(data?.summary.netShare ?? 0)}
              </p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Profit Share Reversed</CardTitle>
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
              <CardTitle className='text-sm font-medium'>Profit Share Paid</CardTitle>
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
              <p className='text-xs text-muted-foreground mt-1'>owed to partners right now</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Profit Base</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <PieChart className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{fmt(data?.summary.totalProfitBase ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>{data?.summary.totalSaleCount ?? 0} sales attributed</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Active Partners</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <Users className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold'>{data?.summary.activePartnersCount ?? 0}</div>
              <p className='text-xs text-muted-foreground mt-1'>with profit-share activity</p>
            </CardContent>
          </Card>
        </div>

        {/* ── Daily Trend Chart ── */}
        {trendChartData.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Daily Profit-Share Trend</CardTitle>
              <CardDescription>Profit share earned per day, selected period</CardDescription>
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

        {/* ── Per-Partner Leaderboard ── */}
        <Card>
          <CardHeader>
            <CardTitle>By Partner</CardTitle>
            <CardDescription>Ranked by profit share earned in the selected period — click a row for the full ledger trail</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.partners ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>No profit-share activity for selected period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10' />
                    <TableHead>Partner</TableHead>
                    <TableHead className='text-right'>Sales</TableHead>
                    <TableHead className='text-right'>Profit Base</TableHead>
                    <TableHead className='text-right'>Earned</TableHead>
                    <TableHead className='text-right'>Reversed</TableHead>
                    <TableHead className='text-right'>Paid</TableHead>
                    <TableHead className='text-right'>Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.partners ?? []).map((row) => {
                    const isExpanded = expandedIds.has(row.partnerId)
                    const hasEntries = row.entries.length > 0
                    return (
                      <Fragment key={row.partnerId}>
                        <TableRow
                          className={hasEntries ? 'cursor-pointer hover:bg-muted/50' : undefined}
                          onClick={() => hasEntries && toggleExpanded(row.partnerId)}
                        >
                          <TableCell className='text-muted-foreground'>
                            {hasEntries ? (
                              isExpanded ? <ChevronDown className='h-4 w-4' /> : <ChevronRight className='h-4 w-4' />
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className='font-medium'>{row.name}</div>
                            <Badge variant='outline' className='text-xs mt-0.5'>
                              {PARTNER_TYPE_LABEL[row.partnerType] || row.partnerType}
                            </Badge>
                          </TableCell>
                          <TableCell className='text-right'>
                            <Badge variant='secondary'>{row.saleCount}</Badge>
                          </TableCell>
                          <TableCell className='text-right'>{fmt(row.profitBase)}</TableCell>
                          <TableCell className='text-right text-green-600 font-medium'>{fmt(row.earned)}</TableCell>
                          <TableCell className='text-right text-red-600'>
                            {row.reversed > 0 ? fmt(row.reversed) : '—'}
                          </TableCell>
                          <TableCell className='text-right'>{row.paid > 0 ? fmt(row.paid) : '—'}</TableCell>
                          <TableCell className='text-right font-semibold'>{fmt(row.currentBalance)}</TableCell>
                        </TableRow>
                        {isExpanded && hasEntries && (
                          <TableRow key={`${row.partnerId}-detail`} className='bg-muted/30 hover:bg-muted/30'>
                            <TableCell colSpan={8} className='p-0'>
                              <div className='px-4 py-3'>
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead>Reference</TableHead>
                                      <TableHead>Date</TableHead>
                                      <TableHead>Type</TableHead>
                                      <TableHead>Product</TableHead>
                                      <TableHead className='text-right'>Profit Base</TableHead>
                                      <TableHead className='text-right'>Rate</TableHead>
                                      <TableHead className='text-right'>Share</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {row.entries.map((e, idx) => (
                                      <TableRow key={`${e.referenceId || idx}-${e.transactionType}`}>
                                        <TableCell className='font-mono text-sm'>{e.reference || '—'}</TableCell>
                                        <TableCell className='text-sm'>{format(new Date(e.date), 'dd MMM yyyy')}</TableCell>
                                        <TableCell>
                                          <Badge
                                            className={
                                              e.transactionType === 'share_earned'
                                                ? 'bg-green-100 text-green-800'
                                                : 'bg-red-100 text-red-800'
                                            }
                                          >
                                            {e.transactionType === 'share_earned' ? 'Earned' : 'Reversed'}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className='text-sm text-muted-foreground'>
                                          {e.productName || 'Org / Branch-wide'}
                                        </TableCell>
                                        <TableCell className='text-right'>{fmt(e.saleProfit)}</TableCell>
                                        <TableCell className='text-right text-muted-foreground'>
                                          {e.shareType === 'fixed_per_unit' ? `Rs ${e.rate ?? 0}/unit` : `${e.rate ?? 0}%`}
                                        </TableCell>
                                        <TableCell
                                          className={cn(
                                            'text-right font-medium',
                                            e.transactionType === 'share_earned' ? 'text-green-600' : 'text-red-600',
                                          )}
                                        >
                                          {e.transactionType === 'share_earned' ? '+' : '−'}{fmt(e.amount)}
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

        {/* ── By Product ── */}
        <Card>
          <CardHeader>
            <div className='flex items-center gap-2'>
              <Package className='h-4 w-4 text-muted-foreground' />
              <CardTitle>By Product</CardTitle>
            </div>
            <CardDescription>Which products are driving the most partner/investor payout — product-scoped rules only</CardDescription>
          </CardHeader>
          <CardContent>
            {(data?.byProduct ?? []).length === 0 ? (
              <p className='text-sm text-muted-foreground py-8 text-center'>
                No product-scoped profit-share activity for selected period
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead className='text-right'>Sales</TableHead>
                    <TableHead className='text-right'>Profit Base</TableHead>
                    <TableHead className='text-right'>Partner Share</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.byProduct ?? []).map((p) => (
                    <TableRow key={p.productId}>
                      <TableCell className='font-medium'>{p.name}</TableCell>
                      <TableCell className='text-right'>
                        <Badge variant='secondary'>{p.count}</Badge>
                      </TableCell>
                      <TableCell className='text-right'>{fmt(p.saleProfit)}</TableCell>
                      <TableCell className='text-right text-green-600 font-medium'>{fmt(p.earned)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }
)

PartnerProfitShareReport.displayName = 'PartnerProfitShareReport'

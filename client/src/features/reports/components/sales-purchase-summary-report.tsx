import { forwardRef, useImperativeHandle, useMemo } from 'react'
import { Link } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useGetSalesPurchaseSummaryReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
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
import { Receipt, ShoppingCart, TrendingUp, Wallet, DollarSign } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { normalizeBusinessType, isCashBookBusiness } from '@/lib/business-types'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { ReportBreakdownRow } from './report-breakdown-row'
import {
  reportBreakdownGridClass,
  reportChartHeight,
  reportKpiGridClass,
  reportKpiLabelClass,
  reportKpiSubClass,
  reportKpiValueClass,
  reportSectionTitleClass,
} from '../utils/report-styles'

interface SalesPurchaseSummaryReportProps {
  startDate: string
  endDate: string
}

const SALES_COLORS: Record<string, string> = {
  Sales: 'text-blue-600',
  'Purchase Returns': 'text-teal-600',
  'Load Sale': 'text-indigo-600',
  'Cash Received': 'text-violet-600',
  'Sim Sale': 'text-cyan-600',
  Repairing: 'text-amber-600',
  Services: 'text-emerald-600',
  'Bill Payments': 'text-lime-600',
  Installments: 'text-fuchsia-600',
  'Customer Payments': 'text-sky-600',
  'Supplier Payments': 'text-purple-600',
}

const PURCHASE_COLORS: Record<string, string> = {
  Purchases: 'text-orange-600',
  'Sales Returns': 'text-rose-600',
  Expenses: 'text-red-600',
  'Load Purchase': 'text-indigo-700',
  'Cash Sent': 'text-violet-700',
  'Sim Sale': 'text-cyan-700',
  Repairing: 'text-amber-700',
  'Bill Payments': 'text-lime-700',
  'Customer Payments': 'text-sky-700',
  'Supplier Payments': 'text-purple-700',
  'Wallet Expense': 'text-yellow-700',
}

export const SalesPurchaseSummaryReport = forwardRef<
  { exportToExcel: () => void },
  SalesPurchaseSummaryReportProps
>(({ startDate, endDate }, ref) => {
  const { t } = useLanguage()

  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = normalizeBusinessType(org?.businessType || user?.businessType) === 'mobile_shop'
  const showCashBookFeatures = isCashBookBusiness(org?.businessType || user?.businessType)

  const { data, isLoading } = useGetSalesPurchaseSummaryReportQuery({ startDate, endDate })

  const visibleModules = useMemo(
    () => (data?.modules ?? []).filter((row) => !row.mobileOnly || isMobileShop),
    [data?.modules, isMobileShop],
  )

  const salesRows = useMemo(
    () => visibleModules.filter((row) => row.sales > 0).sort((a, b) => b.sales - a.sales),
    [visibleModules],
  )

  const purchaseRows = useMemo(
    () => visibleModules.filter((row) => row.purchases > 0).sort((a, b) => b.purchases - a.purchases),
    [visibleModules],
  )

  const fmt = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  const summary = data?.summary
  const monthly = data?.monthly ?? []

  useImperativeHandle(ref, () => ({
    exportToExcel: () => {
      try {
        if (!data) {
          toast.error(t('No data available to export'))
          return
        }

        const wb = XLSX.utils.book_new()

        const summaryRows = [
          { Metric: 'Period Start', Value: startDate },
          { Metric: 'Period End', Value: endDate },
          { Metric: 'Total Sales', Value: data.summary.totalSales },
          { Metric: 'Total Purchases', Value: data.summary.totalPurchases },
          { Metric: 'Total Expenses', Value: data.summary.totalExpenses },
          { Metric: 'My Wallet Expense', Value: data.summary.myWalletExpense },
          { Metric: 'Cash in Hand', Value: data.summary.cashInHand },
          { Metric: 'Sales Transactions', Value: data.summary.salesTransactions },
          { Metric: 'Purchase Transactions', Value: data.summary.purchaseTransactions },
        ]
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Summary')

        const moduleRows = visibleModules.map((row) => ({
          Module: row.module,
          Sales: row.sales,
          Purchases: row.purchases,
          'Sales Count': row.salesCount,
          'Purchase Count': row.purchaseCount,
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(moduleRows), 'By Module')

        if (monthly.length > 0) {
          const monthlyRows = monthly.map((row) => ({
            Month: row.month,
            Sales: row.sales,
            Purchases: row.purchases,
          }))
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly')
        }

        XLSX.writeFile(wb, `sales-purchase-summary-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
        toast.success(t('Data exported successfully'))
      } catch {
        toast.error(t('Failed to export data'))
      }
    },
  }))

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <div className={cn(reportKpiGridClass, showCashBookFeatures && 'lg:grid-cols-3 xl:grid-cols-5')}>
          {Array.from({ length: showCashBookFeatures ? 5 : 4 }).map((_, i) => (
            <Skeleton key={i} className='h-[120px] w-full' />
          ))}
        </div>
        <div className={reportBreakdownGridClass}>
          <Skeleton className='h-[360px] w-full' />
          <Skeleton className='h-[360px] w-full' />
        </div>
        <Skeleton className='h-[320px] w-full' />
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div className={cn(reportKpiGridClass, showCashBookFeatures && 'lg:grid-cols-3 xl:grid-cols-5')}>
        <Card className={kpiCardClass('emerald')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className={reportKpiLabelClass}>Total Sales</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
              <TrendingUp className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`${reportKpiValueClass} text-green-600`}>{fmt(summary?.totalSales ?? 0)}</div>
            <p className={reportKpiSubClass}>
              {summary?.salesTransactions ?? 0} sale transactions across all modules
            </p>
          </CardContent>
        </Card>

        <Card className={kpiCardClass('rose')}>
          <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
            <CardTitle className={reportKpiLabelClass}>Total Purchases</CardTitle>
            <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
              <ShoppingCart className='h-4 w-4' />
            </div>
          </CardHeader>
          <CardContent>
            <div className={`${reportKpiValueClass} text-rose-600`}>{fmt(summary?.totalPurchases ?? 0)}</div>
            <p className={reportKpiSubClass}>
              {summary?.purchaseTransactions ?? 0} purchase transactions across all modules
            </p>
          </CardContent>
        </Card>

        <Link to='/accounting' search={{ tab: 'expenses' }} className='block'>
          <Card className={cn(kpiCardClass('orange'), 'h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>Expenses</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('orange'))}>
                <Receipt className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} text-orange-600`}>{fmt(summary?.totalExpenses ?? 0)}</div>
              <p className={reportKpiSubClass}>
                {summary?.expenseCount ?? 0} expense {summary?.expenseCount === 1 ? 'entry' : 'entries'} in selected period
              </p>
            </CardContent>
          </Card>
        </Link>

        <Link to='/accounting' search={{ tab: 'wallet' }} className='block'>
          <Card className={cn(kpiCardClass('rose'), 'h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>My Wallet</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('rose'))}>
                <Wallet className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} text-rose-600`}>{fmt(summary?.myWalletExpense ?? 0)}</div>
              <p className={reportKpiSubClass}>
                {summary?.myWalletExpenseCount ?? 0} wallet expense {summary?.myWalletExpenseCount === 1 ? 'entry' : 'entries'} · Money out
              </p>
            </CardContent>
          </Card>
        </Link>

        {showCashBookFeatures && (
          <Link to='/cash-book' className='block'>
            <Card className={cn(kpiCardClass('emerald'), 'h-full cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-md')}>
              <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
                <CardTitle className={reportKpiLabelClass}>Cash in Hand</CardTitle>
                <div className={cn('shrink-0', toneIconWrapClass('emerald'))}>
                  <DollarSign className='h-4 w-4' />
                </div>
              </CardHeader>
              <CardContent>
                <div className={`${reportKpiValueClass} text-emerald-600`}>{fmt(summary?.cashInHand ?? 0)}</div>
                <p className={reportKpiSubClass}>Available cash after expenses</p>
              </CardContent>
            </Card>
          </Link>
        )}
      </div>

      <div className={reportBreakdownGridClass}>
        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>Sales Breakdown</CardTitle>
            <CardDescription>Total sale amount by module — no profit shown</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {salesRows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No sales recorded for this period.</p>
            ) : (
              salesRows.map((row) => (
                <ReportBreakdownRow
                  key={row.module}
                  label={row.module}
                  value={fmt(row.sales)}
                  valueClass={SALES_COLORS[row.module] || 'text-green-600'}
                  sub={`${row.salesCount} ${row.salesCount === 1 ? 'entry' : 'entries'}`}
                />
              ))
            )}
            <ReportBreakdownRow
              label='Total Sales'
              value={fmt(summary?.totalSales ?? 0)}
              valueClass='text-green-700'
              bold
              border
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>Purchases Breakdown</CardTitle>
            <CardDescription>Total purchase and outflow amount by module</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {purchaseRows.length === 0 ? (
              <p className='text-sm text-muted-foreground'>No purchases recorded for this period.</p>
            ) : (
              purchaseRows.map((row) => (
                <ReportBreakdownRow
                  key={row.module}
                  label={row.module}
                  value={fmt(row.purchases)}
                  valueClass={PURCHASE_COLORS[row.module] || 'text-rose-600'}
                  sub={`${row.purchaseCount} ${row.purchaseCount === 1 ? 'entry' : 'entries'}`}
                />
              ))
            )}
            <ReportBreakdownRow
              label='Total Purchases'
              value={fmt(summary?.totalPurchases ?? 0)}
              valueClass='text-rose-700'
              bold
              border
            />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className={reportSectionTitleClass}>Module Overview</CardTitle>
          <CardDescription>Sales and purchases for every module in one view</CardDescription>
        </CardHeader>
        <CardContent className='min-w-0'>
          <div className='w-full min-w-0 overflow-x-auto'>
            <Table className='w-max min-w-full'>
              <TableHeader>
                <TableRow>
                  <TableHead>Module</TableHead>
                  <TableHead className='text-right'>Sales</TableHead>
                  <TableHead className='text-right'>Purchases</TableHead>
                  <TableHead className='text-right'>Sale Entries</TableHead>
                  <TableHead className='text-right'>Purchase Entries</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleModules.map((row) => (
                  <TableRow key={row.module}>
                    <TableCell className='font-medium'>{row.module}</TableCell>
                    <TableCell className='text-right text-green-600 tabular-nums'>
                      {row.sales > 0 ? fmt(row.sales) : '—'}
                    </TableCell>
                    <TableCell className='text-right text-rose-600 tabular-nums'>
                      {row.purchases > 0 ? fmt(row.purchases) : '—'}
                    </TableCell>
                    <TableCell className='text-right tabular-nums'>{row.salesCount || '—'}</TableCell>
                    <TableCell className='text-right tabular-nums'>{row.purchaseCount || '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow className='bg-muted/60 font-semibold'>
                  <TableCell>Total</TableCell>
                  <TableCell className='text-right text-green-700 tabular-nums'>
                    {fmt(summary?.totalSales ?? 0)}
                  </TableCell>
                  <TableCell className='text-right text-rose-700 tabular-nums'>
                    {fmt(summary?.totalPurchases ?? 0)}
                  </TableCell>
                  <TableCell className='text-right tabular-nums'>{summary?.salesTransactions ?? 0}</TableCell>
                  <TableCell className='text-right tabular-nums'>{summary?.purchaseTransactions ?? 0}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </div>
        </CardContent>
      </Card>

      {monthly.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>Monthly Sales vs Purchases</CardTitle>
            <CardDescription>Compare total sales and purchases each month</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width='100%' height={reportChartHeight + 40}>
              <BarChart data={monthly} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='month' tick={{ fontSize: 13 }} />
                <YAxis
                  tickFormatter={(v) =>
                    new Intl.NumberFormat('en-PK', {
                      notation: 'compact',
                      maximumFractionDigits: 1,
                    }).format(v)
                  }
                  tick={{ fontSize: 13 }}
                />
                <Tooltip formatter={(value: number, name: string) => [fmt(value), name]} />
                <Legend />
                <Bar dataKey='sales' name='Sales' fill='#22c55e' radius={[4, 4, 0, 0]} />
                <Bar dataKey='purchases' name='Purchases' fill='#ef4444' radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className='flex h-40 items-center justify-center text-muted-foreground'>
            No monthly data available for the selected period.
          </CardContent>
        </Card>
      )}
    </div>
  )
})

SalesPurchaseSummaryReport.displayName = 'SalesPurchaseSummaryReport'

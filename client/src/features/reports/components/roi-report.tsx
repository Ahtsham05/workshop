import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useGetRoiReportQuery, useGetMonthlyRoiQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import { TrendingUp, TrendingDown, DollarSign, PiggyBank, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import { format, subMonths, subDays } from 'date-fns'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { normalizeBusinessType } from '@/lib/business-types'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'

interface RoiReportProps {
  startDate: string
  endDate: string
}

type Preset = '7d' | '30d' | '6m' | '1y'

const PRESETS: { label: string; value: Preset }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '6 Months', value: '6m' },
  { label: '1 Year', value: '1y' },
]

function getPresetDates(preset: Preset, startDate: string, endDate: string): { from: string; to: string } {
  if (startDate && endDate) return { from: startDate, to: endDate }
  const now = new Date()
  const to = format(now, 'yyyy-MM-dd')
  let from: string
  switch (preset) {
    case '7d':
      from = format(subDays(now, 7), 'yyyy-MM-dd')
      break
    case '30d':
      from = format(subDays(now, 30), 'yyyy-MM-dd')
      break
    case '6m':
      from = format(subMonths(now, 6), 'yyyy-MM-dd')
      break
    case '1y':
    default:
      from = format(subMonths(now, 12), 'yyyy-MM-dd')
      break
  }
  return { from, to }
}

export const RoiReport = forwardRef<{ exportToExcel: () => void }, RoiReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const [preset, setPreset] = useState<Preset>('1y')

    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
    const isMobileShop = normalizeBusinessType(org?.businessType || user?.businessType) === 'mobile_shop'

    const dates = useMemo(() => getPresetDates(preset, startDate, endDate), [preset, startDate, endDate])

    const { data: roiData, isLoading: roiLoading } = useGetRoiReportQuery(dates)
    const { data: monthlyData, isLoading: monthlyLoading } = useGetMonthlyRoiQuery(dates)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!roiData) {
            toast.error(t('No data available to export'))
            return
          }
          const wb = XLSX.utils.book_new()

          const summaryRows = [
            { Metric: 'Total Investment', Value: roiData.investment },
            { Metric: 'Inventory Value', Value: roiData.inventoryValue },
            { Metric: 'Wallet Balance', Value: roiData.walletBalance },
            { Metric: 'Total Profit', Value: roiData.profit },
            { Metric: 'ROI (%)', Value: roiData.roi },
            { Metric: '', Value: '' },
            { Metric: '-- Investment Breakdown --', Value: '' },
            { Metric: 'Current Inventory Value', Value: roiData.breakdown.investment.inventoryValue },
            { Metric: 'Wallet Balance (JazzCash + EasyPaisa)', Value: roiData.breakdown.investment.walletBalance },
            { Metric: 'Expenses', Value: roiData.breakdown.investment.expenses },
            { Metric: 'Purchase Returns Recovery (info)', Value: roiData.breakdown.investment.purchaseReturnsRecovery },
            { Metric: '', Value: '' },
            { Metric: '-- Profit Breakdown --', Value: '' },
            { Metric: 'Sales Profit', Value: roiData.breakdown.profit.salesProfit },
            { Metric: 'Load Profit', Value: roiData.breakdown.profit.loadProfit },
            { Metric: 'Repair Profit', Value: roiData.breakdown.profit.repairProfit },
            { Metric: 'Service Profit', Value: roiData.breakdown.profit.serviceProfit },
            { Metric: 'Sim Sale Profit', Value: roiData.breakdown.profit.simSaleProfit },
            { Metric: 'Bill Payment Profit', Value: roiData.breakdown.profit.billPaymentProfit },
            { Metric: 'Withdrawal Profit', Value: roiData.breakdown.profit.withdrawalProfit },
            { Metric: 'Deposit Profit', Value: roiData.breakdown.profit.depositProfit },
            { Metric: 'Expense Deduction', Value: -roiData.breakdown.profit.expenseDeduction },
            { Metric: 'Sales Returns Impact', Value: -roiData.breakdown.profit.salesReturnsImpact },
          ]
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'ROI Summary')

          if (monthlyData?.monthly?.length) {
            const monthlyRows = monthlyData.monthly.map((r) => ({
              Month: r.month,
              Investment: r.investment,
              Profit: r.profit,
              'ROI (%)': r.roi,
            }))
            XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(monthlyRows), 'Monthly ROI')
          }

          XLSX.writeFile(wb, `roi-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    const fmt = (v: number) =>
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)

    const isPositiveRoi = (roiData?.roi ?? 0) >= 0
    const isPositiveProfit = (roiData?.profit ?? 0) >= 0

    if (roiLoading || monthlyLoading) {
      return (
        <div className='space-y-4'>
          <Skeleton className='h-[120px] w-full' />
          <div className='grid gap-4 md:grid-cols-3'>
            <Skeleton className='h-[120px]' />
            <Skeleton className='h-[120px]' />
            <Skeleton className='h-[120px]' />
          </div>
          <Skeleton className='h-[320px] w-full' />
          <Skeleton className='h-[320px] w-full' />
        </div>
      )
    }

    const b = roiData?.breakdown
    const monthly = monthlyData?.monthly ?? []

    return (
      <div className='space-y-6'>
        {/* Preset Filter Buttons */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium'>Time Period</CardTitle>
            <CardDescription>Select the period for ROI calculation</CardDescription>
          </CardHeader>
          <CardContent>
            <div className='flex flex-wrap gap-2'>
              {PRESETS.map((p) => (
                <Button
                  key={p.value}
                  variant={preset === p.value ? 'default' : 'outline'}
                  size='sm'
                  onClick={() => setPreset(p.value)}
                >
                  {p.label}
                </Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* KPI Cards */}
        <div className='grid gap-4 md:grid-cols-3'>
          {/* ROI % */}
          <Card className={kpiCardClass(isPositiveRoi ? 'emerald' : 'rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Return on Investment</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass(isPositiveRoi ? 'emerald' : 'rose'))}>
                {isPositiveRoi ? <TrendingUp className='h-4 w-4' /> : <TrendingDown className='h-4 w-4' />}
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-3xl font-bold ${isPositiveRoi ? 'text-green-600' : 'text-red-600'}`}
              >
                {roiData?.roi ?? 0}%
              </div>
              <div className='flex items-center mt-1 gap-1'>
                <Badge variant={isPositiveRoi ? 'default' : 'destructive'} className='text-xs'>
                  {isPositiveRoi ? (
                    <ArrowUpRight className='h-3 w-3 mr-1' />
                  ) : (
                    <ArrowDownRight className='h-3 w-3 mr-1' />
                  )}
                  {isPositiveRoi ? 'Profitable' : 'Loss'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Total Investment */}
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Investment</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <PiggyBank className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(roiData?.investment ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>
                {isMobileShop ? 'Inventory + Wallets + Expenses' : 'Inventory + Expenses'}
              </p>
              <div className='mt-1 space-y-0.5'>
                <p className='text-xs text-purple-600'>📦 Stock: {fmt(roiData?.inventoryValue ?? 0)}</p>
                {isMobileShop && <p className='text-xs text-blue-500'>💳 Wallets: {fmt(roiData?.walletBalance ?? 0)}</p>}
              </div>
            </CardContent>
          </Card>

          {/* Total Profit */}
          <Card className={kpiCardClass(isPositiveProfit ? 'emerald' : 'rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Profit</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass(isPositiveProfit ? 'emerald' : 'rose'))}>
                <DollarSign className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl font-bold ${isPositiveProfit ? 'text-green-600' : 'text-red-600'}`}
              >
                {fmt(roiData?.profit ?? 0)}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>
                Net profit after expenses &amp; returns
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown Cards */}
        <div className='grid gap-4 md:grid-cols-2'>
          {/* Investment Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Investment Breakdown</CardTitle>
              <p className='text-xs text-muted-foreground'>
                Investment = Current Inventory Value{isMobileShop ? ' + Wallet Balance' : ''} + Period Expenses.
                Inventory value is real-time (stock × cost) so it already reflects all purchases, sales, and returns.
                Purchase returns recovery is shown for reference only.
              </p>
            </CardHeader>
            <CardContent className='space-y-3'>
              {[
                { label: 'Current Inventory Value', value: b?.investment.inventoryValue ?? 0, color: 'text-purple-600', mobileOnly: false },
                { label: 'Wallet Balance (JazzCash + EasyPaisa)', value: b?.investment.walletBalance ?? 0, color: 'text-blue-500', mobileOnly: true },
                { label: 'Expenses', value: b?.investment.expenses ?? 0, color: 'text-orange-600', mobileOnly: false },
                { label: 'Purchase Returns Recovery ℹ️', value: b?.investment.purchaseReturnsRecovery ?? 0, color: 'text-green-600', mobileOnly: false },
              ].filter(({ mobileOnly }) => !mobileOnly || isMobileShop).map(({ label, value, color }) => (
                <div key={label} className='flex justify-between items-center border-b pb-2 last:border-0'>
                  <span className='text-sm text-muted-foreground'>{label}</span>
                  <span className={`font-semibold text-sm ${color}`}>{fmt(value)}</span>
                </div>
              ))}
              <div className='flex justify-between items-center pt-1'>
                <span className='font-semibold'>Total Investment</span>
                <span className='font-bold text-blue-700'>{fmt(roiData?.investment ?? 0)}</span>
              </div>
            </CardContent>
          </Card>

          {/* Profit Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Profit Breakdown</CardTitle>
            </CardHeader>
            <CardContent className='space-y-3'>
              {[
                { label: 'Sales Profit', value: b?.profit.salesProfit ?? 0, color: 'text-green-600', mobileOnly: false },
                { label: 'Load Profit', value: b?.profit.loadProfit ?? 0, color: 'text-emerald-600', mobileOnly: true },
                { label: 'Repair Profit', value: b?.profit.repairProfit ?? 0, color: 'text-teal-600', mobileOnly: true },
                { label: 'Service Profit', value: b?.profit.serviceProfit ?? 0, color: 'text-indigo-600', mobileOnly: true },
                { label: 'Sim Sale Profit', value: b?.profit.simSaleProfit ?? 0, color: 'text-sky-600', mobileOnly: true },
                { label: 'Bill Payment Profit', value: b?.profit.billPaymentProfit ?? 0, color: 'text-cyan-600', mobileOnly: true },
                { label: 'Withdrawal Profit', value: b?.profit.withdrawalProfit ?? 0, color: 'text-orange-600', mobileOnly: true },
                { label: 'Deposit Profit', value: b?.profit.depositProfit ?? 0, color: 'text-purple-600', mobileOnly: true },
                { label: 'Expenses (deducted)', value: -(b?.profit.expenseDeduction ?? 0), color: 'text-red-500', mobileOnly: false },
                { label: 'Sales Returns Impact', value: -(b?.profit.salesReturnsImpact ?? 0), color: 'text-rose-500', mobileOnly: false },
              ].filter(({ mobileOnly }) => !mobileOnly || isMobileShop).map(({ label, value, color }) => (
                <div key={label} className='flex justify-between items-center border-b pb-2 last:border-0'>
                  <span className='text-sm text-muted-foreground'>{label}</span>
                  <span className={`font-semibold text-sm ${color}`}>{fmt(value)}</span>
                </div>
              ))}
              <div className='flex justify-between items-center pt-1'>
                <span className='font-semibold'>Net Profit</span>
                <span
                  className={`font-bold ${isPositiveProfit ? 'text-green-700' : 'text-red-700'}`}
                >
                  {fmt(roiData?.profit ?? 0)}
                </span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Monthly Profit vs Investment Chart */}
        {monthly.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Monthly Profit vs Investment</CardTitle>
              <CardDescription>Compare invested capital against net profit each month</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={320}>
                <BarChart data={monthly} margin={{ top: 10, right: 20, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='month' tick={{ fontSize: 12 }} />
                  <YAxis
                    tickFormatter={(v) =>
                      new Intl.NumberFormat('en-PK', {
                        notation: 'compact',
                        maximumFractionDigits: 1,
                      }).format(v)
                    }
                    tick={{ fontSize: 11 }}
                  />
                  <Tooltip
                    formatter={(value: number, name: string) => [fmt(value), name]}
                  />
                  <Legend />
                  <Bar dataKey='investment' name='Investment' fill='#3b82f6' radius={[4, 4, 0, 0]} />
                  <Bar dataKey='profit' name='Profit' fill='#22c55e' radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Monthly ROI % Line Chart */}
        {monthly.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Monthly ROI Trend (%)</CardTitle>
              <CardDescription>Return on investment percentage over time</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width='100%' height={280}>
                <LineChart data={monthly} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray='3 3' />
                  <XAxis dataKey='month' tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(value: number) => [`${value}%`, 'ROI']} />
                  <ReferenceLine y={0} stroke='#ef4444' strokeDasharray='4 4' />
                  <Line
                    type='monotone'
                    dataKey='roi'
                    name='ROI %'
                    stroke='#8b5cf6'
                    strokeWidth={2}
                    dot={{ r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {monthly.length === 0 && (
          <Card>
            <CardContent className='flex items-center justify-center h-40 text-muted-foreground'>
              No monthly data available for the selected period.
            </CardContent>
          </Card>
        )}
      </div>
    )
  }
)

RoiReport.displayName = 'RoiReport'

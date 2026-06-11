import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useGetProfitLossFullReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { TrendingUp, TrendingDown, PiggyBank, Percent } from 'lucide-react'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { format, subDays, subMonths } from 'date-fns'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { normalizeBusinessType } from '@/lib/business-types'
import { cn } from '@/lib/utils'
import { kpiCardClass, toneIconWrapClass } from '@/lib/stat-card-tones'
import { ReportBreakdownRow } from './report-breakdown-row'
import {
  reportKpiGridClass,
  reportKpiLabelClass,
  reportKpiSubClass,
  reportKpiValueClass,
  reportSectionTitleClass,
} from '../utils/report-styles'

interface ProfitLossReportProps {
  startDate: string
  endDate: string
}

type Preset = '7d' | '30d' | '6m' | '1y' | 'custom'

const PRESETS: { label: string; value: Preset }[] = [
  { label: '7 Days', value: '7d' },
  { label: '30 Days', value: '30d' },
  { label: '6 Months', value: '6m' },
  { label: '1 Year', value: '1y' },
]

function getPresetDates(preset: Preset, startDate: string, endDate: string): { from: string; to: string } {
  if (preset === 'custom') return { from: startDate, to: endDate }
  const now = new Date()
  const to = format(now, 'yyyy-MM-dd')
  switch (preset) {
    case '7d':  return { from: format(subDays(now, 7), 'yyyy-MM-dd'), to }
    case '30d': return { from: format(subDays(now, 30), 'yyyy-MM-dd'), to }
    case '6m':  return { from: format(subMonths(now, 6), 'yyyy-MM-dd'), to }
    case '1y':
    default:    return { from: format(subMonths(now, 12), 'yyyy-MM-dd'), to }
  }
}

export const ProfitLossReport = forwardRef<{ exportToExcel: () => void }, ProfitLossReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const [preset, setPreset] = useState<Preset>('custom')

    const user = useSelector((state: RootState) => state.auth.data?.user)
    const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
    const isMobileShop = normalizeBusinessType(org?.businessType || user?.businessType) === 'mobile_shop'

    const dates = useMemo(
      () => getPresetDates(preset, startDate, endDate),
      [preset, startDate, endDate]
    )

    const { data, isLoading } = useGetProfitLossFullReportQuery(dates)

    const fmt = (v: number) =>
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(v)

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          if (!data) { toast.error(t('No data available to export')); return }
          const rows = [
            { Section: 'Revenue', Category: t('total_revenue'), Amount: data.revenue.totalRevenue },
            { Section: '', Category: `Sales Returns (${data.revenue.salesReturnsCount})`, Amount: -data.revenue.salesReturns },
            { Section: '', Category: 'Net Revenue', Amount: data.revenue.netRevenue },
            { Section: '', Category: t('cost_of_goods_sold'), Amount: -data.revenue.costOfGoodsSold },
            { Section: '', Category: t('gross_profit'), Amount: data.revenue.grossProfit },
            { Section: 'Additional Profits', Category: 'Load Profit', Amount: data.additionalProfits.loadProfit },
            { Section: '', Category: 'Repair Profit', Amount: data.additionalProfits.repairProfit },
            { Section: '', Category: 'Service Profit', Amount: data.additionalProfits.serviceProfit },
            { Section: '', Category: 'Sim Sale Profit', Amount: data.additionalProfits.simSaleProfit },
            { Section: '', Category: 'Bill Payment Profit', Amount: data.additionalProfits.billProfit },
            { Section: '', Category: 'Bill Late Payment Loss', Amount: -(data.adjustments?.billLatePaymentLoss ?? 0) },
            { Section: '', Category: 'Net Bill Payment Profit', Amount: data.additionalProfits.billNetProfit ?? data.additionalProfits.billProfit },
            { Section: '', Category: 'Received Profit', Amount: data.additionalProfits.withdrawalProfit },
            { Section: '', Category: 'Send Profit', Amount: data.additionalProfits.depositProfit },
            {
              Section: '',
              Category: 'Total Additional',
              Amount:
                data.additionalProfits.loadProfit +
                data.additionalProfits.repairProfit +
                data.additionalProfits.serviceProfit +
                data.additionalProfits.simSaleProfit +
                (data.additionalProfits.billNetProfit ?? data.additionalProfits.billProfit) +
                data.additionalProfits.withdrawalProfit +
                data.additionalProfits.depositProfit,
            },
            { Section: '', Category: t('total_profit'), Amount: data.revenue.grossProfit + (
              data.additionalProfits.loadProfit +
              data.additionalProfits.repairProfit +
              data.additionalProfits.serviceProfit +
              data.additionalProfits.simSaleProfit +
              (data.additionalProfits.billNetProfit ?? data.additionalProfits.billProfit) +
              data.additionalProfits.withdrawalProfit +
              data.additionalProfits.depositProfit
            ) },
            { Section: 'Expenses', Category: t('total_expenses'), Amount: -data.expenses },
            { Section: 'Summary', Category: t('net_profit'), Amount: data.netProfit },
            { Section: '', Category: 'Net Profit Margin', Amount: `${data.netProfitMargin}%` },
            { Section: '', Category: 'ROI', Amount: `${data.roi}%` },
            { Section: 'Investment', Category: 'Total Investment', Amount: data.investment },
            { Section: '', Category: 'Inventory Value (stock × cost)', Amount: data.inventoryValue },
            { Section: '', Category: 'Wallet Balance', Amount: data.walletBalance },
          ]
          const ws = XLSX.utils.json_to_sheet(rows)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, 'P&L Full')
          XLSX.writeFile(wb, `profit-loss-full-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch {
          toast.error(t('Failed to export data'))
        }
      },
    }))

    if (isLoading) return <Skeleton className='h-[600px] w-full' />

    const isProfit       = (data?.netProfit ?? 0) >= 0
    const isPositiveRoi  = (data?.roi ?? 0) >= 0
    const rev            = data?.revenue
    const add            = data?.additionalProfits
    const adj            = data?.adjustments
    const totalAdditional =
      (add?.loadProfit ?? 0) +
      (add?.repairProfit ?? 0) +
      (add?.serviceProfit ?? 0) +
      (add?.simSaleProfit ?? 0) +
      (add?.billNetProfit ?? add?.billProfit ?? 0) +
      (add?.withdrawalProfit ?? 0) +
      (add?.depositProfit ?? 0)
    const totalProfit = (rev?.grossProfit ?? 0) + totalAdditional

    return (
      <div className='space-y-6'>
        {/* Preset filter */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className={reportKpiLabelClass}>Time Period</CardTitle>
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
              <Button
                variant={preset === 'custom' ? 'default' : 'outline'}
                size='sm'
                onClick={() => setPreset('custom')}
              >
                Custom (date range above)
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Top KPI row */}
        <div className={reportKpiGridClass}>
          <Card className={kpiCardClass(isProfit ? 'emerald' : 'rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>Net Profit / Loss</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass(isProfit ? 'emerald' : 'rose'))}>
                {isProfit ? <TrendingUp className='h-4 w-4' /> : <TrendingDown className='h-4 w-4' />}
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(data?.netProfit ?? 0)}
              </div>
              <p className={reportKpiSubClass}>Margin: {data?.netProfitMargin ?? 0}%</p>
            </CardContent>
          </Card>
          <Card className={kpiCardClass('indigo')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>Total Investment</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('indigo'))}>
                <PiggyBank className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} text-blue-600`}>{fmt(data?.investment ?? 0)}</div>
              <p className={reportKpiSubClass}>Inventory + Wallets + Expenses</p>
              <div className='mt-2 space-y-1'>
                {(data?.inventoryValue ?? 0) > 0 && (
                  <p className='text-sm text-purple-600'>📦 Stock: {fmt(data?.inventoryValue ?? 0)}</p>
                )}
                {(data?.walletBalance ?? 0) > 0 && (
                  <p className='text-sm text-blue-500'>💳 Wallets: {fmt(data?.walletBalance ?? 0)}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className={kpiCardClass(isPositiveRoi ? 'emerald' : 'rose')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>ROI</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass(isPositiveRoi ? 'emerald' : 'rose'))}>
                <Percent className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} ${isPositiveRoi ? 'text-green-600' : 'text-red-600'}`}>
                {data?.roi ?? 0}%
              </div>
              <Badge variant={isPositiveRoi ? 'default' : 'destructive'} className='mt-2 text-sm'>
                {isPositiveRoi ? 'Return on Investment' : 'Loss on Investment'}
              </Badge>
            </CardContent>
          </Card>

          <Card className={kpiCardClass('slate')}>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className={reportKpiLabelClass}>Total Expenses</CardTitle>
              <div className={cn('shrink-0', toneIconWrapClass('slate'))}>
                <TrendingDown className='h-4 w-4' />
              </div>
            </CardHeader>
            <CardContent>
              <div className={`${reportKpiValueClass} text-rose-600`}>
                {fmt(data?.expenses ?? 0)}
              </div>
              <p className={reportKpiSubClass}>
                Total expenses for selected period
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Revenue section */}
        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>{t('revenue_section')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <ReportBreakdownRow label={t('total_revenue')} value={fmt(rev?.totalRevenue ?? 0)} bold />
            {(rev?.salesReturns ?? 0) > 0 && (
              <ReportBreakdownRow
                label={`↩ Sales Returns (${rev?.salesReturnsCount ?? 0})`}
                value={`− ${fmt(rev?.salesReturns ?? 0)}`}
                valueClass='text-red-600'
              />
            )}
            {(rev?.salesReturns ?? 0) > 0 && (
              <ReportBreakdownRow label='Net Revenue' value={fmt(rev?.netRevenue ?? 0)} border />
            )}
            <ReportBreakdownRow
              label={t('cost_of_goods_sold')}
              value={`− ${fmt(rev?.costOfGoodsSold ?? 0)}`}
              valueClass='text-orange-600'
            />
            <ReportBreakdownRow
              label={t('gross_profit')}
              value={fmt(rev?.grossProfit ?? 0)}
              valueClass='text-green-600'
              bold
              border
              sub={`Gross Margin: ${rev?.grossProfitMargin ?? 0}%`}
            />
          </CardContent>
        </Card>

        {/* Additional profits */}
        {(isMobileShop || totalAdditional > 0) && (
        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>Additional Profits</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {isMobileShop && <ReportBreakdownRow label='Load Profit' value={fmt(add?.loadProfit ?? 0)} valueClass='text-emerald-600' />}
            {isMobileShop && <ReportBreakdownRow label='Repair Profit' value={fmt(add?.repairProfit ?? 0)} valueClass='text-teal-600' />}
            {isMobileShop && <ReportBreakdownRow label='Service Profit' value={fmt(add?.serviceProfit ?? 0)} valueClass='text-indigo-600' />}
            {isMobileShop && <ReportBreakdownRow label='Sim Sale Profit' value={fmt(add?.simSaleProfit ?? 0)} valueClass='text-sky-600' />}
            {isMobileShop && <ReportBreakdownRow label='Bill Payment Profit' value={fmt(add?.billProfit ?? 0)} valueClass='text-cyan-600' />}
            {isMobileShop && (adj?.billLatePaymentLoss ?? 0) > 0 && (
              <ReportBreakdownRow label='Bill Late Payment Loss' value={`− ${fmt(adj?.billLatePaymentLoss ?? 0)}`} valueClass='text-red-600' />
            )}
            {isMobileShop && (add?.billNetProfit != null) && (
              <ReportBreakdownRow label='Net Bill Payment Profit' value={fmt(add?.billNetProfit ?? 0)} valueClass='text-cyan-700' border />
            )}
            {isMobileShop && <ReportBreakdownRow label='Received Profit' value={fmt(add?.withdrawalProfit ?? 0)} valueClass='text-orange-600' />}
            {isMobileShop && <ReportBreakdownRow label='Send Profit' value={fmt(add?.depositProfit ?? 0)} valueClass='text-purple-600' />}
            <ReportBreakdownRow
              label='Total Additional'
              value={fmt(totalAdditional)}
              bold
              border
            />
            <ReportBreakdownRow
              label={t('total_profit')}
              value={fmt(totalProfit)}
              valueClass='text-green-600'
              bold
              border
            />
          </CardContent>
        </Card>
        )}

        {/* Expenses & adjustments */}
        <Card>
          <CardHeader>
            <CardTitle className={reportSectionTitleClass}>{t('expenses_section')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <ReportBreakdownRow
              label={t('total_expenses')}
              value={`− ${fmt(data?.expenses ?? 0)}`}
              valueClass='text-red-600'
              bold
            />
          </CardContent>
        </Card>

        {/* Net profit summary */}
        <Card className={isProfit ? 'border-green-500 border-2' : 'border-red-500 border-2'}>
          <CardHeader>
            <CardTitle className={cn('flex items-center gap-2', reportSectionTitleClass)}>
              {isProfit ? (
                <TrendingUp className='h-6 w-6 text-green-500' />
              ) : (
                <TrendingDown className='h-6 w-6 text-red-500' />
              )}
              Net Profit / Loss
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-5'>
            <div className='flex items-baseline gap-4'>
              <span className='text-xl font-bold text-muted-foreground sm:text-2xl'>{t('net_profit')}</span>
              <span className='min-w-8 flex-1 border-b border-dotted border-muted-foreground/35' aria-hidden='true' />
              <span className={`text-4xl font-bold tabular-nums sm:text-5xl ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(data?.netProfit ?? 0)}
              </span>
            </div>
            <div className='grid grid-cols-2 gap-6 pt-4 border-t'>
              <div>
                <p className='text-sm text-muted-foreground sm:text-base'>Net Profit Margin</p>
                <p className={`text-xl font-semibold sm:text-2xl ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {data?.netProfitMargin ?? 0}%
                </p>
              </div>
              <div>
                <p className='text-sm text-muted-foreground sm:text-base'>ROI</p>
                <p className={`text-xl font-semibold sm:text-2xl ${isPositiveRoi ? 'text-green-600' : 'text-red-600'}`}>
                  {data?.roi ?? 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
)

ProfitLossReport.displayName = 'ProfitLossReport'

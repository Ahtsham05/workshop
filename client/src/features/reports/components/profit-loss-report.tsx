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
  const to = now.toISOString()
  switch (preset) {
    case '7d':  return { from: subDays(now, 7).toISOString(), to }
    case '30d': return { from: subDays(now, 30).toISOString(), to }
    case '6m':  return { from: subMonths(now, 6).toISOString(), to }
    case '1y':
    default:    return { from: subMonths(now, 12).toISOString(), to }
  }
}

export const ProfitLossReport = forwardRef<{ exportToExcel: () => void }, ProfitLossReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t } = useLanguage()
    const [preset, setPreset] = useState<Preset>('custom')

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
            { Section: '', Category: 'Bill Payment Profit', Amount: data.additionalProfits.billProfit },
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

    return (
      <div className='space-y-6'>
        {/* Preset filter */}
        <Card>
          <CardHeader className='pb-3'>
            <CardTitle className='text-sm font-medium'>Time Period</CardTitle>
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
        <div className='grid gap-4 md:grid-cols-3'>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Net Profit / Loss</CardTitle>
              {isProfit ? <TrendingUp className='h-4 w-4 text-green-500' /> : <TrendingDown className='h-4 w-4 text-red-500' />}
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(data?.netProfit ?? 0)}
              </div>
              <p className='text-xs text-muted-foreground mt-1'>Margin: {data?.netProfitMargin ?? 0}%</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>Total Investment</CardTitle>
              <PiggyBank className='h-4 w-4 text-blue-500' />
            </CardHeader>
            <CardContent>
              <div className='text-2xl font-bold text-blue-600'>{fmt(data?.investment ?? 0)}</div>
              <p className='text-xs text-muted-foreground mt-1'>Inventory + Wallets + Expenses</p>
              <div className='mt-1 space-y-0.5'>
                {(data?.inventoryValue ?? 0) > 0 && (
                  <p className='text-xs text-purple-600'>📦 Stock: {fmt(data?.inventoryValue ?? 0)}</p>
                )}
                {(data?.walletBalance ?? 0) > 0 && (
                  <p className='text-xs text-blue-500'>💳 Wallets: {fmt(data?.walletBalance ?? 0)}</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className='flex flex-row items-center justify-between space-y-0 pb-2'>
              <CardTitle className='text-sm font-medium'>ROI</CardTitle>
              <Percent className={`h-4 w-4 ${isPositiveRoi ? 'text-green-500' : 'text-red-500'}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${isPositiveRoi ? 'text-green-600' : 'text-red-600'}`}>
                {data?.roi ?? 0}%
              </div>
              <Badge variant={isPositiveRoi ? 'default' : 'destructive'} className='mt-1 text-xs'>
                {isPositiveRoi ? 'Return on Investment' : 'Loss on Investment'}
              </Badge>
            </CardContent>
          </Card>
        </div>

        {/* Revenue section */}
        <Card>
          <CardHeader>
            <CardTitle>{t('revenue_section')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Row label={t('total_revenue')} value={fmt(rev?.totalRevenue ?? 0)} bold />
            {(rev?.salesReturns ?? 0) > 0 && (
              <Row
                label={`↩ Sales Returns (${rev?.salesReturnsCount ?? 0})`}
                value={`− ${fmt(rev?.salesReturns ?? 0)}`}
                valueClass='text-red-600'
              />
            )}
            {(rev?.salesReturns ?? 0) > 0 && (
              <Row label='Net Revenue' value={fmt(rev?.netRevenue ?? 0)} border />
            )}
            <Row
              label={t('cost_of_goods_sold')}
              value={`− ${fmt(rev?.costOfGoodsSold ?? 0)}`}
              valueClass='text-orange-600'
            />
            <Row
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
        <Card>
          <CardHeader>
            <CardTitle>Additional Profits</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Row label='Load Profit' value={fmt(add?.loadProfit ?? 0)} valueClass='text-emerald-600' />
            <Row label='Repair Profit' value={fmt(add?.repairProfit ?? 0)} valueClass='text-teal-600' />
            <Row label='Bill Payment Profit' value={fmt(add?.billProfit ?? 0)} valueClass='text-cyan-600' />
            <Row
              label='Total Additional'
              value={fmt((add?.loadProfit ?? 0) + (add?.repairProfit ?? 0) + (add?.billProfit ?? 0))}
              bold
              border
            />
          </CardContent>
        </Card>

        {/* Expenses & adjustments */}
        <Card>
          <CardHeader>
            <CardTitle>{t('expenses_section')}</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            <Row
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
            <CardTitle className='flex items-center gap-2'>
              {isProfit ? (
                <TrendingUp className='h-5 w-5 text-green-500' />
              ) : (
                <TrendingDown className='h-5 w-5 text-red-500' />
              )}
              Net Profit / Loss
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='flex justify-between items-baseline'>
              <span className='text-xl font-bold text-muted-foreground'>{t('net_profit')}</span>
              <span className={`text-4xl font-bold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(data?.netProfit ?? 0)}
              </span>
            </div>
            <div className='grid grid-cols-2 gap-4 pt-2 border-t'>
              <div>
                <p className='text-xs text-muted-foreground'>Net Profit Margin</p>
                <p className={`text-lg font-semibold ${isProfit ? 'text-green-600' : 'text-red-600'}`}>
                  {data?.netProfitMargin ?? 0}%
                </p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>ROI</p>
                <p className={`text-lg font-semibold ${isPositiveRoi ? 'text-green-600' : 'text-red-600'}`}>
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

/* Small helper row component */
function Row({
  label,
  value,
  valueClass = '',
  bold = false,
  border = false,
  sub,
}: {
  label: string
  value: string
  valueClass?: string
  bold?: boolean
  border?: boolean
  sub?: string
}) {
  return (
    <div className={border ? 'border-t pt-3' : ''}>
      <div className='flex justify-between items-center'>
        <span className={`${bold ? 'font-semibold text-base' : 'text-sm text-muted-foreground'}`}>{label}</span>
        <span className={`font-semibold ${bold ? 'text-lg' : 'text-sm'} ${valueClass}`}>{value}</span>
      </div>
      {sub && <p className='text-xs text-muted-foreground text-right mt-0.5'>{sub}</p>}
    </div>
  )
}

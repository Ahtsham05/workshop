import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { format, isValid } from 'date-fns'
import { useGetRevenueDataQuery } from '@/stores/dashboard.api'
import { buildDashboardDateRange, dashboardRangeQueryParams, type DashboardDatePreset } from '@/lib/dashboard-date-range'
import { formatMoney } from '../../lib/format'

function isPreset(value: unknown): value is DashboardDatePreset {
  return value === 'today' || value === 'week' || value === 'month' || value === 'custom'
}

/**
 * Trend line for the profit summary card. Reuses the dashboard's own revenue-trend endpoint,
 * scoped to the exact same {period, startDate, endDate} the AI's get_profit_summary tool call
 * used (both ultimately resolve through the shared dashboardDateRange util server-side), so the
 * chart never disagrees with the numbers already shown above it.
 */
export function ProfitTrendChart({ args }: { args: Record<string, unknown> }) {
  const period = isPreset(args.period) ? args.period : 'month'
  const range = buildDashboardDateRange(period, {
    startDate: typeof args.startDate === 'string' ? args.startDate : undefined,
    endDate: typeof args.endDate === 'string' ? args.endDate : undefined,
  })
  const { data, isLoading } = useGetRevenueDataQuery(dashboardRangeQueryParams(range))

  if (isLoading || !data || data.length < 2) return null

  return (
    <div>
      <p className='mb-1.5 text-xs font-medium text-muted-foreground'>Profit trend</p>
      <ResponsiveContainer width='100%' height={72}>
        <LineChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
          <XAxis dataKey='date' hide />
          <Tooltip
            formatter={(value: number) => formatMoney(value)}
            labelFormatter={(label: string) => {
              const date = new Date(label)
              return isValid(date) ? format(date, 'MMM d') : label
            }}
            contentStyle={{ borderRadius: 8, border: '1px solid var(--border)', fontSize: 12 }}
          />
          <Line type='monotone' dataKey='profit' stroke='#8b5cf6' strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

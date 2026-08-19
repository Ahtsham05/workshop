import { DollarSign } from 'lucide-react'
import { BusinessStatCard } from './stat-card'
import { ProfitTrendChart } from './profit-trend-chart'
import { formatMoney } from '../../lib/format'
import type { AiToolCall } from '@/stores/aiAssistant.api'

interface ProfitSummaryResult {
  revenue: number
  profit: number
  salesCount: number
  profitChangePercent: number | null
}

export function ProfitSummaryCard({ toolCall }: { toolCall: AiToolCall }) {
  const result = toolCall.result as ProfitSummaryResult
  const margin = result.revenue > 0 ? `${((result.profit / result.revenue) * 100).toFixed(1)}%` : '—'

  return (
    <BusinessStatCard
      icon={<DollarSign className='h-3.5 w-3.5' />}
      title='Total Profit'
      value={formatMoney(result.profit)}
      changePercent={result.profitChangePercent}
      changeLabel='vs last period'
      stats={[
        { label: 'Sales', value: formatMoney(result.revenue) },
        { label: 'Orders', value: result.salesCount.toLocaleString() },
        { label: 'Margin', value: margin },
      ]}
      chart={<ProfitTrendChart args={toolCall.args} />}
    />
  )
}

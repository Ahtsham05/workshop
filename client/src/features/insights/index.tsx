import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, Package, DollarSign, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import {
  useGetTodayInsightsQuery,
  useGetAlertInsightsQuery,
  useGetSalesInsightsQuery,
  useGetInventoryInsightsQuery,
  useGetProfitInsightsQuery,
  useGetCustomerInsightsQuery,
  useRunInsightsNowMutation,
  type Insight,
  type InsightPriority,
} from '@/stores/insight.api'
import { InsightCard } from './components/insight-card'
import { GroupedInsightCard } from './components/grouped-insight-card'
import { groupInsights } from './utils/insight-display'

type TabKey = 'today' | 'alert' | 'sales' | 'inventory' | 'profit' | 'customer'

const TABS: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'today', label: 'Today', icon: Sparkles },
  { key: 'alert', label: 'Alerts', icon: AlertTriangle },
  { key: 'sales', label: 'Sales', icon: TrendingUp },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'profit', label: 'Profit', icon: DollarSign },
  { key: 'customer', label: 'Customers', icon: Users },
]

const PRIORITY_FILTERS: { key: InsightPriority | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'high', label: 'High' },
  { key: 'medium', label: 'Medium' },
  { key: 'low', label: 'Low' },
]

function EmptyState({ onRefresh, isRefreshing }: { onRefresh: () => void; isRefreshing: boolean }) {
  return (
    <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center'>
      <Sparkles className='h-10 w-10 text-muted-foreground/40' />
      <div>
        <p className='font-medium'>All clear here</p>
        <p className='text-sm text-muted-foreground'>
          No insights in this view right now. They refresh automatically every day.
        </p>
      </div>
      <Button size='sm' variant='outline' onClick={onRefresh} disabled={isRefreshing}>
        <RefreshCw className={cn('mr-2 h-4 w-4', isRefreshing && 'animate-spin')} />
        Generate insights now
      </Button>
    </div>
  )
}

function CardGridSkeleton() {
  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className='h-40 w-full rounded-xl' />
      ))}
    </div>
  )
}

const SUMMARY_TILES: {
  key: 'total' | 'high' | 'medium' | 'low'
  label: string
  icon: typeof Sparkles
  gradient: string
  iconWrap: string
}[] = [
  {
    key: 'total',
    label: 'Insights today',
    icon: Sparkles,
    gradient: 'from-slate-500/10 to-slate-500/0',
    iconWrap: 'bg-slate-500/15 text-slate-600 dark:text-slate-300',
  },
  {
    key: 'high',
    label: 'Need attention now',
    icon: AlertTriangle,
    gradient: 'from-red-500/10 to-red-500/0',
    iconWrap: 'bg-red-500/15 text-red-600 dark:text-red-400',
  },
  {
    key: 'medium',
    label: 'Worth a look',
    icon: TrendingUp,
    gradient: 'from-amber-500/10 to-amber-500/0',
    iconWrap: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  {
    key: 'low',
    label: 'For your information',
    icon: Package,
    gradient: 'from-blue-500/10 to-blue-500/0',
    iconWrap: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  },
]

function SummaryStat({ tile, value }: { tile: (typeof SUMMARY_TILES)[number]; value: number }) {
  const Icon = tile.icon
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4', tile.gradient)}>
      <div className='flex items-center gap-3'>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', tile.iconWrap)}>
          <Icon className='h-5 w-5' />
        </span>
        <div>
          <p className='text-2xl font-bold tabular-nums leading-none'>{value}</p>
          <p className='mt-1 text-xs text-muted-foreground'>{tile.label}</p>
        </div>
      </div>
    </div>
  )
}

function InsightGrid({
  insights,
  isLoading,
  priorityFilter,
  onRefresh,
  isRefreshing,
}: {
  insights: Insight[] | undefined
  isLoading: boolean
  priorityFilter: InsightPriority | 'all'
  onRefresh: () => void
  isRefreshing: boolean
}) {
  const displayItems = useMemo(() => {
    const list = insights || []
    const filtered = priorityFilter === 'all' ? list : list.filter((i) => i.priority === priorityFilter)
    return groupInsights(filtered)
  }, [insights, priorityFilter])

  if (isLoading) return <CardGridSkeleton />
  if (displayItems.length === 0) return <EmptyState onRefresh={onRefresh} isRefreshing={isRefreshing} />

  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {displayItems.map((item) =>
        item.kind === 'group' ? (
          <GroupedInsightCard key={item.key} group={item} />
        ) : (
          <InsightCard key={item.key} insight={item.insight} />
        ),
      )}
    </div>
  )
}

export default function InsightsPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('today')
  const [priorityFilter, setPriorityFilter] = useState<InsightPriority | 'all'>('all')

  const today = useGetTodayInsightsQuery()
  const alerts = useGetAlertInsightsQuery()
  const sales = useGetSalesInsightsQuery()
  const inventory = useGetInventoryInsightsQuery()
  const profit = useGetProfitInsightsQuery()
  const customers = useGetCustomerInsightsQuery()

  const [runInsightsNow, { isLoading: isRunning }] = useRunInsightsNowMutation()

  const handleRefresh = async () => {
    try {
      const result = await runInsightsNow().unwrap()
      toast.success(`Generated ${result.generated} insight(s) for today`)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to generate insights')
    }
  }

  const todayData = today.data || []
  const summary = useMemo(
    () => ({
      total: todayData.length,
      high: todayData.filter((i) => i.priority === 'high').length,
      medium: todayData.filter((i) => i.priority === 'medium').length,
      low: todayData.filter((i) => i.priority === 'low').length,
    }),
    [todayData],
  )

  const tabData: Record<TabKey, { data: Insight[] | undefined; isLoading: boolean }> = {
    today: { data: today.data, isLoading: today.isLoading },
    alert: { data: alerts.data, isLoading: alerts.isLoading },
    sales: { data: sales.data, isLoading: sales.isLoading },
    inventory: { data: inventory.data, isLoading: inventory.isLoading },
    profit: { data: profit.data, isLoading: profit.isLoading },
    customer: { data: customers.data, isLoading: customers.isLoading },
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
            <Sparkles className='h-6 w-6 text-primary' />
            AI Sales Insights
          </h1>
          <p className='text-sm text-muted-foreground'>
            Smart, rule-based business insights — generated daily from your sales, stock, and customer data.
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRunning} className='shrink-0'>
          <RefreshCw className={cn('mr-2 h-4 w-4', isRunning && 'animate-spin')} />
          {isRunning ? 'Generating…' : 'Refresh insights'}
        </Button>
      </div>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
        {SUMMARY_TILES.map((tile) => (
          <SummaryStat key={tile.key} tile={tile} value={summary[tile.key]} />
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <TabsList className='flex-wrap'>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className='gap-1.5'>
                <tab.icon className='h-3.5 w-3.5' />
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className='flex items-center gap-1.5'>
            {PRIORITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type='button'
                onClick={() => setPriorityFilter(f.key)}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  priorityFilter === f.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {TABS.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className='mt-4'>
            <InsightGrid
              insights={tabData[tab.key].data}
              isLoading={tabData[tab.key].isLoading}
              priorityFilter={priorityFilter}
              onRefresh={handleRefresh}
              isRefreshing={isRunning}
            />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}

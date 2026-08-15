import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Sparkles, RefreshCw, AlertTriangle, TrendingUp, Package, DollarSign, Users, Building2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import { lastNDaysRange } from '@/lib/dashboard-date-range'
import { RevenueChart } from '@/features/dashboard/components/revenue-chart'
import {
  useGetTodayInsightsQuery,
  useGetAlertInsightsQuery,
  useGetSalesInsightsQuery,
  useGetInventoryInsightsQuery,
  useGetProfitInsightsQuery,
  useGetCustomerInsightsQuery,
  useGetBranchInsightsQuery,
  useRunInsightsNowMutation,
  type Insight,
  type InsightPriority,
} from '@/stores/insight.api'
import { InsightCard } from './components/insight-card'
import { GroupedInsightCard } from './components/grouped-insight-card'
import { groupInsights, PRIORITY_THEME } from './utils/insight-display'

type TabKey = 'today' | 'alert' | 'sales' | 'inventory' | 'profit' | 'customer' | 'branches'

const TABS: { key: TabKey; label: string; icon: typeof Sparkles }[] = [
  { key: 'today', label: 'Today', icon: Sparkles },
  { key: 'alert', label: 'Alerts', icon: AlertTriangle },
  { key: 'sales', label: 'Sales', icon: TrendingUp },
  { key: 'inventory', label: 'Inventory', icon: Package },
  { key: 'profit', label: 'Profit', icon: DollarSign },
  { key: 'customer', label: 'Customers', icon: Users },
  { key: 'branches', label: 'Branches', icon: Building2 },
]

const TREND_RANGE = lastNDaysRange(30)

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

/** Segmented bar so the High/Medium/Low split reads in one glance instead of four disconnected numbers. */
function PriorityMixBar({ summary }: { summary: { total: number; high: number; medium: number; low: number } }) {
  const { total, high, medium, low } = summary
  const pct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
  if (total === 0) return null
  return (
    <div className='rounded-xl border bg-card p-4 shadow-sm'>
      <p className='mb-2.5 text-xs font-semibold text-muted-foreground'>
        Priority mix — {total} insight{total === 1 ? '' : 's'} today
      </p>
      <div className='flex h-2.5 w-full gap-0.5 overflow-hidden rounded-full bg-muted'>
        {high > 0 && <span className='h-full rounded-full bg-red-500' style={{ width: `${pct(high)}%` }} />}
        {medium > 0 && <span className='h-full rounded-full bg-amber-500' style={{ width: `${pct(medium)}%` }} />}
        {low > 0 && <span className='h-full rounded-full bg-blue-500' style={{ width: `${pct(low)}%` }} />}
      </div>
      <div className='mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground'>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-sm bg-red-500' />
          High — <b className='font-semibold text-foreground'>{high}</b>
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-sm bg-amber-500' />
          Medium — <b className='font-semibold text-foreground'>{medium}</b>
        </span>
        <span className='flex items-center gap-1.5'>
          <span className='h-2 w-2 rounded-sm bg-blue-500' />
          Low — <b className='font-semibold text-foreground'>{low}</b>
        </span>
      </div>
    </div>
  )
}

type CategoryStat = { count: number; dominant: InsightPriority | null }

/** Category tabs rendered as a horizontal bar chart — bar length is volume, color is urgency,
 * so the nav itself shows where to look before a single card is opened. */
function CategoryNav({
  tabs,
  activeTab,
  onSelect,
  stats,
}: {
  tabs: typeof TABS
  activeTab: TabKey
  onSelect: (key: TabKey) => void
  stats: Record<TabKey, CategoryStat>
}) {
  const maxCount = Math.max(1, ...tabs.filter((t) => t.key !== 'today').map((t) => stats[t.key]?.count ?? 0))
  return (
    <div className='rounded-xl border bg-card p-3 shadow-sm'>
      <p className='mb-2 px-1 text-xs font-semibold text-muted-foreground'>Where the issues are</p>
      <div className='space-y-1'>
        {tabs.map((tab) => {
          const stat = stats[tab.key] ?? { count: 0, dominant: null }
          const pct = tab.key === 'today' ? 100 : maxCount > 0 ? Math.max(4, (stat.count / maxCount) * 100) : 0
          const barColor =
            tab.key === 'today' ? 'bg-foreground/60' : stat.dominant ? PRIORITY_THEME[stat.dominant].dot : 'bg-muted-foreground/25'
          const active = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type='button'
              onClick={() => onSelect(tab.key)}
              aria-current={active}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                active ? 'bg-accent' : 'hover:bg-muted',
              )}
            >
              <span className='flex w-[92px] shrink-0 items-center gap-1.5 text-xs font-semibold'>
                <tab.icon className='h-3.5 w-3.5 text-muted-foreground' />
                {tab.label}
              </span>
              <span className='h-2 flex-1 overflow-hidden rounded-full bg-muted'>
                <span className={cn('block h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
              </span>
              <span className='w-6 shrink-0 text-right text-xs font-bold tabular-nums'>{stat.count}</span>
            </button>
          )
        })}
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

const dominantPriority = (items: Insight[]): InsightPriority | null => {
  if (items.some((i) => i.priority === 'high')) return 'high'
  if (items.some((i) => i.priority === 'medium')) return 'medium'
  if (items.length > 0) return 'low'
  return null
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
  const branchList = useGetMyBranchesQuery()
  const hasMultipleBranches = (branchList.data?.length ?? 0) > 1
  const branchInsights = useGetBranchInsightsQuery(undefined, { skip: !hasMultipleBranches })

  const [runInsightsNow, { isLoading: isRunning }] = useRunInsightsNowMutation()

  const handleRefresh = async () => {
    try {
      const result = await runInsightsNow().unwrap()
      toast.success(`Generated ${result.generated} insight(s) for today`)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to generate insights')
    }
  }

  const todayData = useMemo(() => today.data || [], [today.data])
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
    branches: { data: branchInsights.data, isLoading: branchInsights.isLoading },
  }

  const visibleTabs = TABS.filter((tab) => tab.key !== 'branches' || hasMultipleBranches)

  const categoryStats = useMemo<Record<TabKey, CategoryStat>>(() => {
    const byTab: Record<Exclude<TabKey, 'today' | 'branches'>, Insight[]> = {
      alert: [],
      sales: [],
      inventory: [],
      profit: [],
      customer: [],
    }
    for (const insight of todayData) {
      if (insight.category === 'inventory' || insight.category === 'supply_chain') byTab.inventory.push(insight)
      else if (insight.category === 'alert' || insight.category === 'sales' || insight.category === 'profit' || insight.category === 'customer') {
        byTab[insight.category].push(insight)
      }
    }
    const branchItems = branchInsights.data || []
    return {
      today: { count: todayData.length, dominant: dominantPriority(todayData) },
      alert: { count: byTab.alert.length, dominant: dominantPriority(byTab.alert) },
      sales: { count: byTab.sales.length, dominant: dominantPriority(byTab.sales) },
      inventory: { count: byTab.inventory.length, dominant: dominantPriority(byTab.inventory) },
      profit: { count: byTab.profit.length, dominant: dominantPriority(byTab.profit) },
      customer: { count: byTab.customer.length, dominant: dominantPriority(byTab.customer) },
      branches: { count: branchItems.length, dominant: dominantPriority(branchItems) },
    }
  }, [todayData, branchInsights.data])

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

      <PriorityMixBar summary={summary} />

      <div className='grid grid-cols-1 gap-3 lg:grid-cols-[1.7fr_1fr]'>
        <CategoryNav tabs={visibleTabs} activeTab={activeTab} onSelect={setActiveTab} stats={categoryStats} />
        <div className='rounded-xl border bg-card p-4 shadow-sm'>
          <p className='mb-2.5 text-xs font-semibold text-muted-foreground'>Priority</p>
          <div className='flex flex-wrap gap-1.5'>
            {PRIORITY_FILTERS.map((f) => (
              <button
                key={f.key}
                type='button'
                onClick={() => setPriorityFilter(f.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  priorityFilter === f.key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted',
                )}
              >
                {f.key !== 'all' && (
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      priorityFilter === f.key ? 'bg-primary-foreground' : PRIORITY_THEME[f.key].dot,
                    )}
                  />
                )}
                {f.label}
                <span className='opacity-70'>{summary[f.key === 'all' ? 'total' : f.key]}</span>
              </button>
            ))}
          </div>
          <p className='mt-3 text-[11px] leading-relaxed text-muted-foreground'>
            Repetitive per-product alerts are grouped into one chart card instead of flooding the grid — expand any card
            for the full list.
          </p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        {visibleTabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className='mt-4 space-y-4'>
            {tab.key === 'sales' && <RevenueChart dateRange={TREND_RANGE} />}
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

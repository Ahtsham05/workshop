import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ShoppingCart,
  RefreshCw,
  AlertTriangle,
  TrendingUp,
  Trophy,
  Wallet,
  Archive,
  Truck,
  Search,
  X,
  PackagePlus,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { useGetBranchesQuery } from '@/stores/branch.api'
import { useGetDashboardStatsQuery } from '@/stores/dashboard.api'
import {
  useGetPurchaseSuggestionsQuery,
  useGetStockoutPredictionsQuery,
  useGetDeadStockQuery,
  useGetDemandTrendsQuery,
  useGetTransferSuggestionsQuery,
  useRunPurchaseSuggestionsNowMutation,
  type HorizonDays,
  type PurchaseSuggestion,
} from '@/stores/purchaseSuggestions.api'
import { StockoutRiskCard } from './components/stockout-risk-card'
import { DeadStockCard } from './components/dead-stock-card'
import { DemandTrendCard } from './components/demand-trend-card'
import { TransferSuggestionCard } from './components/transfer-suggestion-card'
import { SupplierSuggestionGroup, type SupplierGroup } from './components/supplier-suggestion-group'
import { formatMoney } from './utils/format'

type TabKey = 'purchase' | 'stockout' | 'demand' | 'deadstock' | 'transfers'

function CardListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className='h-36 w-full rounded-xl' />
      ))}
    </div>
  )
}

/** Mirrors the actual "header bar + card grid" shape of a supplier group so the loading state doesn't jump when real data arrives. */
function SupplierGroupSkeleton() {
  return (
    <div className='space-y-3'>
      <Skeleton className='h-10 w-full rounded-lg' />
      <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className='h-44 w-full rounded-xl' />
        ))}
      </div>
    </div>
  )
}

function PurchaseSuggestionsSkeleton() {
  return (
    <div className='space-y-6'>
      <SupplierGroupSkeleton />
      <SupplierGroupSkeleton />
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className='flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center'>
      <ShoppingCart className='h-10 w-10 text-muted-foreground/40' />
      <p className='text-sm text-muted-foreground'>{message}</p>
    </div>
  )
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  sub,
  gradient,
  iconWrap,
  isLoading,
}: {
  icon: typeof ShoppingCart
  label: string
  value: string | number
  sub?: string
  gradient: string
  iconWrap: string
  isLoading?: boolean
}) {
  return (
    <div className={cn('rounded-xl border bg-gradient-to-br p-4', gradient)}>
      <div className='flex items-center gap-3'>
        <span className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg', iconWrap)}>
          <Icon className='h-5 w-5' />
        </span>
        <div className='min-w-0 flex-1'>
          {isLoading ? (
            <>
              <Skeleton className='h-6 w-12 rounded' />
              <Skeleton className='mt-1.5 h-3 w-20 rounded' />
            </>
          ) : (
            <>
              <p className='truncate text-xl font-bold tabular-nums leading-none'>{value}</p>
              <p className='mt-1 text-xs text-muted-foreground'>{label}</p>
              {sub && <p className='truncate text-[11px] text-muted-foreground/80'>{sub}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function ResultCount({ shown, total }: { shown: number; total: number }) {
  if (total === 0) return null
  return (
    <p className='mb-2 text-xs text-muted-foreground'>
      Showing {shown} of {total}
    </p>
  )
}

/** Groups suggestions by their recommended supplier so a buyer can place one order per supplier. */
function groupBySupplier(suggestions: PurchaseSuggestion[]): SupplierGroup[] {
  const groups = new Map<string, SupplierGroup>()
  for (const s of suggestions) {
    const key = s.recommendedSupplier?.supplierId || 'unassigned'
    if (!groups.has(key)) {
      groups.set(key, {
        supplierId: key,
        supplierName: s.recommendedSupplier?.supplierName || 'No supplier recommendation yet',
        overallScore: s.recommendedSupplier?.overallScore ?? null,
        items: [],
      })
    }
    groups.get(key)!.items.push(s)
  }
  return [...groups.values()].sort((a, b) => (b.overallScore ?? -1) - (a.overallScore ?? -1))
}

export default function PurchaseSuggestionsPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<TabKey>('purchase')
  const [horizonDays, setHorizonDays] = useState<HorizonDays>(30)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const purchaseSuggestions = useGetPurchaseSuggestionsQuery({ horizonDays })
  const stockoutPredictions = useGetStockoutPredictionsQuery()
  const deadStock = useGetDeadStockQuery()
  const demandTrends = useGetDemandTrendsQuery()
  const transferSuggestions = useGetTransferSuggestionsQuery()
  const branches = useGetBranchesQuery({ page: 1, limit: 100 })

  const monthStart = useMemo(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(), [])
  const today = useMemo(() => new Date().toISOString(), [])
  const dashboardStats = useGetDashboardStatsQuery({ period: 'month', startDate: monthStart, endDate: today })

  const [runNow, { isLoading: isRunning }] = useRunPurchaseSuggestionsNowMutation()

  // Quantities are tied to the chosen horizon — clear selection rather than carry stale quantities across it.
  useEffect(() => {
    setSelected(new Set())
  }, [horizonDays])

  const branchNames = useMemo(() => {
    const map: Record<string, string> = {}
    for (const b of branches.data?.results || []) map[b.id] = b.name
    return map
  }, [branches.data])

  const allSuggestions = purchaseSuggestions.data?.suggestions || []
  const allStockouts = stockoutPredictions.data || []
  const allDemandTrends = demandTrends.data || []
  const allDeadStock = deadStock.data || []
  const allTransfers = transferSuggestions.data || []

  const query = search.trim().toLowerCase()
  const matchesName = (name: string) => !query || name.toLowerCase().includes(query)

  const suggestions = useMemo(() => allSuggestions.filter((s) => matchesName(s.name)), [allSuggestions, query])
  const stockouts = useMemo(() => allStockouts.filter((s) => matchesName(s.name)), [allStockouts, query])
  const trends = useMemo(() => allDemandTrends.filter((s) => matchesName(s.name)), [allDemandTrends, query])
  const deadStockItems = useMemo(() => allDeadStock.filter((s) => matchesName(s.name)), [allDeadStock, query])
  const transfers = useMemo(() => allTransfers.filter((s) => matchesName(s.productName)), [allTransfers, query])

  const supplierGroups = useMemo(() => groupBySupplier(suggestions), [suggestions])

  const risingCount = allDemandTrends.filter((t) => t.label === 'rising').length

  const bestSupplier = useMemo(() => {
    const candidates = allSuggestions.map((s) => s.recommendedSupplier).filter((s): s is NonNullable<typeof s> => !!s)
    if (candidates.length === 0) return null
    return candidates.reduce((best, s) => (s.overallScore > best.overallScore ? s : best), candidates[0])
  }, [allSuggestions])

  const TABS: { key: TabKey; label: string; icon: typeof ShoppingCart; count: number }[] = [
    { key: 'purchase', label: 'Purchase Suggestions', icon: ShoppingCart, count: allSuggestions.length },
    { key: 'stockout', label: 'Stockout Risks', icon: AlertTriangle, count: allStockouts.length },
    { key: 'demand', label: 'Demand Growth', icon: TrendingUp, count: allDemandTrends.length },
    { key: 'deadstock', label: 'Dead Stock', icon: Archive, count: allDeadStock.length },
    { key: 'transfers', label: 'Transfers', icon: Truck, count: allTransfers.length },
  ]

  const handleRefresh = async () => {
    try {
      const result = await runNow().unwrap()
      toast.success(`Generated ${result.generated} insight(s)`)
    } catch (error: any) {
      toast.error(error?.data?.message || 'Failed to refresh purchase suggestions')
    }
  }

  const toggleOne = (productId: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(productId) ? next.delete(productId) : next.add(productId)
      return next
    })
  }

  const toggleGroup = (productIds: string[], select: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      productIds.forEach((id) => (select ? next.add(id) : next.delete(id)))
      return next
    })
  }

  const getSelectedSuggestions = () => allSuggestions.filter((s) => selected.has(s.productId))

  const getSelectedPrefillItems = () =>
    getSelectedSuggestions().map((s) => ({ productId: s.productId, quantity: s.suggestedOrderQty }))

  /** Most common recommended supplier among the selected products — the right pick when a whole supplier group is selected, and still a sane default when the selection spans more than one. */
  const getSelectedSupplierId = (): string | undefined => {
    const counts = new Map<string, number>()
    for (const s of getSelectedSuggestions()) {
      const id = s.recommendedSupplier?.supplierId
      if (id) counts.set(id, (counts.get(id) || 0) + 1)
    }
    if (counts.size === 0) return undefined
    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0]
  }

  const handleCreatePO = () => {
    navigate({ to: '/purchase-orders', search: { prefillItems: getSelectedPrefillItems(), supplierId: getSelectedSupplierId() } })
  }

  const handleCreatePurchase = () => {
    navigate({ to: '/purchase-invoice', search: { prefillItems: getSelectedPrefillItems(), supplierId: getSelectedSupplierId() } })
  }

  const selectedUnits = allSuggestions.filter((s) => selected.has(s.productId)).reduce((s, x) => s + x.suggestedOrderQty, 0)

  return (
    <div className='space-y-6 p-4 pb-24 md:p-6'>
      <div className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
        <div>
          <h1 className='flex items-center gap-2 text-2xl font-bold tracking-tight'>
            <ShoppingCart className='h-6 w-6 text-primary' />
            AI Purchase Suggestions
          </h1>
          <p className='text-sm text-muted-foreground'>
            Reorder timing, quantities, and supplier picks — computed from your sales history, stock levels, and supplier performance.
          </p>
        </div>
        <Button onClick={handleRefresh} disabled={isRunning} className='shrink-0'>
          <RefreshCw className={cn('mr-2 h-4 w-4', isRunning && 'animate-spin')} />
          {isRunning ? 'Refreshing…' : 'Refresh now'}
        </Button>
      </div>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5'>
        <SummaryTile
          icon={ShoppingCart}
          label='Purchase Suggestions'
          value={allSuggestions.length}
          sub={allSuggestions.length > 0 ? `${allSuggestions.reduce((s, x) => s + x.suggestedOrderQty, 0)} units total` : undefined}
          gradient='from-primary/10 to-primary/0'
          iconWrap='bg-primary/15 text-primary'
          isLoading={purchaseSuggestions.isLoading}
        />
        <SummaryTile
          icon={AlertTriangle}
          label='Stockout Risks'
          value={allStockouts.length}
          gradient='from-red-500/10 to-red-500/0'
          iconWrap='bg-red-500/15 text-red-600 dark:text-red-400'
          isLoading={stockoutPredictions.isLoading}
        />
        <SummaryTile
          icon={TrendingUp}
          label='Demand Growth'
          value={risingCount}
          sub='products trending up'
          gradient='from-emerald-500/10 to-emerald-500/0'
          iconWrap='bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          isLoading={demandTrends.isLoading}
        />
        <SummaryTile
          icon={Trophy}
          label='Top Supplier Score'
          value={bestSupplier ? `${Math.round(bestSupplier.overallScore)}/100` : 'No data yet'}
          sub={bestSupplier?.supplierName}
          gradient='from-amber-500/10 to-amber-500/0'
          iconWrap='bg-amber-500/15 text-amber-600 dark:text-amber-400'
          isLoading={purchaseSuggestions.isLoading}
        />
        <SummaryTile
          icon={Wallet}
          label='Inventory Value'
          value={dashboardStats.data ? formatMoney(dashboardStats.data.totalInventoryValue) : '—'}
          gradient='from-blue-500/10 to-blue-500/0'
          iconWrap='bg-blue-500/15 text-blue-600 dark:text-blue-400'
          isLoading={dashboardStats.isLoading}
        />
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)}>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <TabsList className='flex-wrap'>
            {TABS.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className='gap-1.5'>
                <tab.icon className='h-3.5 w-3.5' />
                {tab.label}
                {tab.count > 0 && (
                  <Badge variant='secondary' className='h-4 min-w-4 rounded-full px-1 text-[10px] tabular-nums'>
                    {tab.count}
                  </Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
          <div className='flex items-center gap-2'>
            <div className='relative flex h-9 w-48 items-center rounded-md border border-input bg-transparent shadow-xs focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50'>
              <Search className='pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted-foreground' />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder='Search products…'
                className='h-full w-full bg-transparent pl-8 pr-7 text-sm outline-none placeholder:text-muted-foreground'
              />
              {search && (
                <button
                  type='button'
                  onClick={() => setSearch('')}
                  className='absolute right-2 text-muted-foreground hover:text-foreground'
                >
                  <X className='h-3.5 w-3.5' />
                </button>
              )}
            </div>
            {activeTab === 'purchase' && (
              <Select value={String(horizonDays)} onValueChange={(v) => setHorizonDays(Number(v) as HorizonDays)}>
                <SelectTrigger className='w-36'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='30'>Next 30 days</SelectItem>
                  <SelectItem value='60'>Next 60 days</SelectItem>
                  <SelectItem value='90'>Next 90 days</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <TabsContent value='purchase' className='mt-4'>
          {purchaseSuggestions.isLoading ? (
            <PurchaseSuggestionsSkeleton />
          ) : allSuggestions.length === 0 ? (
            <EmptyState message='No products need reordering right now — stock levels are comfortably above their reorder point.' />
          ) : suggestions.length === 0 ? (
            <EmptyState message={`No purchase suggestions match "${search}".`} />
          ) : (
            <>
              <ResultCount shown={suggestions.length} total={allSuggestions.length} />
              <div className='space-y-6'>
                {supplierGroups.map((group) => (
                  <SupplierSuggestionGroup
                    key={group.supplierId}
                    group={group}
                    selected={selected}
                    onToggleSelect={toggleOne}
                    onToggleGroup={toggleGroup}
                  />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value='stockout' className='mt-4'>
          {stockoutPredictions.isLoading ? (
            <CardListSkeleton />
          ) : allStockouts.length === 0 ? (
            <EmptyState message='No products are at risk of running out soon.' />
          ) : stockouts.length === 0 ? (
            <EmptyState message={`No stockout risks match "${search}".`} />
          ) : (
            <>
              <ResultCount shown={stockouts.length} total={allStockouts.length} />
              <div className='grid gap-3 sm:grid-cols-2'>
                {stockouts.map((item) => (
                  <StockoutRiskCard key={item.productId} item={item} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value='demand' className='mt-4'>
          {demandTrends.isLoading ? (
            <CardListSkeleton />
          ) : allDemandTrends.length === 0 ? (
            <EmptyState message='No significant demand swings this week.' />
          ) : trends.length === 0 ? (
            <EmptyState message={`No demand trends match "${search}".`} />
          ) : (
            <>
              <ResultCount shown={trends.length} total={allDemandTrends.length} />
              <div className='grid gap-3 sm:grid-cols-2'>
                {trends.map((item) => (
                  <DemandTrendCard key={item.productId} item={item} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value='deadstock' className='mt-4'>
          {deadStock.isLoading ? (
            <CardListSkeleton />
          ) : allDeadStock.length === 0 ? (
            <EmptyState message='No dead stock detected.' />
          ) : deadStockItems.length === 0 ? (
            <EmptyState message={`No dead stock matches "${search}".`} />
          ) : (
            <>
              <ResultCount shown={deadStockItems.length} total={allDeadStock.length} />
              <div className='grid gap-3 sm:grid-cols-2'>
                {deadStockItems.map((item) => (
                  <DeadStockCard key={item.productId} item={item} />
                ))}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value='transfers' className='mt-4'>
          {transferSuggestions.isLoading || branches.isLoading ? (
            <CardListSkeleton />
          ) : allTransfers.length === 0 ? (
            <EmptyState message='No branch-to-branch transfers needed — purchase suggestions already account for available stock.' />
          ) : transfers.length === 0 ? (
            <EmptyState message={`No transfers match "${search}".`} />
          ) : (
            <>
              <ResultCount shown={transfers.length} total={allTransfers.length} />
              <div className='grid gap-3 sm:grid-cols-2'>
                {transfers.map((transfer, idx) => (
                  <TransferSuggestionCard key={`${transfer.fromProductId}-${transfer.toProductId}-${idx}`} transfer={transfer} branchNames={branchNames} />
                ))}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {activeTab === 'purchase' && selected.size > 0 && (
        <div className='fixed inset-x-0 bottom-0 z-20 flex flex-col gap-2 border-t bg-background/95 p-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-6'>
          <span className='text-sm font-medium'>
            {selected.size} product{selected.size > 1 ? 's' : ''} selected · {selectedUnits} units
          </span>
          <div className='flex gap-2'>
            <Button
              size='sm'
              variant='outline'
              onClick={handleCreatePurchase}
              className='gap-1.5'
              title='Record stock as already received — for stock you already have in hand'
            >
              <PackagePlus className='h-3.5 w-3.5' />
              Create Purchase
            </Button>
            <Button size='sm' onClick={handleCreatePO} className='gap-1.5' title='Send a formal order to the supplier first, receive stock later'>
              <ShoppingCart className='h-3.5 w-3.5' />
              Create Purchase Order
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { LayoutDashboard, DollarSign, TrendingUp, ShoppingCart, Receipt, ArrowRight, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Can } from '@/context/permission-context'
import { useGetDashboardStatsQuery } from '@/stores/dashboard.api'
import { buildDashboardDateRange, dashboardRangeQueryParams } from '@/lib/dashboard-date-range'
import { toneIconWrapClass, type StatCardTone } from '@/lib/stat-card-tones'
import { formatMoney } from '../lib/format'

/** A compact, purpose-built stat tile for this narrow sidebar — the full dashboard StatCard
 *  (large icon, badge, progress bar) is right for a page-width grid but too tall stacked 4-up
 *  in a 280px rail, so this trims to icon + value + an inline delta. */
function OverviewTile({
  icon,
  tone,
  title,
  value,
  change,
  isLoading,
}: {
  icon: ReactNode
  tone: StatCardTone
  title: string
  value: string
  change?: number
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <div className='flex flex-col gap-2 rounded-lg border p-2.5'>
        <Skeleton className='h-7 w-7 rounded-md' />
        <Skeleton className='h-3 w-14' />
        <Skeleton className='h-4 w-16' />
      </div>
    )
  }

  const isPositive = change !== undefined && change >= 0

  return (
    <Link
      to='/'
      className='group flex flex-col gap-2 rounded-lg border p-2.5 transition-colors hover:border-primary/30 hover:bg-muted/40'
    >
      <div className='flex items-center justify-between'>
        <span className={cn('flex h-7 w-7 items-center justify-center rounded-md [&_svg]:h-3.5 [&_svg]:w-3.5', toneIconWrapClass(tone))}>
          {icon}
        </span>
        {change !== undefined && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10px] font-medium tabular-nums',
              isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            )}
          >
            {isPositive ? <ArrowUpRight className='h-3 w-3' /> : <ArrowDownRight className='h-3 w-3' />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
      </div>
      <div className='min-w-0'>
        <p className='truncate text-[11px] text-muted-foreground'>{title}</p>
        <p className='truncate text-[15px] font-semibold tabular-nums'>{value}</p>
      </div>
    </Link>
  )
}

/** Reuses the real Dashboard's own stats endpoint — same numbers the user sees on the Dashboard
 *  page, so this never drifts into its own, possibly-inconsistent source of truth. */
function BusinessOverviewContent() {
  const range = buildDashboardDateRange('month')
  const { data: stats, isLoading } = useGetDashboardStatsQuery(dashboardRangeQueryParams(range))

  return (
    <Card className='py-4'>
      <CardHeader className='flex-row items-center justify-between px-4'>
        <CardTitle className='flex items-center gap-1.5 text-sm'>
          <LayoutDashboard className='h-3.5 w-3.5 text-muted-foreground' />
          Business Overview
        </CardTitle>
        <Badge variant='secondary' className='text-[11px]'>
          This Month
        </Badge>
      </CardHeader>
      <CardContent className='grid grid-cols-2 gap-2 px-4'>
        <OverviewTile
          title='Total Sales'
          value={formatMoney(stats?.totalRevenue)}
          change={stats?.totalRevenueChange}
          icon={<DollarSign />}
          tone='emerald'
          isLoading={isLoading}
        />
        <OverviewTile
          title='Total Profit'
          value={formatMoney(stats?.totalProfit)}
          icon={<TrendingUp />}
          tone='violet'
          isLoading={isLoading}
        />
        <OverviewTile
          title='Orders'
          value={String(stats?.totalSales ?? 0)}
          change={stats?.totalSalesChange}
          icon={<ShoppingCart />}
          tone='sky'
          isLoading={isLoading}
        />
        <OverviewTile
          title='Unpaid Invoices'
          value={String(stats?.pendingInvoices ?? 0)}
          icon={<Receipt />}
          tone='amber'
          isLoading={isLoading}
        />
      </CardContent>
      <CardFooter className='px-4 pt-1'>
        <Button asChild variant='ghost' size='sm' className='h-7 w-full justify-between text-xs text-primary hover:text-primary'>
          <Link to='/'>
            View Full Dashboard
            <ArrowRight className='h-3.5 w-3.5' />
          </Link>
        </Button>
      </CardFooter>
    </Card>
  )
}

export function BusinessOverviewPanel() {
  return (
    <Can permission='viewDashboard'>
      <BusinessOverviewContent />
    </Can>
  )
}

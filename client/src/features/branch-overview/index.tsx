import { useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { Building2, DollarSign, TrendingUp, Trophy, ArrowLeftRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { DashboardDateFilter } from '@/features/dashboard/components/dashboard-date-filter'
import {
  dashboardRangeQueryParams,
  getDefaultDashboardDateRange,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'
import { useGetBranchOverviewSummaryQuery, type BranchOverviewRow } from '@/stores/branchOverview.api'
import { setActiveBranch } from '@/stores/auth.slice'
import { AppDispatch, RootState } from '@/stores/store'

export default function BranchOverviewPage() {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const [dateRange, setDateRange] = useState<DashboardDateRange>(getDefaultDashboardDateRange)
  const dateParams = dashboardRangeQueryParams(dateRange)
  const { data, isLoading, isFetching, refetch } = useGetBranchOverviewSummaryQuery(dateParams)
  const loading = isLoading || isFetching

  const branches = data?.branches || []
  const totals = data?.totals

  const handleSwitchBranch = (branch: BranchOverviewRow) => {
    if (branch.branchId === activeBranchId) return
    dispatch(setActiveBranch({ id: branch.branchId, name: branch.branchName }))
    window.location.reload()
  }

  return (
    <div className='p-6 space-y-6'>
      <Card className='mb-2 border bg-card/80 p-4 shadow-sm backdrop-blur-sm'>
        <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
          <div className='min-w-0'>
            <h1 className='text-3xl font-bold tracking-tight'>{t('Branch Performance')}</h1>
            <p className='mt-1 text-muted-foreground'>
              {t('Monitor every branch at a glance, no matter which branch is currently active')}
            </p>
          </div>
          <DashboardDateFilter
            value={dateRange}
            onChange={setDateRange}
            onRefresh={() => refetch()}
            isRefreshing={loading}
            className='lg:shrink-0'
          />
        </div>
      </Card>

      <div className='grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4'>
        <StatCard
          title={t('Total Revenue')}
          value={totals?.totalSales || 0}
          icon={<DollarSign className='h-4 w-4' />}
          valuePrefix='Rs '
          description={t('Across all branches')}
          isLoading={loading}
          tone='emerald'
        />
        <StatCard
          title={t('Net Profit')}
          value={totals?.netProfit || 0}
          icon={<TrendingUp className='h-4 w-4' />}
          valuePrefix='Rs '
          description={t('Profit minus expenses, all branches')}
          isLoading={loading}
          tone='sky'
        />
        <StatCard
          title={t('Active Branches')}
          value={totals?.branchCount || 0}
          icon={<Building2 className='h-4 w-4' />}
          description={t('Branches in your organization')}
          isLoading={loading}
          tone='indigo'
        />
        <StatCard
          title={t('Top Performing Branch')}
          value={totals?.bestBranchName || t('N/A')}
          icon={<Trophy className='h-4 w-4' />}
          description={t('Highest revenue in selected period')}
          isLoading={loading}
          tone='amber'
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('Revenue by Branch')}</CardTitle>
          <CardDescription>{t('Sales and profit comparison for the selected period')}</CardDescription>
        </CardHeader>
        <CardContent className='pl-2'>
          {loading ? (
            <Skeleton className='h-[300px] w-full' />
          ) : (
            <ResponsiveContainer width='100%' height={300}>
              <BarChart data={branches}>
                <CartesianGrid strokeDasharray='3 3' />
                <XAxis dataKey='branchName' stroke='#888888' fontSize={12} tickLine={false} axisLine={false} />
                <YAxis
                  stroke='#888888'
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(value) => `Rs${value}`}
                />
                <Tooltip formatter={(value: number) => `Rs${Number(value).toLocaleString()}`} contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Legend />
                <Bar dataKey='totalSales' fill='#3b82f6' radius={[8, 8, 0, 0]} name={t('Revenue')} />
                <Bar dataKey='netProfit' fill='#10b981' radius={[8, 8, 0, 0]} name={t('Net Profit')} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('Branches')}</CardTitle>
          <CardDescription>
            {t('Ranked by revenue')} · {branches.length} {t('branches')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className='space-y-2'>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : branches.length === 0 ? (
            <div className='text-center py-8 text-muted-foreground'>{t('No branches found')}</div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Branch')}</TableHead>
                    <TableHead className='text-right'>{t('Sales')}</TableHead>
                    <TableHead className='text-right'>{t('Purchases')}</TableHead>
                    <TableHead className='text-right'>{t('Expenses')}</TableHead>
                    <TableHead className='text-right'>{t('Net Profit')}</TableHead>
                    <TableHead className='text-right'>{t('Cash in Hand')}</TableHead>
                    <TableHead className='text-right'>{t('Invoices')}</TableHead>
                    <TableHead className='text-right'>{t('Staff')}</TableHead>
                    <TableHead className='text-right'>{t('Customers')}</TableHead>
                    <TableHead className='text-right'>{t('Low Stock')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {branches.map((branch, index) => (
                    <TableRow key={branch.branchId}>
                      <TableCell className='font-medium'>
                        <div className='flex items-center gap-2'>
                          {index === 0 && branch.totalSales > 0 && (
                            <Trophy className='h-3.5 w-3.5 text-amber-500 shrink-0' />
                          )}
                          <span>{branch.branchName}</span>
                          {branch.isDefault && (
                            <Badge variant='outline' className='text-xs'>
                              {t('Default')}
                            </Badge>
                          )}
                          {branch.branchId === activeBranchId && (
                            <Badge variant='secondary' className='text-xs'>
                              {t('Active')}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>
                        Rs {branch.totalSales.toLocaleString()}
                        <span className='ml-1 text-xs text-muted-foreground'>({branch.revenueSharePct}%)</span>
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>Rs {branch.totalPurchases.toLocaleString()}</TableCell>
                      <TableCell className='text-right tabular-nums'>Rs {branch.totalExpenses.toLocaleString()}</TableCell>
                      <TableCell
                        className={`text-right tabular-nums font-medium ${branch.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}
                      >
                        Rs {branch.netProfit.toLocaleString()}
                      </TableCell>
                      <TableCell className='text-right tabular-nums'>Rs {branch.cashInHand.toLocaleString()}</TableCell>
                      <TableCell className='text-right tabular-nums'>{branch.invoiceCount}</TableCell>
                      <TableCell className='text-right tabular-nums'>{branch.staffCount}</TableCell>
                      <TableCell className='text-right tabular-nums'>{branch.customerCount}</TableCell>
                      <TableCell className='text-right tabular-nums'>
                        {branch.lowStockCount > 0 ? (
                          <Badge variant='secondary' className='bg-amber-500/10 text-amber-700 dark:text-amber-400'>
                            {branch.lowStockCount}
                          </Badge>
                        ) : (
                          <span className='text-muted-foreground'>0</span>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>
                        <Button
                          variant='ghost'
                          size='sm'
                          disabled={branch.branchId === activeBranchId}
                          onClick={() => handleSwitchBranch(branch)}
                        >
                          <ArrowLeftRight className='mr-1.5 h-3.5 w-3.5' />
                          {branch.branchId === activeBranchId ? t('Current') : t('Switch')}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

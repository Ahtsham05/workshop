import { useState, useMemo } from 'react'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { StatCard, type StatCardLink } from './components/stat-card'
import { Card } from '@/components/ui/card'
import { RevenueChart } from './components/revenue-chart'
import { LowStockWidget } from './components/low-stock-widget'
import { RecentActivities } from './components/recent-activities'
import { TopProducts } from './components/top-products'
import { TopCustomers } from './components/top-customers'
import { QuickActions } from './components/quick-actions'
import { DashboardDateFilter } from './components/dashboard-date-filter'
import { useGetDashboardStatsQuery } from '@/stores/dashboard.api'
import {
  dashboardRangeQueryParams,
  getComparisonLabel,
  getDefaultDashboardDateRange,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { DollarSign, ShoppingCart, AlertTriangle, FileText, RefreshCcw, Package } from 'lucide-react'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { isMobileShopBusiness, isRestaurantBusiness, isSchoolBusiness } from '@/lib/business-types'
import { getDefaultHomeRoute } from '@/lib/default-home-route'
import {
  Smartphone,
  WalletCards,
  Wrench,
  Receipt,
  Clock,
  AlertCircle,
  ShoppingBag,
  IdCard,
  ArrowUpRight,
  ArrowDownLeft,
  Briefcase,
} from 'lucide-react'
import SchoolDashboard from '@/features/school/dashboard'
import { Navigate } from '@tanstack/react-router'

export default function Dashboard() {
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const isPlatformAdmin = user?.systemRole === 'superAdmin' || user?.systemRole === 'system_admin'
  const [dateRange, setDateRange] = useState<DashboardDateRange>(getDefaultDashboardDateRange)
  const dateParams = dashboardRangeQueryParams(dateRange)
  const { data: stats, isLoading, isFetching, refetch } = useGetDashboardStatsQuery(dateParams)
  const statsLoading = isLoading || isFetching
  const comparisonLabel = getComparisonLabel(dateRange.period, t)
  const reportLink = useMemo(
    () =>
      (tab: string): StatCardLink => ({
        to: '/reports',
        search: {
          tab,
          startDate: dateParams.startDate,
          endDate: dateParams.endDate,
        },
      }),
    [dateParams.endDate, dateParams.startDate]
  )
  // const { data: usageData } = useGetSubscriptionUsageQuery()
  const { data: orgData } = useGetMyOrganizationQuery()
  // const planType = usageData?.subscription?.planType
  // Use organization's businessType as the source of truth; fall back to user's businessType
  const businessType = orgData?.businessType ?? user?.businessType
  // Show the mobile-shop dashboard section for any mobile_shop organisation.
  // Individual cards that require a paid feature are further gated inside the section.
  const showMobileCards = isMobileShopBusiness(businessType)

  if (!isPlatformAdmin && !hasExplicitPermission('viewDashboard')) {
    return <Navigate to={getDefaultHomeRoute(user)} replace />
  }

  if (isRestaurantBusiness(businessType)) {
    return <Navigate to='/restaurant' replace />
  }

  if (isSchoolBusiness(businessType)) {
    // Teachers must never see the admin school dashboard — redirect them immediately
    const schoolRole = user?.schoolRole || (user?.linkedTeacherId ? 'teacher' : null)
    if (schoolRole === 'teacher') {
      return <Navigate to='/school/portals/teacher' />
    }
    return <SchoolDashboard />
  }
  
  return (
    <>
        <Card className='mb-6 border bg-card/80 p-4 shadow-sm backdrop-blur-sm'>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between'>
            <div className='min-w-0'>
              <h1 className='text-3xl font-bold tracking-tight'>{t('dashboard')}</h1>
              <p className='mt-1 text-muted-foreground'>{t('Overview of your business performance')}</p>
            </div>
            <DashboardDateFilter
              value={dateRange}
              onChange={setDateRange}
              onRefresh={() => refetch()}
              isRefreshing={statsLoading}
              className='lg:shrink-0'
            />
          </div>
        </Card>

        {/* Quick Actions */}
        <div className='mb-6'>
          <QuickActions />
        </div>

        {/* Mobile Shop — Row 1: Cash / Wallets / Load */}
        {showMobileCards && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6'>
            <StatCard
              title={t('Cash in Hand')}
              value={stats?.cashInHand || 0}
              icon={<DollarSign className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Available cash after expenses')}
              isLoading={statsLoading}
              tone='emerald'
              link={{ to: '/cash-register' }}
            />
            <StatCard
              title={t('Wallet Balance')}
              value={stats?.walletBalance || 0}
              icon={<WalletCards className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Total balance across all wallets')}
              isLoading={statsLoading}
              tone='cyan'
              link={{ to: '/mobile-shop/wallet' }}
            />
            <StatCard
              title={t('Load Sold')}
              value={stats?.totalLoadSold || 0}
              icon={<Smartphone className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Mobile load transactions')}
              isLoading={statsLoading}
              tone='violet'
              link={reportLink('load')}
            />
            <StatCard
              title={t('Load Purchased')}
              value={stats?.totalLoadPurchased || 0}
              icon={<ShoppingBag className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Load bought from distributors')}
              isLoading={statsLoading}
              tone='sky'
              link={reportLink('load')}
            />
          </div>
        )}

        {/* Mobile Shop — Row 2: Repair / Bills */}
        {showMobileCards && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6'>
            <StatCard
              title={t('Repair Income')}
              value={stats?.totalRepairIncome || 0}
              icon={<Wrench className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Repair charges collected')}
              isLoading={statsLoading}
              tone='orange'
              link={reportLink('repair')}
            />
            <StatCard
              title={t('Bill Collection')}
              value={stats?.totalBillCollection || 0}
              icon={<Receipt className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Total utility bills collected')}
              isLoading={statsLoading}
              tone='indigo'
              link={reportLink('bill-payments')}
            />
            <StatCard
              title={dateRange.period === 'today' ? t('Bills Due Today') : t('Bills Due in Period')}
              value={
                dateRange.period === 'today'
                  ? stats?.billsDueToday || 0
                  : stats?.billsDueInPeriod ?? stats?.billsDueToday ?? 0
              }
              icon={<Clock className='h-4 w-4' />}
              description={
                dateRange.period === 'today'
                  ? t('Pending bills due today')
                  : t('Pending bills due in selected period')
              }
              isLoading={statsLoading}
              tone='amber'
              link={{ to: '/mobile-shop/bill-payments', search: { filter: 'due-today' } }}
            />
            <StatCard
              title={t('Overdue Bills')}
              value={stats?.billsOverdue || 0}
              icon={<AlertCircle className='h-4 w-4' />}
              description={t('Bills past due date')}
              isLoading={statsLoading}
              tone='rose'
              link={{ to: '/mobile-shop/bill-payments', search: { filter: 'overdue' } }}
            />
          </div>
        )}

        {/* Mobile Shop — Row 3: Sim Sale / Send / Received / Services */}
        {showMobileCards && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6'>
            <StatCard
              title={t('Sim Sale')}
              value={stats?.totalSimSale || 0}
              icon={<IdCard className='h-4 w-4' />}
              valuePrefix='Rs '
              description={
                stats?.simSaleCount
                  ? `${t('Profit')}: Rs ${(stats?.totalSimSaleProfit || 0).toLocaleString()} · ${stats.simSaleCount} ${t('sales')}`
                  : t('SIM sales in selected period')
              }
              isLoading={statsLoading}
              tone='violet'
              link={reportLink('sim-sale')}
            />
            <StatCard
              title={t('Send')}
              value={stats?.totalCashSend || 0}
              icon={<ArrowUpRight className='h-4 w-4' />}
              valuePrefix='Rs '
              description={
                stats?.cashSendCount
                  ? `${t('Profit')}: Rs ${(stats?.totalCashSendProfit || 0).toLocaleString()} · ${stats.cashSendCount} ${t('transactions')}`
                  : t('Cash sent to customer accounts')
              }
              isLoading={statsLoading}
              tone='cyan'
              link={{ to: '/mobile-shop/cash-management' }}
            />
            <StatCard
              title={t('Received')}
              value={stats?.totalCashReceived || 0}
              icon={<ArrowDownLeft className='h-4 w-4' />}
              valuePrefix='Rs '
              description={
                stats?.cashReceivedCount
                  ? `${t('Profit')}: Rs ${(stats?.totalCashReceivedProfit || 0).toLocaleString()} · ${stats.cashReceivedCount} ${t('transactions')}`
                  : t('Cash received from customers')
              }
              isLoading={statsLoading}
              tone='sky'
              link={{ to: '/mobile-shop/cash-management' }}
            />
            <StatCard
              title={t('Services')}
              value={stats?.totalServiceIncome || 0}
              icon={<Briefcase className='h-4 w-4' />}
              valuePrefix='Rs '
              description={
                stats?.serviceInvoiceCount
                  ? `${stats.serviceInvoiceCount} ${t('invoices in selected period')}`
                  : t('Service charges collected')
              }
              isLoading={statsLoading}
              tone='emerald'
              link={reportLink('services')}
            />
          </div>
        )}

        {/* Statistics Cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-5 mb-6'>
          <StatCard
            title={t('Total Revenue')}
            value={stats?.totalRevenue || 0}
            change={stats?.totalRevenueChange}
            icon={<DollarSign className='h-4 w-4' />}
            valuePrefix='Rs'
            description={comparisonLabel}
            isLoading={statsLoading}
            tone='emerald'
            link={reportLink('profit-loss')}
          />
          <StatCard
            title={t('Total Sales')}
            value={stats?.totalSales || 0}
            change={stats?.totalSalesChange}
            icon={<ShoppingCart className='h-4 w-4' />}
            description={comparisonLabel}
            isLoading={statsLoading}
            tone='sky'
            link={reportLink('sales')}
          />
          <StatCard
            title={t('Inventory Value')}
            value={stats?.totalInventoryValue || 0}
            icon={<Package className='h-4 w-4' />}
            valuePrefix='Rs'
            description={t('Total stock value')}
            isLoading={statsLoading}
            tone='violet'
            link={reportLink('inventory')}
          />
          <StatCard
            title={t('Low Stock Items')}
            value={stats?.lowStockCount || 0}
            icon={<AlertTriangle className='h-4 w-4' />}
            description={`${stats?.outOfStockCount || 0} ${t('out of stock')}`}
            isLoading={statsLoading}
            tone='amber'
            link={{ to: '/products' }}
          />
          <StatCard
            title={t('Pending Invoices')}
            value={stats?.pendingInvoices || 0}
            icon={<FileText className='h-4 w-4' />}
            valuePrefix='Rs'
            description={`${t('Total')}: Rs${(stats?.pendingInvoicesAmount || 0).toLocaleString()}`}
            isLoading={statsLoading}
            tone='indigo'
            link={{ to: '/invoice', search: { view: 'list', type: 'pending' } }}
          />
        </div>

        {/* Returns Summary */}
        <div className='grid gap-4 sm:grid-cols-2 mb-6'>
          <StatCard
            title={t('Sales Returns')}
            value={stats?.totalSalesReturns || 0}
            icon={<RefreshCcw className='h-4 w-4' />}
            valuePrefix='Rs '
            description={t('Total amount refunded to customers')}
            isLoading={statsLoading}
            tone='rose'
            link={reportLink('sales-returns')}
          />
          <StatCard
            title={t('Purchase Returns')}
            value={stats?.totalPurchaseReturns || 0}
            icon={<RefreshCcw className='h-4 w-4' />}
            valuePrefix='Rs '
            description={t('Total amount recovered from suppliers')}
            isLoading={statsLoading}
            tone='cyan'
            link={reportLink('purchase-returns')}
          />
        </div>

        {/* Net figures after returns */}
        <div className='grid gap-4 sm:grid-cols-2 mb-6'>
          <StatCard
            title={t('Net Sales')}
            value={stats?.netSales || 0}
            icon={<ShoppingCart className='h-4 w-4' />}
            valuePrefix='Rs '
            description={t('Revenue after sales returns')}
            isLoading={statsLoading}
            tone='emerald'
            link={reportLink('sales')}
          />
          <StatCard
            title={t('Net Purchases')}
            value={stats?.netPurchase || 0}
            icon={<Package className='h-4 w-4' />}
            valuePrefix='Rs '
            description={t('Total purchases minus returns')}
            isLoading={statsLoading}
            tone='orange'
            link={reportLink('purchases')}
          />
        </div>

        {/* Charts and Widgets */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-7 mb-6'>
          <RevenueChart dateRange={dateRange} />
          <LowStockWidget />
        </div>

        {/* Top Products and Customers */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6'>
          <TopProducts dateRange={dateRange} />
          <TopCustomers dateRange={dateRange} />
        </div>

        {/* Recent Activities */}
        <div className='grid grid-cols-1 gap-6'>
          <RecentActivities dateRange={dateRange} />
        </div>
    </>
  )
}

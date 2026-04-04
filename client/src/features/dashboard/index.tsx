import { Button } from '@/components/ui/button'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { useLanguage } from '@/context/language-context'
import { StatCard } from './components/stat-card'
import { RevenueChart } from './components/revenue-chart'
import { LowStockWidget } from './components/low-stock-widget'
import { RecentActivities } from './components/recent-activities'
import { TopProducts } from './components/top-products'
import { TopCustomers } from './components/top-customers'
import { QuickActions } from './components/quick-actions'
import { useGetDashboardStatsQuery } from '@/stores/dashboard.api'
import { useGetSubscriptionUsageQuery, useGetMyOrganizationQuery } from '@/stores/organization.api'
import { DollarSign, ShoppingCart, AlertTriangle, FileText, RefreshCcw, Package } from 'lucide-react'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { isMobileShopBusiness } from '@/lib/business-types'
import { isFeatureAllowed } from '@/lib/feature-access'
import { Smartphone, WalletCards, Wrench, Receipt, Clock, AlertCircle } from 'lucide-react'

export default function Dashboard() {
  const { t } = useLanguage()
  const { data: stats, isLoading, refetch } = useGetDashboardStatsQuery()
  const { data: usageData } = useGetSubscriptionUsageQuery()
  const { data: orgData } = useGetMyOrganizationQuery()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const planType = usageData?.subscription?.planType
  // Use organization's businessType as the source of truth; fall back to user's businessType
  const businessType = orgData?.businessType ?? user?.businessType
  const showMobileCards = isMobileShopBusiness(businessType) && isFeatureAllowed(planType, 'load')
  
  return (
    <>
      {/* ===== Top Heading ===== */}
      <Header>
        <div className='ml-auto flex items-center space-x-4'>
          <Search />
          <LanguageSwitch />
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      {/* ===== Main ===== */}
      <Main>
        <div className='mb-6 flex items-center justify-between'>
          <div>
            <h1 className='text-3xl font-bold tracking-tight'>{t('dashboard')}</h1>
            <p className='text-muted-foreground'>{t('Overview of your business performance')}</p>
          </div>
          <Button onClick={() => refetch()} variant='outline' size='sm'>
            <RefreshCcw className='h-4 w-4 mr-2' />
            {t('Refresh')}
          </Button>
        </div>

        {/* Quick Actions */}
        <div className='mb-6'>
          <QuickActions />
        </div>

        {showMobileCards && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6'>
            <StatCard
              title={t('Cash in Hand')}
              value={stats?.cashInHand || 0}
              icon={<DollarSign className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Available cash after expenses')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Wallet Balance')}
              value={stats?.walletBalance || 0}
              icon={<WalletCards className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Total balance across all wallets')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Load Sold')}
              value={stats?.totalLoadSold || 0}
              icon={<Smartphone className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Mobile load transactions')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Repair Income')}
              value={stats?.totalRepairIncome || 0}
              icon={<Wrench className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Repair charges collected')}
              isLoading={isLoading}
            />
          </div>
        )}

        {showMobileCards && (
          <div className='grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6'>
            <StatCard
              title={t('Bill Collection')}
              value={stats?.totalBillCollection || 0}
              icon={<Receipt className='h-4 w-4' />}
              valuePrefix='Rs '
              description={t('Total utility bills collected')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Bill Payment Profit')}
              value={stats?.billPaymentProfit || 0}
              icon={<DollarSign className='h-4 w-4 text-green-500' />}
              valuePrefix='Rs '
              description={t('Service charges earned')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Bills Due Today')}
              value={stats?.billsDueToday || 0}
              icon={<Clock className='h-4 w-4 text-yellow-500' />}
              description={t('Pending bills due today')}
              isLoading={isLoading}
            />
            <StatCard
              title={t('Overdue Bills')}
              value={stats?.billsOverdue || 0}
              icon={<AlertCircle className='h-4 w-4 text-destructive' />}
              description={t('Bills past due date')}
              isLoading={isLoading}
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
            description={t('from last month')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Total Sales')}
            value={stats?.totalSales || 0}
            change={stats?.totalSalesChange}
            icon={<ShoppingCart className='h-4 w-4' />}
            description={t('from last month')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Inventory Value')}
            value={stats?.totalInventoryValue || 0}
            icon={<Package className='h-4 w-4' />}
            valuePrefix='Rs'
            description={t('Total stock value')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Low Stock Items')}
            value={stats?.lowStockCount || 0}
            icon={<AlertTriangle className='h-4 w-4 text-orange-500' />}
            description={`${stats?.outOfStockCount || 0} ${t('out of stock')}`}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Pending Invoices')}
            value={stats?.pendingInvoices || 0}
            icon={<FileText className='h-4 w-4' />}
            valuePrefix='Rs'
            description={`${t('Total')}: Rs${(stats?.pendingInvoicesAmount || 0).toLocaleString()}`}
            isLoading={isLoading}
          />
        </div>

        {/* Returns Summary */}
        <div className='grid gap-4 sm:grid-cols-2 mb-6'>
          <StatCard
            title={t('Sales Returns')}
            value={stats?.totalSalesReturns || 0}
            icon={<RefreshCcw className='h-4 w-4 text-red-500' />}
            valuePrefix='Rs '
            description={t('Total amount refunded to customers')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Purchase Returns')}
            value={stats?.totalPurchaseReturns || 0}
            icon={<RefreshCcw className='h-4 w-4 text-blue-500' />}
            valuePrefix='Rs '
            description={t('Total amount recovered from suppliers')}
            isLoading={isLoading}
          />
        </div>

        {/* Net figures after returns */}
        <div className='grid gap-4 sm:grid-cols-2 mb-6'>
          <StatCard
            title={t('Net Sales')}
            value={stats?.netSales || 0}
            icon={<ShoppingCart className='h-4 w-4 text-green-600' />}
            valuePrefix='Rs '
            description={t('Revenue after sales returns')}
            isLoading={isLoading}
          />
          <StatCard
            title={t('Net Purchases')}
            value={stats?.netPurchase || 0}
            icon={<Package className='h-4 w-4 text-orange-500' />}
            valuePrefix='Rs '
            description={t('Total purchases minus returns')}
            isLoading={isLoading}
          />
        </div>

        {/* Charts and Widgets */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-7 mb-6'>
          <RevenueChart />
          <LowStockWidget />
        </div>

        {/* Top Products and Customers */}
        <div className='grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6'>
          <TopProducts />
          <TopCustomers />
        </div>

        {/* Recent Activities */}
        <div className='grid grid-cols-1 gap-6'>
          <RecentActivities />
        </div>
      </Main>
    </>
  )
}

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
import { DollarSign, ShoppingCart, AlertTriangle, FileText, RefreshCcw } from 'lucide-react'

export default function Dashboard() {
  const { t } = useLanguage()
  const { data: stats, isLoading, refetch } = useGetDashboardStatsQuery()
  
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

        {/* Statistics Cards */}
        <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6'>
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

import { Link } from '@tanstack/react-router'
import { useCustomerColumns } from './components/users-columns'
import CustomerDialogs from './components/users-dialogs'
import CustomerPrimaryButtons from './components/users-primary-buttons'
import { CustomerCardGrid } from './components/customer-card-grid'
import { CustomerListToolbar } from './components/customer-list-toolbar'
import { QuickAddCustomerCard } from './components/quick-add-customer-card'
import { CustomerTable } from './components/users-table'
import CustomersProvider from './context/users-context'
import {
  getStoredCustomerListViewMode,
  storeCustomerListViewMode,
  type CustomerListViewMode,
} from './utils/customer-list-view'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { MessageSquare, Users, Wallet, UserPlus, Receipt, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkSmsDialog } from '@/components/sms/bulk-sms-dialog'
import { useBranchName } from '@/hooks/use-branch-name'
import { fetchCustomers } from '@/stores/customer.slice'
import { useGetCustomerStatsQuery } from '@/stores/customer.api'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { toneColor } from '@/lib/stat-card-tones'

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`

const SEARCH_DEBOUNCE_MS = 400

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState<CustomerListViewMode>(() => getStoredCustomerListViewMode())
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  const [bulkSmsOpen, setBulkSmsOpen] = useState(false)
  const branchName = useBranchName()
  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const columns = useCustomerColumns()
  const { data: stats, isLoading: isStatsLoading } = useGetCustomerStatsQuery()

  useEffect(() => {
    setViewMode(getStoredCustomerListViewMode())
  }, [])

  const handleViewModeChange = (mode: CustomerListViewMode) => {
    setViewMode(mode)
    storeCustomerListViewMode(mode)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit,
      sortBy: 'createdAt:desc',
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.customer } : {}),
    }
    dispatch(fetchCustomers(params)).then((data) => {
      setCustomers(data.payload?.results ?? [])
      setTotalPage(data.payload?.totalPages ?? 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dispatch, currentPage, limit, fetch, debouncedSearch])

  return (
    <CustomersProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
        <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
          <div>
            <h2 className='text-2xl font-bold mb-5 tracking-tight'>{t('customers_list')}</h2>
            <p className='text-muted-foreground'>
              {t('manage_customers')}
            </p>
          </div>
          <CustomerPrimaryButtons />
        </div>

        <div className='mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4'>
          <StatCard
            title={t('total_customers')}
            value={stats?.totalCustomers ?? 0}
            description={t('manage_customers')}
            icon={<Users />}
            tone='sky'
            isLoading={isStatsLoading}
          />
          <StatCard
            title={t('outstanding_balance')}
            value={fmtAmt(stats?.outstandingBalance)}
            description={t('Receivable')}
            icon={<Wallet />}
            tone='amber'
            isLoading={isStatsLoading}
          />
          <StatCard
            title={t('new_this_month')}
            value={stats?.newThisMonth ?? 0}
            description={t('customers_added_this_month')}
            icon={<UserPlus />}
            tone='emerald'
            isLoading={isStatsLoading}
          />
        </div>

        <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {viewMode === 'cards' ? (
              <>
                <CustomerListToolbar
                  searchInput={searchInput}
                  onSearchChange={setSearchInput}
                  viewMode={viewMode}
                  onViewModeChange={handleViewModeChange}
                  actions={
                    <Button variant="outline" size="sm" onClick={() => setBulkSmsOpen(true)}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {t('Send SMS')}
                    </Button>
                  }
                />
                <CustomerCardGrid
                  customers={customers}
                  loading={loading}
                  pagination={{
                    totalPage,
                    currentPage,
                    setCurrentPage,
                    limit,
                    setLimit: (n: number) => {
                      setLimit(n)
                      setCurrentPage(1)
                    },
                  }}
                />
              </>
            ) : (
              <CustomerTable
                data={customers}
                columns={columns}
                loading={loading}
                searchInput={searchInput}
                onSearchChange={setSearchInput}
                viewMode={viewMode}
                onViewModeChange={handleViewModeChange}
                actions={
                  <Button variant="outline" size="sm" onClick={() => setBulkSmsOpen(true)}>
                    <MessageSquare className="w-4 h-4 mr-2" />
                    {t('Send SMS')}
                  </Button>
                }
                paggination={{
                  totalPage,
                  currentPage,
                  setCurrentPage,
                  limit,
                  setLimit: (n: number) => {
                    setLimit(n)
                    setCurrentPage(1)
                  },
                }}
              />
            )}
          </div>

          <QuickAddCustomerCard setFetch={setFetch} />
        </div>

        <Link
          to='/accounting'
          search={{ tab: 'customers' }}
          className='mt-4 flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:shadow-md'
        >
          <span
            className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white'
            style={{ backgroundColor: toneColor('indigo') }}
          >
            <Receipt className='h-5 w-5' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold'>{t('customer_statement')}</p>
            <p className='truncate text-xs text-muted-foreground'>{t('customer_statement_desc')}</p>
          </div>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </Link>

        <CustomerDialogs setFetch={setFetch} />

        <BulkSmsDialog
          open={bulkSmsOpen}
          onOpenChange={setBulkSmsOpen}
          recipients={customers}
          entityType="customer"
          branchName={branchName}
        />
      </div>
    </CustomersProvider>
  )
}

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
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { MessageSquare, Users, Wallet, UserPlus, Receipt, ChevronRight, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { BulkSmsDialog } from '@/components/sms/bulk-sms-dialog'
import { BulkDeleteDialog } from './components/bulk-delete-dialog'
import { useBranchName } from '@/hooks/use-branch-name'
import { fetchCustomers, bulkUpdateCustomers } from '@/stores/customer.slice'
import { useGetCustomerStatsQuery } from '@/stores/customer.api'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { toneColor } from '@/lib/stat-card-tones'
import type { Customer } from './data/schema'
import { useFormatMoney } from '@/lib/format-money'

const SEARCH_DEBOUNCE_MS = 400
const ALL_STATUS = 'all'
// Active customers first, inactive last; newest-first within each group.
const CUSTOMERS_SORT_BY = 'isActive:desc,createdAt:desc'

// Hidden for now — re-enable by flipping this back to true.
const SHOW_QUICK_ADD_CUSTOMER = false

export default function Customers() {
  const fmtAmt = useFormatMoney()
  const [customers, setCustomers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState<CustomerListViewMode>(() => getStoredCustomerListViewMode())
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [selectedCustomers, setSelectedCustomers] = useState<Customer[]>([])
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null)

  const [bulkSmsOpen, setBulkSmsOpen] = useState(false)
  const branchName = useBranchName()
  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const { data: stats, isLoading: isStatsLoading } = useGetCustomerStatsQuery()

  // Re-sorts/re-navigates the list after a per-row Active toggle — see
  // active-toggle-cell.tsx. Deactivating moves a customer to the inactive group at the
  // end of the (unfiltered) list, so jump to the last page and briefly highlight the
  // row there — but only when no status filter would otherwise just remove it from view.
  const handleCustomerStatusChange = useCallback((customer: Customer, next: boolean) => {
    if (!next && statusFilter === ALL_STATUS) {
      const id = customer._id || customer.id || null
      setHighlightRowId(id)
      setCurrentPage(totalPage)
    }
    setFetch((prev) => !prev)
  }, [statusFilter, totalPage])
  const columns = useCustomerColumns(handleCustomerStatusChange)

  useEffect(() => {
    if (!highlightRowId) return
    const timeout = setTimeout(() => setHighlightRowId(null), 3000)
    return () => clearTimeout(timeout)
  }, [highlightRowId])

  useEffect(() => {
    setViewMode(getStoredCustomerListViewMode())
  }, [])

  const handleViewModeChange = (mode: CustomerListViewMode) => {
    setViewMode(mode)
    storeCustomerListViewMode(mode)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  useEffect(() => {
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit,
      sortBy: CUSTOMERS_SORT_BY,
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.customer } : {}),
      ...(statusFilter !== ALL_STATUS ? { isActive: statusFilter === 'active' } : {}),
    }
    dispatch(fetchCustomers(params)).then((data) => {
      setCustomers(data.payload?.results ?? [])
      setTotalPage(data.payload?.totalPages ?? 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dispatch, currentPage, limit, fetch, debouncedSearch, statusFilter])

  const handleSelectedRowsChange = useCallback((rows: Customer[]) => {
    setSelectedCustomers(rows)
  }, [])

  // Activate/deactivate every selected row in one call.
  const handleBulkSetActive = useCallback(async (isActive: boolean) => {
    if (selectedCustomers.length === 0) return
    setBulkStatusUpdating(true)
    try {
      const customersToUpdate = selectedCustomers.map((customer) => ({
        id: customer._id || customer.id || '',
        isActive,
      }))
      const result = await dispatch(bulkUpdateCustomers({ customers: customersToUpdate }))
      if (result.meta.requestStatus === 'fulfilled') {
        setSelectedCustomers([])
        if (!isActive && statusFilter === ALL_STATUS) {
          setCurrentPage(totalPage)
        }
        setFetch((prev) => !prev)
        toast.success(`${customersToUpdate.length} customer(s) ${isActive ? 'activated' : 'deactivated'}`)
      } else {
        throw new Error((result.payload as string) || 'Bulk status update failed')
      }
    } catch (error) {
      console.error('Bulk status update error:', error)
      toast.error('Failed to update customer status')
    } finally {
      setBulkStatusUpdating(false)
    }
  }, [selectedCustomers, statusFilter, totalPage, dispatch])

  const statusFilterSelect = (
    <Select value={statusFilter} onValueChange={setStatusFilter}>
      <SelectTrigger className='h-9 w-[150px]'>
        <SelectValue placeholder={t('All Status')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_STATUS}>{t('All Status')}</SelectItem>
        <SelectItem value='active'>{t('Active')}</SelectItem>
        <SelectItem value='inactive'>{t('Inactive')}</SelectItem>
      </SelectContent>
    </Select>
  )

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
          <div className='flex flex-wrap gap-2'>
            {viewMode === 'table' && selectedCustomers.length > 0 && (
              <>
                <Button
                  variant='outline'
                  disabled={bulkStatusUpdating}
                  onClick={() => handleBulkSetActive(true)}
                  className='space-x-1'
                >
                  <span>{t('Activate Selected')} ({selectedCustomers.length})</span>
                </Button>
                <Button
                  variant='outline'
                  disabled={bulkStatusUpdating}
                  onClick={() => handleBulkSetActive(false)}
                  className='space-x-1'
                >
                  <span>{t('Deactivate Selected')} ({selectedCustomers.length})</span>
                </Button>
                <Can permission='deleteCustomers'>
                  <Button
                    variant='destructive'
                    onClick={() => setBulkDeleteOpen(true)}
                    className='space-x-1'
                  >
                    <Trash2 size={16} />
                    <span>{t('delete_selected')} ({selectedCustomers.length})</span>
                  </Button>
                </Can>
              </>
            )}
            <CustomerPrimaryButtons />
          </div>
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
            value={fmtAmt(stats?.outstandingBalance ?? 0)}
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

        <div className={`grid grid-cols-1 items-start gap-4 ${SHOW_QUICK_ADD_CUSTOMER ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {viewMode === 'cards' ? (
              <>
                <CustomerListToolbar
                  searchInput={searchInput}
                  onSearchChange={setSearchInput}
                  viewMode={viewMode}
                  onViewModeChange={handleViewModeChange}
                  actions={
                    <>
                      {statusFilterSelect}
                      <Button variant="outline" size="sm" onClick={() => setBulkSmsOpen(true)}>
                        <MessageSquare className="w-4 h-4 mr-2" />
                        {t('Send SMS')}
                      </Button>
                    </>
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
                  <>
                    {statusFilterSelect}
                    <Button variant="outline" size="sm" onClick={() => setBulkSmsOpen(true)}>
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {t('Send SMS')}
                    </Button>
                  </>
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
                onSelectedRowsChange={handleSelectedRowsChange}
                highlightRowId={highlightRowId}
              />
            )}
          </div>

          {SHOW_QUICK_ADD_CUSTOMER && <QuickAddCustomerCard setFetch={setFetch} />}
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

        <BulkDeleteDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          customers={selectedCustomers}
          onDeleted={() => {
            setSelectedCustomers([])
            setFetch((prev) => !prev)
          }}
        />
      </div>
    </CustomersProvider>
  )
}

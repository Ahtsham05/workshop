import { Link } from '@tanstack/react-router'
import { useLanguage } from '@/context/language-context'
import { useSupplierColumns } from './components/users-columns'
import SupplierDialogs from './components/users-dialogs'
import SupplierPrimaryButtons from './components/users-primary-buttons'
import { SupplierCardGrid } from './components/supplier-card-grid'
import { SupplierListToolbar } from './components/supplier-list-toolbar'
import { QuickAddSupplierCard } from './components/quick-add-supplier-card'
import { SupplierTable } from './components/users-table'
import SupplierProvider from './context/users-context'
import {
  getStoredSupplierListViewMode,
  storeSupplierListViewMode,
  type SupplierListViewMode,
} from './utils/supplier-list-view'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { fetchSuppliers, fetchSupplierStats } from '@/stores/supplier.slice'
import { MessageSquare, Users, Wallet, UserPlus, Receipt, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { BulkSmsDialog } from '@/components/sms/bulk-sms-dialog'
import { useBranchName } from '@/hooks/use-branch-name'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { toneColor } from '@/lib/stat-card-tones'

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`

const SEARCH_DEBOUNCE_MS = 400

interface SupplierStats {
  totalSuppliers: number
  newThisMonth: number
  outstandingPayable: number
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState<SupplierListViewMode>(() => getStoredSupplierListViewMode())
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false)
  const branchName = useBranchName()
  const { t } = useLanguage()
  const columns = useSupplierColumns()

  const dispatch = useDispatch<AppDispatch>()

  const [stats, setStats] = useState<SupplierStats | undefined>(undefined)
  const [isStatsLoading, setIsStatsLoading] = useState(true)

  useEffect(() => {
    setViewMode(getStoredSupplierListViewMode())
  }, [])

  const handleViewModeChange = (mode: SupplierListViewMode) => {
    setViewMode(mode)
    storeSupplierListViewMode(mode)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const limitValue = parseInt(String(limit), 10) || 50
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit: limitValue,
      sortBy: 'createdAt:desc',
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.supplier } : {}),
    }

    dispatch(fetchSuppliers(params))
      .then((result) => {
        const data = result.payload as { results?: unknown[]; totalPages?: number } | undefined
        const results = data?.results || []
        setSuppliers(results as never[])
        setTotalPage(data?.totalPages || 1)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [dispatch, currentPage, limit, fetch, debouncedSearch])

  useEffect(() => {
    setIsStatsLoading(true)
    dispatch(fetchSupplierStats({}))
      .then((result) => {
        setStats(result.payload as SupplierStats | undefined)
        setIsStatsLoading(false)
      })
      .catch(() => setIsStatsLoading(false))
  }, [dispatch, fetch])

  return (
    <SupplierProvider>
        <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight mb-5'>{t('suppliers_list')}</h2>
            <p className='text-muted-foreground'>
              {t('manage_suppliers')}
            </p>
          </div>
          <SupplierPrimaryButtons />
        </div>

        <div className='mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4'>
          <StatCard
            title={t('total_suppliers')}
            value={stats?.totalSuppliers ?? 0}
            description={t('manage_suppliers')}
            icon={<Users />}
            tone='sky'
            isLoading={isStatsLoading}
          />
          <StatCard
            title={t('outstanding_payable')}
            value={fmtAmt(stats?.outstandingPayable)}
            description={t('Payable')}
            icon={<Wallet />}
            tone='amber'
            isLoading={isStatsLoading}
          />
          <StatCard
            title={t('new_this_month')}
            value={stats?.newThisMonth ?? 0}
            description={t('suppliers_added_this_month')}
            icon={<UserPlus />}
            tone='emerald'
            isLoading={isStatsLoading}
          />
        </div>

        <div className='grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'>
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {viewMode === 'cards' ? (
              <>
                <SupplierListToolbar
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
                <SupplierCardGrid
                  suppliers={suppliers}
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
              <SupplierTable
                data={suppliers}
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

          <QuickAddSupplierCard setFetch={setFetch} />
        </div>

        <Link
          to='/accounting'
          search={{ tab: 'suppliers' }}
          className='mt-4 flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-primary/50 hover:shadow-md'
        >
          <span
            className='inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white'
            style={{ backgroundColor: toneColor('indigo') }}
          >
            <Receipt className='h-5 w-5' />
          </span>
          <div className='min-w-0 flex-1'>
            <p className='text-sm font-semibold'>{t('supplier_statement')}</p>
            <p className='truncate text-xs text-muted-foreground'>{t('supplier_statement_desc')}</p>
          </div>
          <ChevronRight className='h-4 w-4 shrink-0 text-muted-foreground' />
        </Link>

      <SupplierDialogs setFetch={setFetch} />

      <BulkSmsDialog
        open={bulkSmsOpen}
        onOpenChange={setBulkSmsOpen}
        recipients={suppliers}
        entityType="supplier"
        branchName={branchName}
      />
    </SupplierProvider>
  )
}

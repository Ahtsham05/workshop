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
import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { fetchSuppliers, fetchSupplierStats, bulkUpdateSuppliers } from '@/stores/supplier.slice'
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
import { Can } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { toneColor } from '@/lib/stat-card-tones'
import { useFormatMoney } from '@/lib/format-money'
import type { Supplier } from './data/schema'

const SEARCH_DEBOUNCE_MS = 400
const ALL_STATUS = 'all'
// Active suppliers first, inactive last; newest-first within each group.
const SUPPLIERS_SORT_BY = 'isActive:desc,createdAt:desc'

// Hidden for now — re-enable by flipping this back to true.
const SHOW_QUICK_ADD_SUPPLIER = false

interface SupplierStats {
  totalSuppliers: number
  newThisMonth: number
  outstandingPayable: number
}

export default function Suppliers() {
  const fmtAmt = useFormatMoney()
  const [suppliers, setSuppliers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(50)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [viewMode, setViewMode] = useState<SupplierListViewMode>(() => getStoredSupplierListViewMode())
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [selectedSuppliers, setSelectedSuppliers] = useState<Supplier[]>([])
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null)
  const [bulkSmsOpen, setBulkSmsOpen] = useState(false)
  const branchName = useBranchName()
  const { t } = useLanguage()

  const dispatch = useDispatch<AppDispatch>()

  const [stats, setStats] = useState<SupplierStats | undefined>(undefined)
  const [isStatsLoading, setIsStatsLoading] = useState(true)

  // Re-sorts/re-navigates the list after a per-row Active toggle — see
  // active-toggle-cell.tsx. Deactivating moves a supplier to the inactive group at the
  // end of the (unfiltered) list, so jump to the last page and briefly highlight the
  // row there — but only when no status filter would otherwise just remove it from view.
  const handleSupplierStatusChange = useCallback((supplier: Supplier, next: boolean) => {
    if (!next && statusFilter === ALL_STATUS) {
      const id = supplier._id || supplier.id || null
      setHighlightRowId(id)
      setCurrentPage(totalPage)
    }
    setFetch((prev) => !prev)
  }, [statusFilter, totalPage])
  const columns = useSupplierColumns(handleSupplierStatusChange)

  useEffect(() => {
    if (!highlightRowId) return
    const timeout = setTimeout(() => setHighlightRowId(null), 3000)
    return () => clearTimeout(timeout)
  }, [highlightRowId])

  useEffect(() => {
    setViewMode(getStoredSupplierListViewMode())
  }, [])

  const handleViewModeChange = (mode: SupplierListViewMode) => {
    setViewMode(mode)
    storeSupplierListViewMode(mode)
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter])

  useEffect(() => {
    setLoading(true)
    const limitValue = parseInt(String(limit), 10) || 50
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit: limitValue,
      sortBy: SUPPLIERS_SORT_BY,
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.supplier } : {}),
      ...(statusFilter !== ALL_STATUS ? { isActive: statusFilter === 'active' } : {}),
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
  }, [dispatch, currentPage, limit, fetch, debouncedSearch, statusFilter])

  useEffect(() => {
    setIsStatsLoading(true)
    dispatch(fetchSupplierStats({}))
      .then((result) => {
        setStats(result.payload as SupplierStats | undefined)
        setIsStatsLoading(false)
      })
      .catch(() => setIsStatsLoading(false))
  }, [dispatch, fetch])

  const handleSelectedRowsChange = useCallback((rows: Supplier[]) => {
    setSelectedSuppliers(rows)
  }, [])

  // Activate/deactivate every selected row in one call.
  const handleBulkSetActive = useCallback(async (isActive: boolean) => {
    if (selectedSuppliers.length === 0) return
    setBulkStatusUpdating(true)
    try {
      const suppliersToUpdate = selectedSuppliers.map((supplier) => ({
        id: supplier._id || supplier.id || '',
        isActive,
      }))
      const result = await dispatch(bulkUpdateSuppliers({ suppliers: suppliersToUpdate }))
      if (result.meta.requestStatus === 'fulfilled') {
        setSelectedSuppliers([])
        if (!isActive && statusFilter === ALL_STATUS) {
          setCurrentPage(totalPage)
        }
        setFetch((prev) => !prev)
        toast.success(`${suppliersToUpdate.length} supplier(s) ${isActive ? 'activated' : 'deactivated'}`)
      } else {
        throw new Error((result.payload as string) || 'Bulk status update failed')
      }
    } catch (error) {
      console.error('Bulk status update error:', error)
      toast.error('Failed to update supplier status')
    } finally {
      setBulkStatusUpdating(false)
    }
  }, [selectedSuppliers, statusFilter, totalPage, dispatch])

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
    <SupplierProvider>
        <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
          <div>
            <h2 className='text-2xl font-bold tracking-tight mb-5'>{t('suppliers_list')}</h2>
            <p className='text-muted-foreground'>
              {t('manage_suppliers')}
            </p>
          </div>
          <div className='flex flex-wrap gap-2'>
            {viewMode === 'table' && selectedSuppliers.length > 0 && (
              <>
                <Button
                  variant='outline'
                  disabled={bulkStatusUpdating}
                  onClick={() => handleBulkSetActive(true)}
                  className='space-x-1'
                >
                  <span>{t('Activate Selected')} ({selectedSuppliers.length})</span>
                </Button>
                <Button
                  variant='outline'
                  disabled={bulkStatusUpdating}
                  onClick={() => handleBulkSetActive(false)}
                  className='space-x-1'
                >
                  <span>{t('Deactivate Selected')} ({selectedSuppliers.length})</span>
                </Button>
                <Can permission='deleteSuppliers'>
                  <Button
                    variant='destructive'
                    onClick={() => setBulkDeleteOpen(true)}
                    className='space-x-1'
                  >
                    <Trash2 size={16} />
                    <span>{t('delete_selected')} ({selectedSuppliers.length})</span>
                  </Button>
                </Can>
              </>
            )}
            <SupplierPrimaryButtons />
          </div>
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
            value={fmtAmt(stats?.outstandingPayable ?? 0)}
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

        <div className={`grid grid-cols-1 items-start gap-4 ${SHOW_QUICK_ADD_SUPPLIER ? 'lg:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {viewMode === 'cards' ? (
              <>
                <SupplierListToolbar
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

          {SHOW_QUICK_ADD_SUPPLIER && <QuickAddSupplierCard setFetch={setFetch} />}
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

      <BulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        suppliers={selectedSuppliers}
        onDeleted={() => {
          setSelectedSuppliers([])
          setFetch((prev) => !prev)
        }}
      />
    </SupplierProvider>
  )
}

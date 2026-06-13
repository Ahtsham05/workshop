import { useLanguage } from '@/context/language-context'
import { useSupplierColumns } from './components/users-columns'
import SupplierDialogs from './components/users-dialogs'
import SupplierPrimaryButtons from './components/users-primary-buttons'
import { SupplierCardGrid } from './components/supplier-card-grid'
import { SupplierListToolbar } from './components/supplier-list-toolbar'
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
import { fetchSuppliers } from '@/stores/supplier.slice'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'

const SEARCH_DEBOUNCE_MS = 400

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
  const { t } = useLanguage()
  const columns = useSupplierColumns()

  const dispatch = useDispatch<AppDispatch>()

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
        <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
          <SupplierListToolbar
            searchInput={searchInput}
            onSearchChange={setSearchInput}
            viewMode={viewMode}
            onViewModeChange={handleViewModeChange}
          />
          {viewMode === 'cards' ? (
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
          ) : (
            <SupplierTable
              data={suppliers}
              columns={columns}
              loading={loading}
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

      <SupplierDialogs setFetch={setFetch} />
    </SupplierProvider>
  )
}

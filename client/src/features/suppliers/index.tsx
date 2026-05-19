import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { useLanguage } from '@/context/language-context'
import { useSupplierColumns } from './components/users-columns'
import SupplierDialogs from './components/users-dialogs'
import SupplierPrimaryButtons from './components/users-primary-buttons'
import { SupplierTable } from './components/users-table'
import SupplierProvider from './context/users-context'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { fetchSuppliers } from '@/stores/supplier.slice'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'

const SEARCH_DEBOUNCE_MS = 400

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const { t } = useLanguage()
  const columns = useSupplierColumns()

  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const limitValue = parseInt(String(limit), 10) || 10
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
      <Header fixed>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <LanguageSwitch />
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>

      <Main>
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
          <SupplierTable
            data={suppliers}
            columns={columns}
            loading={loading}
            toolbarLeading={
              <Input
                autoFocus
                placeholder={t('search_suppliers')}
                className='h-9 w-full'
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                aria-label={t('search_suppliers')}
              />
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
        </div>
      </Main>

      <SupplierDialogs setFetch={setFetch} />
    </SupplierProvider>
  )
}

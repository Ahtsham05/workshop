import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { useLanguage } from '@/context/language-context'
import { useSupplierColumns } from './components/users-columns' // Adjusted for users
import SupplierDialogs from './components/users-dialogs' // Adjusted for users
import SupplierPrimaryButtons from './components/users-primary-buttons' // Adjusted for users
import { SupplierTable } from './components/users-table' // Adjusted for users
import SupplierProvider from './context/users-context' // Adjusted for suppliers
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useCallback, useEffect, useState } from 'react'
import { fetchSuppliers } from '@/stores/supplier.slice' // Adjusted to supplier slice
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([]) // Changed from customers to suppliers
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const { t } = useLanguage()
  const columns = useSupplierColumns()

  const dispatch = useDispatch<AppDispatch>()

  // Use a callback to fetch suppliers to allow manual fetching when needed
  const fetchSupplierData = useCallback(async (page = currentPage, pageLimit = limit, searchTerm = search) => {
    setLoading(true)
    
    // Convert limit to number to ensure it's properly passed to the API
    const limitValue = parseInt(String(pageLimit), 10) || 10;
    
    const params = {
      page: page,
      limit: limitValue,  // Make sure limit is passed as a number
      sortBy: 'createdAt:desc',
      ...(searchTerm && { search: searchTerm }),
      ...(searchTerm && { fieldName: 'name' })
    };
    
    console.log('Fetching suppliers with params:', params); // Debug log
    
    try {
      const result = await dispatch(fetchSuppliers(params));
      const data = result.payload;
      const results = data?.results || [];
      console.log(`Received ${results.length} suppliers from API with page size ${limitValue}`); // Debug log
      
      setSuppliers(results);
      setTotalPage(data?.totalPages || 1);
      setLoading(false);
      return results;
    } catch (error) {
      console.error('Error fetching suppliers:', error);
      setLoading(false);
      return [];
    }
  }, [dispatch]);

  // Handle page size change explicitly
  const handleLimitChange = useCallback((newLimit: number) => {
    console.log(`Changing page size to ${newLimit}`);
    setLimit(newLimit);
    setCurrentPage(1); // Reset to first page
    fetchSupplierData(1, newLimit, search);
  }, [fetchSupplierData, search]);

  // Handle page change explicitly
  const handlePageChange = useCallback((newPage: number) => {
    console.log(`Changing page to ${newPage}`);
    setCurrentPage(newPage);
    fetchSupplierData(newPage, limit, search);
  }, [fetchSupplierData, limit, search]);

  // Initial data fetch and when fetch flag changes
  useEffect(() => {
    fetchSupplierData();
  }, [fetch]) // Only depends on the fetch flag for manual refreshes

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
        <Input
          placeholder={t('search_suppliers')}
          className='h-8 w-[150px] lg:w-[250px]'
          value={search ?? ''}
          onChange={(event) => {
            const newSearch = event.target.value;
            setSearch(newSearch);
            // Reset to first page and use the new search term
            setCurrentPage(1);
            fetchSupplierData(1, limit, newSearch);
          }}
        />
        <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
          {
            loading ? (
              <div className='flex h-[50vh] items-center justify-center'>
                <Loader2 className='animate-spin size-8' />
                <span className="sr-only">{t('loading')}</span>
              </div>
            ) : (
              <SupplierTable
                data={suppliers}
                columns={columns}
                paggination={{ 
                  totalPage, 
                  currentPage, 
                  setCurrentPage: handlePageChange, 
                  limit, 
                  setLimit: handleLimitChange 
                }}
              />
            )
          }
        </div>
      </Main>

      <SupplierDialogs setFetch={setFetch} />
    </SupplierProvider>
  )
}

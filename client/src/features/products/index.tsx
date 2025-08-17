import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { useProductColumns } from './components/users-columns' // Updated to use hook
import ProductDialogs from './components/users-dialogs' // Adjusted for products
import ProductPrimaryButtons from './components/users-primary-buttons' // Adjusted for products
import { ProductTable } from './components/users-table' // Adjusted for products
import ProductsProvider from './context/users-context' // Adjusted for products
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { fetchProducts } from '@/stores/product.slice'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'

export default function Products() {
  // Parse product list
  const [products, setProducts] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const columns = useProductColumns() // Get columns with translations

  useEffect(() => {
    setLoading(true)
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(search && { search: search }), // Only include 'name' if search exists
      ...(search && { fieldName: 'name' })
    };
    dispatch(fetchProducts(params)).then((data) => {
      setProducts(data.payload?.results)
      setTotalPage(data.payload?.totalPages)
      setLimit(data.payload?.limit)
      setLoading(false)
    })
    // }, [totalPage, currentPage, limit])
  }, [totalPage, currentPage, limit, fetch, search])

  return (
    <ProductsProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
        <Header fixed>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>

        <Main>
          <div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>{t('products_list')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_products')}
              </p>
            </div>
            <ProductPrimaryButtons />
          </div>
          <Input
            placeholder={t('search_products')}
            className='h-8 w-[150px] lg:w-[250px]'
            value={search ?? ''}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {
              loading ? (
                <div className='flex h-[50vh] items-center justify-center'><Loader2 className='animate-spin size-8' /></div>
              ) : (
                <ProductTable
                  data={products}
                  columns={columns}
                  paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
                />
              )
            }
          </div>
        </Main>

        <ProductDialogs setFetch={setFetch} />
      </div>
    </ProductsProvider>
  )
}

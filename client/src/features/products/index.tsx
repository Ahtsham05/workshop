import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { columns } from './components/users-columns' // Adjusted for products
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
            <h2 className='text-2xl font-bold tracking-tight'>Products List</h2>
            <p className='text-muted-foreground'>
              Manage your Products here.
            </p>
          </div>
          <ProductPrimaryButtons />
        </div>
        <Input
          placeholder='Search products...'
          className='h-8 w-[150px] lg:w-[250px]'
          value={
            search ?? ''
          }
          onChange={(event) =>
            setSearch(event.target.value)
          } 
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
    </ProductsProvider>
  )
}

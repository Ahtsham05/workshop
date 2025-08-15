import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { columns } from './components/users-columns' // Adjusted for users
import SupplierDialogs from './components/users-dialogs' // Adjusted for users
import SupplierPrimaryButtons from './components/users-primary-buttons' // Adjusted for users
import { PurchaseTable } from './components/users-table' // Adjusted for users
import SupplierProvider from './context/users-context' // Adjusted for suppliers
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { fetchPurchases } from '@/stores/purchase.slice'

export default function Purchase() {
  const [purchase, setPurchase] = useState([]) // Changed from customers to Purchase
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('INV-')

  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    setLoading(true)
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(search && { search: search }),
      ...(search && { fieldName: 'invoiceNumber' })
    };
    dispatch(fetchPurchases(params)).then((data) => {
      setPurchase(data.payload?.results) 
      setTotalPage(data.payload?.totalPages)
      setLimit(data.payload?.limit)
      setLoading(false)
    })
  }, [totalPage, currentPage, limit, fetch, search])

  return (
    <SupplierProvider>
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
            <h2 className='text-2xl font-bold tracking-tight'>Purchase List</h2>
            <p className='text-muted-foreground'>
              Manage your Purchase here.
            </p>
          </div>
          <SupplierPrimaryButtons />
        </div>
        <Input
          placeholder='Search purchase INV-...'
          className='h-8 w-[150px] lg:w-[250px]'
          value={search ?? ''}
          onChange={(event) => setSearch(event.target.value)}
        />
        <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
          {
            loading ? (
              <div className='flex h-[50vh] items-center justify-center'><Loader2 className='animate-spin size-8' /></div>
            ) : (
              <PurchaseTable
                data={purchase}
                columns={columns}
                paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
              />
            )
          }
        </div>
      </Main>

      <SupplierDialogs setFetch={setFetch} />
    </SupplierProvider>
  )
}

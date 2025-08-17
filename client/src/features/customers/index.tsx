import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { useCustomerColumns } from './components/users-columns' // Updated to use hook
import CustomerDialogs from './components/users-dialogs' // Adjusted for users
import CustomerPrimaryButtons from './components/users-primary-buttons' // Adjusted for users
import { CustomerTable } from './components/users-table' // Adjusted for customers
import CustomersProvider from './context/users-context' // Adjusted for customers
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { useEffect, useState } from 'react'
import { fetchCustomers } from '@/stores/customer.slice'
import { Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'

export default function Customers() {
  const [customers, setCustomers] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const columns = useCustomerColumns() // Get columns with translations

  useEffect(() => {
    setLoading(true)
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(search && { search: search }),
      ...(search && { fieldName: 'name' })
    };
    dispatch(fetchCustomers(params)).then((data) => {
      setCustomers(data.payload?.results)
      setTotalPage(data.payload?.totalPages)
      setLimit(data.payload?.limit)
      setLoading(false)
    })
  }, [totalPage, currentPage, limit, fetch, search])

  return (
    <CustomersProvider>
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
              <h2 className='text-2xl font-bold tracking-tight'>{t('customers_list')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_customers')}
              </p>
            </div>
            <CustomerPrimaryButtons />
          </div>
          <Input
            placeholder={t('search_customers')}
            className='h-8 w-[150px] lg:w-[250px]'
            value={search ?? ''}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {
              loading ? (
                <div className='flex h-[50vh] items-center justify-center'><Loader2 className='animate-spin size-8' /></div>
              ) : (
                <CustomerTable
                  data={customers}
                  columns={columns}
                  paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
                />
              )
            }
          </div>
        </Main>

        <CustomerDialogs setFetch={setFetch} />
      </div>
    </CustomersProvider>
  )
}

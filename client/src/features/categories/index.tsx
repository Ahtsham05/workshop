import { useEffect, useState } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchCategories } from '@/stores/category.slice'
import { CategoriesProvider } from './context/categories-context'
import { CategoriesTable } from './components/categories-table'
import { CategoriesActionDialog } from './components/categories-action-dialog'
import { CategoriesDeleteDialog } from './components/categories-delete-dialog'
import CategoriesPrimaryButtons from './components/categories-primary-buttons'
import { useLanguage } from '@/context/language-context'
import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { Input } from '@/components/ui/input'
import { Loader2 } from 'lucide-react'

export default function CategoriesIndex() {
  const { t, language } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  
  // State management similar to products
  const [categories, setCategories] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    setLoading(true)
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(search && { search: search }),
      ...(search && { fieldName: 'name' })
    }
    
    dispatch(fetchCategories(params)).then((data) => {
      setCategories(data.payload?.results || [])
      setTotalPage(data.payload?.totalPages || 1)
      setLimit(data.payload?.limit || 10)
      setLoading(false)
    })
  }, [totalPage, currentPage, limit, fetch, search, dispatch])

  return (
    <CategoriesProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
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
              <h2 className='text-2xl font-bold mb-5 tracking-tight'>{t('categories')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_product_categories')}
              </p>
            </div>
            <CategoriesPrimaryButtons />
          </div>
          
          <Input
            placeholder={t('search_categories')}
            className='h-8 w-[150px] lg:w-[250px]'
            value={search ?? ''}
            onChange={(event) => setSearch(event.target.value)}
          />
          
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            {loading ? (
              <div className='flex h-[50vh] items-center justify-center'>
                <Loader2 className='animate-spin size-8' />
              </div>
            ) : (
              <CategoriesTable 
                categories={categories}
                paggination={{ totalPage, currentPage, setCurrentPage, limit, setLimit }}
              />
            )}
          </div>
        </Main>

        {/* Dialogs */}
        <CategoriesActionDialog setFetch={setFetch} />
        <CategoriesDeleteDialog setFetch={setFetch} />
      </div>
    </CategoriesProvider>
  )
}

import { useEffect, useState } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { fetchAllCategories } from '@/stores/category.slice'
import { fetchSubCategories } from '@/stores/subCategory.slice'
import { SubCategoriesProvider, useSubCategories } from './context/subcategories-context'
import { SubCategoriesTable } from './components/subcategories-table'
import { SubCategoriesActionDialog } from './components/subcategories-action-dialog'
import { SubCategoriesDeleteDialog } from './components/subcategories-delete-dialog'
import SubCategoriesPrimaryButtons from './components/subcategories-primary-buttons'
import { useLanguage } from '@/context/language-context'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { FolderTree, Layers } from 'lucide-react'
import { Link } from '@tanstack/react-router'

const SEARCH_DEBOUNCE_MS = 400

function SubCategoriesHeader({ totalCount, categoryCount }: { totalCount: number; categoryCount: number }) {
  const { t } = useLanguage()
  const { state } = useSubCategories()

  return (
    <div className='mb-2 flex flex-wrap items-center justify-between gap-y-3 space-y-2'>
      <div>
        <div className='mb-2 flex flex-wrap items-center gap-3'>
          <h2 className='text-2xl font-bold tracking-tight'>{t('subcategories')}</h2>
          <span className='inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary'>
            <FolderTree className='h-3 w-3' />
            {t('subcategories_count_badge', { count: totalCount })}
          </span>
          {categoryCount > 0 && (
            <span className='inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground'>
              <Layers className='h-3 w-3' />
              {t('categories_count_badge', { count: categoryCount })}
            </span>
          )}
        </div>
        <p className='text-muted-foreground'>
          {t('manage_product_subcategories')}
        </p>
      </div>
      <SubCategoriesPrimaryButtons hasCategories={categoryCount > 0} defaultCategoryId={state.defaultCategoryId} />
    </div>
  )
}

function SubCategoriesContent() {
  const { t, language } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { dispatch: contextDispatch } = useSubCategories()
  const categories = useSelector((state: RootState) => state.category.categories)

  const [subCategories, setSubCategories] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<string>('all')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)

  useEffect(() => {
    dispatch(fetchAllCategories({}))
  }, [dispatch])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, categoryFilter])

  useEffect(() => {
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.category } : {}),
      ...(categoryFilter !== 'all' ? { category: categoryFilter } : {}),
    }

    dispatch(fetchSubCategories(params)).then((data: any) => {
      setSubCategories(data.payload?.results || [])
      setTotalPage(data.payload?.totalPages || 1)
      setTotalResults(data.payload?.totalResults ?? data.payload?.results?.length ?? 0)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dispatch, currentPage, limit, fetch, debouncedSearch, categoryFilter])

  const handleOpenAddDialog = () => {
    contextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
    contextDispatch({ type: 'SET_DEFAULT_CATEGORY_ID', payload: categoryFilter !== 'all' ? categoryFilter : null })
    contextDispatch({ type: 'SET_OPEN', payload: true })
  }

  return (
    <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
      <SubCategoriesHeader totalCount={totalResults} categoryCount={categories.length} />

      <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
        {categories.length === 0 && !loading ? (
          <div className='flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed py-16 text-center'>
            <div className='flex h-14 w-14 items-center justify-center rounded-full bg-primary/10'>
              <Layers className='h-7 w-7 text-primary/70' />
            </div>
            <p className='font-medium'>{t('no_categories_yet_title')}</p>
            <p className='max-w-sm text-sm text-muted-foreground'>{t('no_categories_yet_hint')}</p>
            <Link to='/categories' className='text-sm font-medium text-primary underline underline-offset-4'>
              {t('go_to_categories')}
            </Link>
          </div>
        ) : (
          <SubCategoriesTable
            subCategories={subCategories}
            loading={loading}
            hasCategories={categories.length > 0}
            onAddClick={handleOpenAddDialog}
            toolbarLeading={
              <>
                <Input
                  autoFocus
                  placeholder={t('search_subcategories')}
                  className='h-9 w-full max-w-xs'
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  aria-label={t('search_subcategories')}
                />
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className='h-9 w-full max-w-[200px]'>
                    <SelectValue placeholder={t('filter_by_category')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>{t('all_categories')}</SelectItem>
                    {categories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
          />
        )}
      </div>

      <SubCategoriesActionDialog setFetch={setFetch} categories={categories} />
      <SubCategoriesDeleteDialog setFetch={setFetch} />
    </div>
  )
}

export default function SubCategoriesIndex() {
  return (
    <SubCategoriesProvider>
      <SubCategoriesContent />
    </SubCategoriesProvider>
  )
}

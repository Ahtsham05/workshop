import { useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchCategories } from '@/stores/category.slice'
import { CategoriesProvider } from './context/categories-context'
import { CategoriesTable } from './components/categories-table'
import { CategoriesActionDialog } from './components/categories-action-dialog'
import { CategoriesDeleteDialog } from './components/categories-delete-dialog'
import CategoriesPrimaryButtons from './components/categories-primary-buttons'
import { useLanguage } from '@/context/language-context'
import { Input } from '@/components/ui/input'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'

const SEARCH_DEBOUNCE_MS = 400

export default function CategoriesIndex() {
  const { t, language } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  
  const [categories, setCategories] = useState([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [allSubCategories, setAllSubCategories] = useState<Array<{ id: string; name: string; category: { id?: string } | string }>>([])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  // Fetched directly (not via the redux thunk) so it doesn't overwrite the global
  // sub-category list that the Sub Categories page and product form pickers rely on.
  useEffect(() => {
    let cancelled = false
    Axios(summery.fetchAllSubCategories)
      .then((response) => {
        if (!cancelled) setAllSubCategories(response.data?.results || response.data || [])
      })
      .catch(() => {
        if (!cancelled) setAllSubCategories([])
      })
    return () => {
      cancelled = true
    }
  }, [fetch])

  const subCategoriesByCategory = useMemo(() => {
    const map: Record<string, Array<{ id: string; name: string }>> = {}
    for (const sub of allSubCategories) {
      const categoryId = typeof sub.category === 'object' ? sub.category?.id : sub.category
      if (!categoryId) continue
      if (!map[categoryId]) map[categoryId] = []
      map[categoryId].push({ id: sub.id, name: sub.name })
    }
    return map
  }, [allSubCategories])

  useEffect(() => {
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: 'createdAt:desc',
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.category } : {}),
    }
    
    dispatch(fetchCategories(params)).then((data) => {
      setCategories(data.payload?.results || [])
      setTotalPage(data.payload?.totalPages || 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dispatch, currentPage, limit, fetch, debouncedSearch])

  return (
    <CategoriesProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
<div className='mb-2 flex flex-wrap items-center justify-between space-y-2'>
            <div>
              <h2 className='text-2xl font-bold mb-5 tracking-tight'>{t('categories')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_product_categories')}
              </p>
            </div>
            <CategoriesPrimaryButtons />
          </div>
          
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            <CategoriesTable
              categories={categories}
              loading={loading}
              subCategoriesByCategory={subCategoriesByCategory}
              toolbarLeading={
                <Input
                  autoFocus
                  placeholder={t('search_categories')}
                  className='h-9 w-full'
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  aria-label={t('search_categories')}
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

        <CategoriesActionDialog setFetch={setFetch} />
        <CategoriesDeleteDialog setFetch={setFetch} />
      </div>
    </CategoriesProvider>
  )
}

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchCategories, Category } from '@/stores/category.slice'
import { fetchSubCategories, SubCategory } from '@/stores/subCategory.slice'
import { CategoriesProvider } from './context/categories-context'
import { CategoriesTable } from './components/categories-table'
import { CategoriesActionDialog } from './components/categories-action-dialog'
import { CategoriesDeleteDialog } from './components/categories-delete-dialog'
import { CategoryImportDialog } from './components/category-import-dialog'
import { BulkDeleteDialog } from './components/bulk-delete-dialog'
import CategoriesPrimaryButtons from './components/categories-primary-buttons'
import { SubCategoriesProvider, useSubCategories } from '@/features/subcategories/context/subcategories-context'
import { SubCategoriesTable } from '@/features/subcategories/components/subcategories-table'
import { SubCategoriesActionDialog } from '@/features/subcategories/components/subcategories-action-dialog'
import { SubCategoriesDeleteDialog } from '@/features/subcategories/components/subcategories-delete-dialog'
import { SubCategoryImportDialog } from '@/features/subcategories/components/subcategory-import-dialog'
import { BulkDeleteDialog as SubCategoriesBulkDeleteDialog } from '@/features/subcategories/components/bulk-delete-dialog'
import SubCategoriesPrimaryButtons from '@/features/subcategories/components/subcategories-primary-buttons'
import { useLanguage } from '@/context/language-context'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Can } from '@/context/permission-context'
import { FolderTree, Trash2, X } from 'lucide-react'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'

const SEARCH_DEBOUNCE_MS = 400
// Active sub-categories first, inactive last (like Products' isActive:desc sort) —
// newest-first within each group.
const SUBCATEGORIES_SORT_BY = 'isActive:desc,createdAt:desc'

/** Sub-categories of whichever category is selected in the master table above — a real
 *  master-detail view (browse + add/edit/delete/import sub-categories inline) instead of
 *  the old separate /sub-categories page. Needs SubCategoriesProvider from the parent. */
function CategoryDetailPane({
  category,
  onClose,
  fetch,
  setFetch,
}: {
  category: Category
  onClose: () => void
  fetch: boolean
  setFetch: (updater: boolean | ((prev: boolean) => boolean)) => void
}) {
  const { dispatch: subCategoryContextDispatch } = useSubCategories()
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()

  const [subCategories, setSubCategories] = useState<SubCategory[]>([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [selectedSubCategories, setSelectedSubCategories] = useState<SubCategory[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)

  // A new search query starts the detail list over from page 1 — switching which
  // category is selected already gets a fresh page 1 for free via this component's
  // `key={category.id}` in the parent, which remounts (and so resets) all state below.
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  useEffect(() => {
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit,
      sortBy: SUBCATEGORIES_SORT_BY,
      category: category.id,
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.category } : {}),
    }
    dispatch(fetchSubCategories(params))
      .then((data: any) => {
        setSubCategories(data.payload?.results || [])
        setTotalPage(data.payload?.totalPages || 1)
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [dispatch, category.id, currentPage, limit, fetch, debouncedSearch])

  const handleAddSubCategory = useCallback(() => {
    subCategoryContextDispatch({ type: 'SET_SUBCATEGORY', payload: null })
    subCategoryContextDispatch({ type: 'SET_DEFAULT_CATEGORY_ID', payload: category.id })
    subCategoryContextDispatch({ type: 'SET_OPEN', payload: true })
  }, [subCategoryContextDispatch, category.id])

  return (
    <div className='mt-6 rounded-xl border bg-muted/10 p-4'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-2'>
        <div className='flex items-center gap-2.5'>
          <span className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary'>
            <FolderTree className='h-4 w-4' />
          </span>
          <div>
            <h3 className='font-semibold leading-tight'>{t('Sub-categories of')} {category.name}</h3>
            <p className='text-xs text-muted-foreground'>{t('manage_product_subcategories')}</p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <SubCategoriesPrimaryButtons hasCategories defaultCategoryId={category.id} />
          <Button variant='ghost' size='icon' className='h-9 w-9' onClick={onClose} aria-label={t('close')}>
            <X className='h-4 w-4' />
          </Button>
        </div>
      </div>

      <SubCategoriesTable
        subCategories={subCategories}
        loading={loading}
        hasCategories
        onAddClick={handleAddSubCategory}
        toolbarLeading={
          <Input
            placeholder={t('search_subcategories')}
            className='h-9 w-full max-w-xs'
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            aria-label={t('search_subcategories')}
          />
        }
        toolbarTrailing={
          selectedSubCategories.length > 0 && (
            <Can permission='deleteCategories'>
              <Button variant='destructive' onClick={() => setBulkDeleteOpen(true)} className='space-x-1'>
                <Trash2 size={16} />
                <span>{t('delete_selected')} ({selectedSubCategories.length})</span>
              </Button>
            </Can>
          )
        }
        onSelectedRowsChange={setSelectedSubCategories}
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

      <SubCategoriesBulkDeleteDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        subCategories={selectedSubCategories}
        onDeleted={() => {
          setSelectedSubCategories([])
          setFetch((prev) => !prev)
        }}
      />
    </div>
  )
}

export default function CategoriesIndex() {
  const { t, language } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()

  const [categories, setCategories] = useState<Category[]>([])
  const [totalPage, setTotalPage] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [allSubCategories, setAllSubCategories] = useState<Array<{ id: string; name: string; category: { id?: string } | string }>>([])
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([])
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  // The category currently shown in the sub-categories detail pane below the table —
  // this IS the master-detail view: null means no category picked yet.
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
  const handleSelectedRowsChange = useCallback((rows: Category[]) => {
    setSelectedCategories(rows)
  }, [])
  const handleSelectCategory = useCallback((category: Category) => {
    setSelectedCategoryId((prev) => (prev === category.id ? null : category.id))
  }, [])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch])

  // Fetched directly (not via the redux thunk) so it doesn't overwrite the global
  // sub-category list that the product form pickers rely on.
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
      // Active categories first, inactive last (like Products' isActive:desc sort) —
      // newest-first within each group.
      sortBy: 'isActive:desc,createdAt:desc',
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.category } : {}),
    }

    dispatch(fetchCategories(params)).then((data) => {
      setCategories(data.payload?.results || [])
      setTotalPage(data.payload?.totalPages || 1)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [dispatch, currentPage, limit, fetch, debouncedSearch])

  const selectedCategory = selectedCategoryId ? categories.find((c) => c.id === selectedCategoryId) : undefined

  return (
    <CategoriesProvider>
      <SubCategoriesProvider>
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
              selectedCategoryId={selectedCategoryId}
              onSelectCategory={handleSelectCategory}
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
              toolbarTrailing={
                selectedCategories.length > 0 && (
                  <Can permission='deleteCategories'>
                    <Button
                      variant='destructive'
                      onClick={() => setBulkDeleteOpen(true)}
                      className='space-x-1'
                    >
                      <Trash2 size={16} />
                      <span>{t('delete_selected')} ({selectedCategories.length})</span>
                    </Button>
                  </Can>
                )
              }
              onSelectedRowsChange={handleSelectedRowsChange}
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

            {selectedCategory && (
              <CategoryDetailPane
                key={selectedCategory.id}
                category={selectedCategory}
                onClose={() => setSelectedCategoryId(null)}
                fetch={fetch}
                setFetch={setFetch}
              />
            )}
          </div>

        <CategoriesActionDialog setFetch={setFetch} />
        <CategoriesDeleteDialog setFetch={setFetch} />
        <CategoryImportDialog setFetch={setFetch} />
        <SubCategoriesActionDialog setFetch={setFetch} categories={categories} />
        <SubCategoriesDeleteDialog setFetch={setFetch} />
        <SubCategoryImportDialog setFetch={setFetch} />
        <BulkDeleteDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          categories={selectedCategories}
          onDeleted={() => {
            setSelectedCategories([])
            setFetch((prev) => !prev)
          }}
        />
      </div>
      </SubCategoriesProvider>
    </CategoriesProvider>
  )
}

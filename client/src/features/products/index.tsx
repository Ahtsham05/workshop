import { useProductColumns } from './components/users-columns' // Updated to use hook
import ProductDialogs from './components/users-dialogs' // Adjusted for products
import ProductPrimaryButtons from './components/users-primary-buttons' // Adjusted for products
import { ProductTable } from './components/users-table' // Adjusted for products
import ProductsProvider, { useUsers } from './context/users-context' // Adjusted for products
import { LowStockAlert } from './components/low-stock-alert'
import { LowStockDetails } from './components/low-stock-details'
import { ImportBranchProductsBanner } from './components/import-branch-products-banner'
import { ProductStatCards } from './components/product-stat-cards'
import { CategoryFilterCombobox, NO_CATEGORY_FILTER, ALL_CATEGORIES_BREAKDOWN, UNCATEGORIZED_CATEGORY } from './components/category-filter-combobox'
import { CategoryBreakdown, type CategoryBreakdownRow } from './components/category-breakdown'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { fetchProducts, bulkUpdateProducts, fetchProductStats, fetchCategoryBreakdown } from '@/stores/product.slice'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { fetchCategories } from '@/stores/category.slice'
import { Input } from '@/components/ui/input'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Can } from '@/context/permission-context'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Edit, Package, Boxes, Wallet, CircleDollarSign, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'
import { getDisplayStock, getDisplayStockValue } from '@/lib/product-stock-display'
import { BulkDeleteDialog } from './components/bulk-delete-dialog'

const SEARCH_DEBOUNCE_MS = 400
const ALL_STATUS = 'all'
// Active products first, inactive last; newest-first within each group.
const PRODUCTS_SORT_BY = 'isActive:desc,createdAt:desc'

export default function Products() {
  // Parse product list
  const [products, setProducts] = useState<any[]>([])
  const [allProducts, setAllProducts] = useState<any[]>([]) // Store all products for low stock alert
  const [totalPage, setTotalPage] = useState(1)
  const [totalResults, setTotalResults] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [fetch, setFetch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loadingAllProducts, setLoadingAllProducts] = useState(true)
  const [productStats, setProductStats] = useState<{ totalProducts: number; totalStockQuantity: number; totalStockValue: number } | null>(null)
  const [loadingStats, setLoadingStats] = useState(true)
  const [searchInput, setSearchInput] = useState('')
  const debouncedSearch = useDebouncedValue(searchInput, SEARCH_DEBOUNCE_MS)
  const [selectedProducts, setSelectedProducts] = useState<any[]>([])
  const [inlineEditMode, setInlineEditMode] = useState(false)
  const [editValues, setEditValues] = useState<Record<string, { price?: number; cost?: number; stockQuantity?: number }>>({})
  const [showLowStockDetails, setShowLowStockDetails] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState(10)
  const [categoryFilter, setCategoryFilter] = useState(NO_CATEGORY_FILTER)
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownRow[]>([])
  const [loadingCategoryBreakdown, setLoadingCategoryBreakdown] = useState(false)

  const isBreakdownMode = categoryFilter === ALL_CATEGORIES_BREAKDOWN
  // A real category id — not the "no filter" or "breakdown" sentinels.
  const isSingleCategorySelected = categoryFilter !== NO_CATEGORY_FILTER && categoryFilter !== ALL_CATEGORIES_BREAKDOWN

  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  // Re-sorts the current page (active-first/inactive-last) after a per-row Active
  // toggle — that switch flips instantly on its own but has no way to move the row
  // without this, see active-toggle-cell.tsx.
  const handleProductStatusChange = useCallback(() => setFetch((prev) => !prev), [])
  const columns = useProductColumns(lowStockThreshold, handleProductStatusChange) // Get columns with translations
  const { categories } = useSelector((state: RootState) => state.category)

  // Fetch categories once when products page loads
  useEffect(() => {
    dispatch(fetchCategories({ page: 1, limit: 100 }))
  }, [dispatch])

  // Fetch ALL products for low stock alert (runs once on mount and when fetch changes)
  useEffect(() => {
    setLoadingAllProducts(true)
    dispatch(fetchProducts({ page: 1, limit: 1000, sortBy: PRODUCTS_SORT_BY }))
      .then((data) => {
        if (data.payload?.results) {
          setAllProducts(data.payload.results)
        }
        setLoadingAllProducts(false)
      })
      .catch((error) => {
        console.error('Error fetching all products:', error)
        setLoadingAllProducts(false)
      })
  }, [fetch, dispatch])

  // Header badge totals (total product count, total stock quantity, total stock
  // value) — computed by the database over the WHOLE catalog (or just the selected
  // category, when one is chosen), not derived from `allProducts` above, which is
  // capped at 1000 rows and would silently under-report once the catalog grows past that.
  useEffect(() => {
    setLoadingStats(true)
    dispatch(fetchProductStats(isSingleCategorySelected ? { category: categoryFilter } : {}))
      .then((data) => {
        if (data.payload) {
          setProductStats(data.payload)
        }
        setLoadingStats(false)
      })
      .catch((error) => {
        console.error('Error fetching product stats:', error)
        setLoadingStats(false)
      })
  }, [fetch, dispatch, categoryFilter, isSingleCategorySelected])

  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, categoryFilter, statusFilter])

  // Fetch paginated products for table display — skipped in breakdown mode, which
  // shows the per-category rollup instead of the flat table.
  useEffect(() => {
    if (isBreakdownMode) return
    setLoading(true)
    const q = debouncedSearch.trim()
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: PRODUCTS_SORT_BY,
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.product } : {}),
      ...(isSingleCategorySelected ? { category: categoryFilter } : {}),
      ...(statusFilter !== ALL_STATUS ? { isActive: statusFilter === 'active' } : {}),
    };

    dispatch(fetchProducts(params))
        .then((data) => {
        if (data.payload?.results) {
          setProducts(data.payload.results)
          setTotalPage(data.payload.totalPages || 1)
          setTotalResults(data.payload.totalResults || 0)
        } else {
          setProducts([])
          setTotalPage(1)
          setTotalResults(0)
        }
        setLoading(false)
      })
      .catch((error) => {
        console.error('Error fetching products:', error)
        setProducts([])
        setTotalPage(1)
        setTotalResults(0)
        setLoading(false)
        toast.error('Failed to fetch products')
      })
  }, [currentPage, limit, fetch, debouncedSearch, categoryFilter, statusFilter, dispatch, isBreakdownMode, isSingleCategorySelected])

  // Category-wise rollup for the "All Categories" breakdown view — fetched only while
  // that mode is active.
  useEffect(() => {
    if (!isBreakdownMode) return
    setLoadingCategoryBreakdown(true)
    dispatch(fetchCategoryBreakdown())
      .then((data) => {
        setCategoryBreakdown(data.payload?.data || [])
        setLoadingCategoryBreakdown(false)
      })
      .catch((error) => {
        console.error('Error fetching category breakdown:', error)
        setCategoryBreakdown([])
        setLoadingCategoryBreakdown(false)
        toast.error('Failed to fetch category breakdown')
      })
  }, [isBreakdownMode, fetch, dispatch])

  // Handle bulk product update with individual values
  const handleBulkUpdate = useCallback(async () => {
    try {
      const hasUpdates = Object.values(editValues).some(values => 
        values.price !== undefined || values.cost !== undefined || values.stockQuantity !== undefined
      )
      
      if (!hasUpdates) {
        toast.error(t('enter_at_least_one_value'))
        return
      }

      // Prepare products array for bulk update API
      const productsToUpdate = selectedProducts.map((product: any) => {
        const productId = product._id || product.id || ''
        const updates = editValues[productId] || {}
        
        if (Object.keys(updates).length === 0) return null
        
        return {
          id: productId,
          ...(updates.price !== undefined && { price: updates.price }),
          ...(updates.cost !== undefined && { cost: updates.cost }),
          ...(updates.stockQuantity !== undefined && { stockQuantity: updates.stockQuantity }),
        }
      }).filter(Boolean) // Remove null entries

      if (productsToUpdate.length === 0) {
        toast.error(t('no_changes_to_update'))
        return
      }

      console.log('Sending bulk update for products:', productsToUpdate)

      // Call the bulk update API
      const result = await dispatch(bulkUpdateProducts({ products: productsToUpdate }))
      
      if (result.meta.requestStatus === 'fulfilled') {
        // Reset edit mode and values
        setInlineEditMode(false)
        setEditValues({})
        setSelectedProducts([])
        
        // Refresh the products list
        setFetch(!fetch)
        
        toast.success(`${t('bulk_update_success')} ${productsToUpdate.length} products updated`)
      } else {
        throw new Error(result.payload || 'Bulk update failed')
      }
      
    } catch (error) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update products')
    }
  }, [editValues, selectedProducts, t, fetch, dispatch])

  // Activate/deactivate every selected row in one call — reuses the same bulk-update
  // endpoint the price/cost/stock bulk edit above already uses.
  const handleBulkSetActive = useCallback(async (isActive: boolean) => {
    if (selectedProducts.length === 0) return
    setBulkStatusUpdating(true)
    try {
      const productsToUpdate = selectedProducts.map((product: any) => ({
        id: product._id || product.id || '',
        isActive,
      }))
      const result = await dispatch(bulkUpdateProducts({ products: productsToUpdate }))
      if (result.meta.requestStatus === 'fulfilled') {
        setSelectedProducts([])
        setFetch((prev) => !prev)
        // Same cross-slice cache as the per-row Active toggle (active-toggle-cell.tsx) —
        // Invoice/Purchase/POS pickers read from purchaseCatalogApi's own RTK Query
        // cache, which this plain bulkUpdateProducts thunk has no way to invalidate on
        // its own.
        dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
        toast.success(`${productsToUpdate.length} product(s) ${isActive ? 'activated' : 'deactivated'}`)
      } else {
        throw new Error(result.payload || 'Bulk status update failed')
      }
    } catch (error) {
      console.error('Bulk status update error:', error)
      toast.error('Failed to update product status')
    } finally {
      setBulkStatusUpdating(false)
    }
  }, [selectedProducts, dispatch])

  const handleSelectedRowsChange = useCallback((selectedRows: any[]) => {
    setSelectedProducts(selectedRows)
  }, [])

  const handleEditValueChange = useCallback((productId: string, field: string, value: number) => {
    setEditValues(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [field]: value
      }
    }))
  }, [])

  const startInlineEdit = useCallback(() => {
    if (selectedProducts.length === 0) {
      toast.error(t('no_products_selected'))
      return
    }
    setInlineEditMode(true)
  }, [selectedProducts.length, t])

  const cancelInlineEdit = useCallback(() => {
    setInlineEditMode(false)
    setEditValues({})
  }, [])

  // Cumulative qty/value from every page before the current one, for the table's
  // "Brought Forward" footer row. allProducts is fetched with the same sort as the
  // paginated `products` fetch, so its first (currentPage-1)*limit entries line up
  // with the pages already paged through — but only while unfiltered: a search
  // changes which rows land on which page, so the two datasets no longer align.
  const broughtForward = useMemo(() => {
    if (loadingAllProducts || debouncedSearch.trim() || currentPage <= 1) return null
    const priorProducts = allProducts.slice(0, (currentPage - 1) * limit)
    return {
      qty: priorProducts.reduce((sum, product) => sum + getDisplayStock(product), 0),
      value: priorProducts.reduce((sum, product) => sum + getDisplayStockValue(product), 0),
    }
  }, [allProducts, currentPage, limit, debouncedSearch, loadingAllProducts])

  // Out of Stock / Low Stock / Critical Stock counts for the header stat cards — same
  // thresholds LowStockAlert uses internally (critical = at or below half the low-stock
  // threshold), computed here too since the alert banner no longer exposes them.
  const stockCounts = useMemo(() => {
    let outOfStock = 0
    let lowStock = 0
    let criticalStock = 0
    for (const product of allProducts) {
      const stock = getDisplayStock(product)
      if (stock === 0) outOfStock++
      else if (stock <= Math.floor(lowStockThreshold / 2)) criticalStock++
      else if (stock <= lowStockThreshold) lowStock++
    }
    return { outOfStock, lowStock, criticalStock }
  }, [allProducts, lowStockThreshold])

  const avgPurchasePrice = productStats && productStats.totalStockQuantity > 0
    ? productStats.totalStockValue / productStats.totalStockQuantity
    : 0

  // Load threshold from localStorage
  useEffect(() => {
    const savedThreshold = localStorage.getItem('lowStockThreshold');
    if (savedThreshold) {
      setLowStockThreshold(parseInt(savedThreshold));
    }
  }, []);

  if (showLowStockDetails) {
    return (
      <ProductsProvider>
        <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
<LowStockDetails 
              products={allProducts}
              onBack={() => setShowLowStockDetails(false)}
              threshold={lowStockThreshold}
            />
        </div>
      </ProductsProvider>
    );
  }

  return (
    <ProductsProvider>
      <div dir={language === 'ur' ? 'ltr' : 'ltr'}>
{/* "N products found at your other branches" banner — only when this branch's catalog is empty */}
          <ImportBranchProductsBanner productCount={allProducts.length} loading={loadingAllProducts} />

          <div className='mb-4 flex flex-wrap items-start justify-between gap-3'>
            <div>
              <h2 className='text-2xl font-bold tracking-tight'>{t('products_list')}</h2>
              <p className='text-muted-foreground'>
                {t('manage_products')}
              </p>
            </div>
            <div className='flex gap-2'>
              {selectedProducts.length > 0 && !inlineEditMode && (
                <>
                  <Button
                    variant="outline"
                    onClick={startInlineEdit}
                    className='space-x-1'
                  >
                    <Edit size={16} />
                    <span>{t('bulk_edit_selected')} ({selectedProducts.length})</span>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={bulkStatusUpdating}
                    onClick={() => handleBulkSetActive(true)}
                    className='space-x-1'
                  >
                    <span>{t('Activate Selected')} ({selectedProducts.length})</span>
                  </Button>
                  <Button
                    variant="outline"
                    disabled={bulkStatusUpdating}
                    onClick={() => handleBulkSetActive(false)}
                    className='space-x-1'
                  >
                    <span>{t('Deactivate Selected')} ({selectedProducts.length})</span>
                  </Button>
                  <Can permission='deleteProducts'>
                    <Button
                      variant="destructive"
                      onClick={() => setBulkDeleteOpen(true)}
                      className='space-x-1'
                    >
                      <Trash2 size={16} />
                      <span>{t('delete_selected')} ({selectedProducts.length})</span>
                    </Button>
                  </Can>
                </>
              )}
              {inlineEditMode && (
                <>
                  <Button
                    onClick={handleBulkUpdate}
                    className='space-x-1'
                  >
                    <span>{t('update_products')} ({selectedProducts.length})</span>
                  </Button>
                  <Button
                    variant="outline"
                    onClick={cancelInlineEdit}
                    className='space-x-1'
                  >
                    <span>{t('cancel')}</span>
                  </Button>
                </>
              )}
              <ProductPrimaryButtons />
            </div>
          </div>

          <div className='mb-4'>
            <ProductStatCards
              outOfStock={stockCounts.outOfStock}
              lowStock={stockCounts.lowStock}
              criticalStock={stockCounts.criticalStock}
              totalProducts={productStats?.totalProducts ?? 0}
              loading={loadingAllProducts || loadingStats}
            />
          </div>

{/* Out of stock / low stock banner */}
          <div className='mb-4'>
            <div onClick={() => !loadingAllProducts && setShowLowStockDetails(true)} className={loadingAllProducts ? '' : 'cursor-pointer'}>
              <LowStockAlert products={allProducts} defaultThreshold={lowStockThreshold} loading={loadingAllProducts} />
            </div>
          </div>

          <div className='mb-4 flex flex-wrap items-center gap-2'>
            <CategoryFilterCombobox value={categoryFilter} onChange={setCategoryFilter} categories={categories} />
            {isSingleCategorySelected && (
              <Badge variant='secondary' className='h-9 px-3 text-sm font-normal'>
                {t('Totals for')}: {
                  categoryFilter === UNCATEGORIZED_CATEGORY
                    ? t('Uncategorized')
                    : categories.find((c) => c.id === categoryFilter)?.name || categoryFilter
                }
              </Badge>
            )}
            {!isBreakdownMode && (
              <>
                <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
                  <Package className='h-4 w-4 text-muted-foreground' />
                  <span className='text-muted-foreground'>{t('total_products')}:</span>
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : (productStats?.totalProducts ?? 0).toLocaleString()}</span>
                </div>
                <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
                  <Boxes className='h-4 w-4 text-muted-foreground' />
                  <span className='text-muted-foreground'>{t('total_stock_quantity')}:</span>
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : (productStats?.totalStockQuantity ?? 0).toLocaleString()}</span>
                </div>
                <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
                  <Wallet className='h-4 w-4 text-muted-foreground' />
                  <span className='text-muted-foreground'>{t('total_value_of_stock')}:</span>
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : (productStats?.totalStockValue ?? 0).toLocaleString()}</span>
                </div>
                <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
                  <CircleDollarSign className='h-4 w-4 text-muted-foreground' />
                  <span className='text-muted-foreground'>{t('Avg Purchase Price')}:</span>
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : avgPurchasePrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              </>
            )}
          </div>

          {isBreakdownMode ? (
            <CategoryBreakdown
              data={categoryBreakdown}
              loading={loadingCategoryBreakdown}
              onSelectCategory={(categoryId) => setCategoryFilter(categoryId)}
            />
          ) : (
          <div className='-mx-4 flex-1 overflow-auto px-4 py-1 lg:flex-row lg:space-y-0 lg:space-x-12'>
            <ProductTable
              data={products}
              columns={columns}
              loading={loading}
              toolbarLeading={
                <Input
                  autoFocus
                  placeholder={t('search_products')}
                  className='h-9 w-full'
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  aria-label={t('search_products')}
                />
              }
              toolbarTrailing={
                <>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className='h-9 w-[150px]'>
                      <SelectValue placeholder={t('All Status')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_STATUS}>{t('All Status')}</SelectItem>
                      <SelectItem value='active'>{t('Active')}</SelectItem>
                      <SelectItem value='inactive'>{t('Inactive')}</SelectItem>
                    </SelectContent>
                  </Select>
                  <AiScanButton />
                </>
              }
              paggination={{
                totalPage,
                totalResults,
                currentPage,
                setCurrentPage,
                limit,
                setLimit: (n: number) => {
                  setLimit(n)
                  setCurrentPage(1)
                },
              }}
              onSelectedRowsChange={handleSelectedRowsChange}
              inlineEditMode={inlineEditMode}
              editValues={editValues}
              onEditValueChange={handleEditValueChange}
              broughtForward={broughtForward}
            />
          </div>
          )}

        <ProductDialogs setFetch={setFetch} />

        <BulkDeleteDialog
          open={bulkDeleteOpen}
          onOpenChange={setBulkDeleteOpen}
          products={selectedProducts}
          onDeleted={() => {
            setSelectedProducts([])
            setFetch((prev) => !prev)
          }}
        />
      </div>
    </ProductsProvider>
  )
}

/** Small standalone component (rather than inline in Products' toolbar JSX) purely so it
 * can call useUsers() — that hook only works inside ProductsProvider's subtree, and
 * Products() itself renders the provider rather than being inside it. */
function AiScanButton() {
  const { setOpen } = useUsers()
  const { t } = useLanguage()
  return (
    <Button variant='outline' size='sm' className='h-9 gap-1.5' onClick={() => setOpen('ai-scan')}>
      <Sparkles className='h-4 w-4' />
      {t('ai_scan')}
      <Badge variant='secondary' className='ml-1 h-4 px-1.5 text-[10px] leading-none'>{t('New')}</Badge>
    </Button>
  )
}

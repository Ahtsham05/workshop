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
import { ProductFiltersPanel, ALL_SUBCATEGORIES, ALL_BRANDS, NO_QUANTITY_OP, type QuantityFilter, type RangeFilter, type TrackingFilter } from './components/product-filters-panel'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { useEffect, useState, useCallback, useMemo } from 'react'
import type { SortingState } from '@tanstack/react-table'
import { fetchProducts, bulkUpdateProducts, fetchProductStats, fetchCategoryBreakdown } from '@/stores/product.slice'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { fetchCategories } from '@/stores/category.slice'
import { fetchAllSubCategories } from '@/stores/subCategory.slice'
import { useGetAllBrandsQuery } from '@/stores/brand.api'
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
import { getDisplayStock, getDisplayStockValue, getStockStatus } from '@/lib/product-stock-display'
import { useFormatMoney } from '@/lib/format-money'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { BulkDeleteDialog } from './components/bulk-delete-dialog'

const SEARCH_DEBOUNCE_MS = 400
const ALL_STATUS = 'all'
// Active products first, inactive last; newest-first within each group.
const PRODUCTS_SORT_BY = 'isActive:desc,createdAt:desc'

// Column ids the backend can sort by. `name`/`description`/`shelfLocation`/`barcode`/
// `isActive`/`createdAt` map 1:1 onto a plain, indexable Product field (see
// server/src/models/plugins/paginate.plugin.js's `field:asc|desc` format) and use the
// fast, unmodified Product.paginate path. `brand`/`price`/`cost`/`stockQuantity`/
// `stockValue` route through product.service.js#queryProductsWithComputedSort instead —
// brand needs its name joined in (not the stored `brandId`), and the other four need to
// be VARIANT-AWARE: for a `hasVariants` product, sorting by the raw Product field would
// silently disagree with what the cell displays (variantPriceRange/variantStockTotal),
// so that path resolves the same effective value the table shows. Columns left out of
// this set entirely (categories, subCategories, tags, status, tracking) are arrays or
// client-derived badges with no single sortable value — `enableSorting: false` on those
// in users-columns.tsx keeps their header from offering a sort control that wouldn't do
// anything once sorting is resolved server-side across the whole result set.
const SERVER_SORTABLE_COLUMNS = new Set([
  'name',
  'description',
  'shelfLocation',
  'barcode',
  'price',
  'cost',
  'stockQuantity',
  'isActive',
  'stockValue',
  'brand',
  'createdAt',
])

function buildSortByParam(sorting: SortingState): string {
  const parts = sorting
    .filter((s) => SERVER_SORTABLE_COLUMNS.has(s.id))
    .map((s) => `${s.id}:${s.desc ? 'desc' : 'asc'}`)
  return parts.length > 0 ? parts.join(',') : PRODUCTS_SORT_BY
}

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
  const [bulkPercentOp, setBulkPercentOp] = useState<'increase' | 'decrease' | 'margin'>('increase')
  const [bulkPercentValue, setBulkPercentValue] = useState('')
  // A prepared-but-not-yet-sent bulk update, held here while the confirmation dialog is
  // open — separates "figure out what would change" from "actually commit it" so a
  // 200+ row price/cost change always gets a review step before it's irreversible.
  const [pendingBulkUpdate, setPendingBulkUpdate] = useState<{ id: string; price?: number; cost?: number; stockQuantity?: number }[] | null>(null)
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)
  const [showLowStockDetails, setShowLowStockDetails] = useState(false)
  const [lowStockThreshold, setLowStockThreshold] = useState(10)
  // null = no store-wide override, fall back to half of lowStockThreshold — see
  // getEffectiveStockThresholds in lib/product-stock-display.ts.
  const [criticalStockThreshold, setCriticalStockThreshold] = useState<number | null>(null)
  const [categoryFilter, setCategoryFilter] = useState(NO_CATEGORY_FILTER)
  const [subCategoryFilter, setSubCategoryFilter] = useState(ALL_SUBCATEGORIES)
  const [brandFilter, setBrandFilter] = useState(ALL_BRANDS)
  const [quantityFilter, setQuantityFilter] = useState<QuantityFilter>({ op: NO_QUANTITY_OP, value: '' })
  const [tagsFilter, setTagsFilter] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState<RangeFilter>({ min: '', max: '' })
  const [costRange, setCostRange] = useState<RangeFilter>({ min: '', max: '' })
  const [trackingFilter, setTrackingFilter] = useState<TrackingFilter>({ imei: false, serial: false })
  const [statusFilter, setStatusFilter] = useState(ALL_STATUS)
  const [bulkStatusUpdating, setBulkStatusUpdating] = useState(false)
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false)
  const [categoryBreakdown, setCategoryBreakdown] = useState<CategoryBreakdownRow[]>([])
  const [loadingCategoryBreakdown, setLoadingCategoryBreakdown] = useState(false)
  // Column-header sort — resolved server-side (see buildSortByParam) so it reorders the
  // whole branch's product list, not just the ≤`limit` rows on the current page.
  const [sorting, setSorting] = useState<SortingState>([])

  const isBreakdownMode = categoryFilter === ALL_CATEGORIES_BREAKDOWN
  // A real category id — not the "no filter" or "breakdown" sentinels.
  const isSingleCategorySelected = categoryFilter !== NO_CATEGORY_FILTER && categoryFilter !== ALL_CATEGORIES_BREAKDOWN

  const dispatch = useDispatch<AppDispatch>()
  const { t, language } = useLanguage()
  const formatCurrency = useFormatMoney()
  // Re-sorts the current page (active-first/inactive-last) after a per-row Active
  // toggle — that switch flips instantly on its own but has no way to move the row
  // without this, see active-toggle-cell.tsx.
  const handleProductStatusChange = useCallback(() => setFetch((prev) => !prev), [])
  const columns = useProductColumns(lowStockThreshold, criticalStockThreshold, handleProductStatusChange) // Get columns with translations

  // Store-wide Low/Critical Stock defaults — saved from the Low Stock Alert banner's
  // settings dialog, applied to every product with no threshold override of its own.
  const handleThresholdsSave = useCallback(
    ({ lowStockThreshold: low, criticalStockThreshold: critical }: { lowStockThreshold: number; criticalStockThreshold: number | null }) => {
      setLowStockThreshold(low)
      setCriticalStockThreshold(critical)
      localStorage.setItem('lowStockThreshold', String(low))
      if (critical == null) {
        localStorage.removeItem('criticalStockThreshold')
      } else {
        localStorage.setItem('criticalStockThreshold', String(critical))
      }
    },
    []
  )
  const { categories } = useSelector((state: RootState) => state.category)
  const { subCategories } = useSelector((state: RootState) => state.subCategory)
  const { data: brands = [] } = useGetAllBrandsQuery()

  // Sub-Category filter options are scoped to the selected Category (when one is
  // picked) — a sub-category from an unrelated category would never match anyway.
  const filterableSubCategories = useMemo(() => {
    if (!isSingleCategorySelected || categoryFilter === UNCATEGORIZED_CATEGORY) return subCategories
    return subCategories.filter((sc) => {
      const parentId = typeof sc.category === 'object' ? sc.category?.id : sc.category
      return parentId === categoryFilter
    })
  }, [subCategories, isSingleCategorySelected, categoryFilter])

  // Fetch categories/sub-categories once when products page loads
  useEffect(() => {
    dispatch(fetchCategories({ page: 1, limit: 100 }))
    dispatch(fetchAllSubCategories({}))
  }, [dispatch])

  // Switching (or clearing) the Category filter can leave a previously-selected
  // Sub-Category filter pointing at a sub-category that's no longer in scope.
  useEffect(() => {
    if (subCategoryFilter === ALL_SUBCATEGORIES) return
    if (!filterableSubCategories.some((sc) => sc.id === subCategoryFilter)) {
      setSubCategoryFilter(ALL_SUBCATEGORIES)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter])

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
  }, [debouncedSearch, categoryFilter, subCategoryFilter, brandFilter, quantityFilter, statusFilter, sorting, tagsFilter, priceRange, costRange, trackingFilter])

  // Fetch paginated products for table display — skipped in breakdown mode, which
  // shows the per-category rollup instead of the flat table.
  useEffect(() => {
    if (isBreakdownMode) return
    setLoading(true)
    const q = debouncedSearch.trim()
    const hasQuantityFilter = quantityFilter.op !== NO_QUANTITY_OP && quantityFilter.value.trim() !== ''
    const priceMin = priceRange.min.trim()
    const priceMax = priceRange.max.trim()
    const costMin = costRange.min.trim()
    const costMax = costRange.max.trim()
    const params = {
      page: currentPage,
      limit: limit,
      sortBy: buildSortByParam(sorting),
      ...(q ? { search: q, fieldName: LIST_SEARCH_FIELDS.product } : {}),
      ...(isSingleCategorySelected ? { category: categoryFilter } : {}),
      ...(subCategoryFilter !== ALL_SUBCATEGORIES ? { subCategory: subCategoryFilter } : {}),
      ...(brandFilter !== ALL_BRANDS ? { brandId: brandFilter } : {}),
      ...(hasQuantityFilter ? { stockQuantity: quantityFilter.value.trim(), stockQuantityOp: quantityFilter.op } : {}),
      ...(statusFilter !== ALL_STATUS ? { isActive: statusFilter === 'active' } : {}),
      ...(tagsFilter.length > 0 ? { tags: tagsFilter.join(',') } : {}),
      ...(priceMin ? { priceMin } : {}),
      ...(priceMax ? { priceMax } : {}),
      ...(costMin ? { costMin } : {}),
      ...(costMax ? { costMax } : {}),
      ...(trackingFilter.imei ? { trackImei: true } : {}),
      ...(trackingFilter.serial ? { trackSerial: true } : {}),
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
  }, [currentPage, limit, fetch, debouncedSearch, categoryFilter, subCategoryFilter, brandFilter, quantityFilter, statusFilter, sorting, tagsFilter, priceRange, costRange, trackingFilter, dispatch, isBreakdownMode, isSingleCategorySelected])

  // Category-wise rollup for the "All Categories" breakdown view — fetched only while
  // that mode is active.
  useEffect(() => {
    if (!isBreakdownMode) return
    setLoadingCategoryBreakdown(true)
    dispatch(fetchCategoryBreakdown({}))
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

  // Prepares the bulk update and opens the confirmation dialog — the actual write only
  // happens from confirmBulkUpdate below, once the user has seen exactly what's about to
  // change. Editing prices/cost/stock for potentially hundreds of selected rows at once
  // is exactly the kind of action that deserves a review step before it's irreversible.
  const handleBulkUpdate = useCallback(() => {
    const hasUpdates = Object.values(editValues).some(values =>
      values.price !== undefined || values.cost !== undefined || values.stockQuantity !== undefined
    )

    if (!hasUpdates) {
      toast.error(t('enter_at_least_one_value'))
      return
    }

    const productsToUpdate = selectedProducts
      .map((product: any) => {
        const productId = product._id || product.id || ''
        const updates = editValues[productId] || {}

        if (Object.keys(updates).length === 0) return null

        return {
          id: productId,
          ...(updates.price !== undefined && { price: updates.price }),
          ...(updates.cost !== undefined && { cost: updates.cost }),
          ...(updates.stockQuantity !== undefined && { stockQuantity: updates.stockQuantity }),
        }
      })
      .filter((p): p is { id: string; price?: number; cost?: number; stockQuantity?: number } => p !== null)

    if (productsToUpdate.length === 0) {
      toast.error(t('no_changes_to_update'))
      return
    }

    setPendingBulkUpdate(productsToUpdate)
  }, [editValues, selectedProducts, t])

  // Which fields the pending update actually touches, across every row — shown as a
  // quick summary in the confirmation dialog so "238 products" isn't the only thing the
  // user has to go on before committing.
  const pendingBulkUpdateFields = useMemo(() => {
    if (!pendingBulkUpdate) return []
    const fields = new Set<string>()
    pendingBulkUpdate.forEach((p) => {
      if (p.price !== undefined) fields.add(t('price'))
      if (p.cost !== undefined) fields.add(t('cost'))
      if (p.stockQuantity !== undefined) fields.add(t('stock_quantity'))
    })
    return [...fields]
  }, [pendingBulkUpdate, t])

  const confirmBulkUpdate = useCallback(async () => {
    if (!pendingBulkUpdate) return
    setIsBulkUpdating(true)
    try {
      const result = await dispatch(bulkUpdateProducts({ products: pendingBulkUpdate }))

      if (result.meta.requestStatus === 'fulfilled') {
        setInlineEditMode(false)
        setEditValues({})
        setSelectedProducts([])
        setFetch(!fetch)
        // Same cross-slice cache invalidation handleBulkSetActive/BulkDeleteDialog use —
        // Invoice/Purchase/POS pickers read prices/stock from purchaseCatalogApi's own
        // RTK Query cache, which this plain bulkUpdateProducts thunk has no way to
        // invalidate on its own, so they'd otherwise keep showing pre-update prices.
        dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
        toast.success(`${t('bulk_update_success')} ${pendingBulkUpdate.length} products updated`)
      } else {
        throw new Error(result.payload || 'Bulk update failed')
      }
    } catch (error) {
      console.error('Bulk update error:', error)
      toast.error('Failed to update products')
    } finally {
      setIsBulkUpdating(false)
      setPendingBulkUpdate(null)
    }
  }, [pendingBulkUpdate, fetch, dispatch, t])

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

  const handleEditValueChange = useCallback((productId: string, field: string, value: number | undefined) => {
    setEditValues(prev => {
      const productValues = { ...prev[productId] }
      if (value === undefined) {
        // Field was cleared back to empty — treat as "not edited" (falls back to
        // showing/submitting the product's current value) rather than storing a stray 0.
        delete productValues[field as keyof typeof productValues]
      } else {
        productValues[field as keyof typeof productValues] = value
      }
      return { ...prev, [productId]: productValues }
    })
  }, [])

  // Bulk "fill" helper for the inline-edit price inputs above — computes each selected
  // row's new price from ITS OWN current price/cost and writes it into the same
  // editValues state the per-row inputs already edit, so it rides the existing
  // preview/confirm/submit pipeline (handleBulkUpdate → confirmBulkUpdate) unchanged.
  // Only ever touches `price` — cost and stockQuantity are left for the per-row inputs.
  const applyBulkPercent = useCallback(() => {
    const pct = parseFloat(bulkPercentValue)
    if (Number.isNaN(pct)) {
      toast.error(t('Enter a valid percentage'))
      return
    }
    if (selectedProducts.length === 0) {
      toast.error(t('no_products_selected'))
      return
    }
    let skipped = 0
    selectedProducts.forEach((product: any) => {
      const productId = product._id || product.id || ''
      const cost = Number(product.cost) || 0
      let nextPrice: number
      if (bulkPercentOp === 'margin') {
        // Needs a real cost to compute a margin against — skip products without one
        // rather than silently setting price to 0.
        if (!cost) {
          skipped++
          return
        }
        nextPrice = cost * (1 + pct / 100)
      } else {
        const currentPrice = editValues[productId]?.price ?? (Number(product.price) || 0)
        const sign = bulkPercentOp === 'decrease' ? -1 : 1
        nextPrice = currentPrice * (1 + (sign * pct) / 100)
      }
      handleEditValueChange(productId, 'price', Math.max(0, Math.round(nextPrice * 100) / 100))
    })
    const applied = selectedProducts.length - skipped
    if (skipped > 0) {
      toast.error(`Skipped ${skipped} product(s) with no purchase cost set`)
    }
    if (applied > 0) {
      toast.success(`Price recalculated for ${applied} product(s) — review below before saving`)
    }
  }, [bulkPercentOp, bulkPercentValue, selectedProducts, editValues, handleEditValueChange, t])

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

  // Out of Stock / Low Stock / Critical Stock counts for the header stat cards — uses
  // each product's own threshold override when set (see getStockStatus), falling back to
  // the store-wide default otherwise. Computed here since the alert banner no longer
  // exposes these counts itself.
  const stockCounts = useMemo(() => {
    let outOfStock = 0
    let lowStock = 0
    let criticalStock = 0
    for (const product of allProducts) {
      const status = getStockStatus(product, lowStockThreshold, criticalStockThreshold)
      if (status === 'out_of_stock') outOfStock++
      else if (status === 'critical_stock') criticalStock++
      else if (status === 'low_stock') lowStock++
    }
    return { outOfStock, lowStock, criticalStock }
  }, [allProducts, lowStockThreshold, criticalStockThreshold])

  const avgPurchasePrice = productStats && productStats.totalStockQuantity > 0
    ? productStats.totalStockValue / productStats.totalStockQuantity
    : 0

  // Load store-wide thresholds from localStorage
  useEffect(() => {
    const savedThreshold = localStorage.getItem('lowStockThreshold');
    if (savedThreshold) {
      setLowStockThreshold(parseInt(savedThreshold));
    }
    const savedCritical = localStorage.getItem('criticalStockThreshold');
    if (savedCritical) {
      setCriticalStockThreshold(parseInt(savedCritical));
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
              criticalThreshold={criticalStockThreshold}
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
                  <div className='flex items-center gap-1.5 rounded-md border bg-card px-2 py-1'>
                    <Select value={bulkPercentOp} onValueChange={(v) => setBulkPercentOp(v as typeof bulkPercentOp)}>
                      <SelectTrigger className='h-8 w-[190px] text-xs'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value='increase'>{t('Increase price by %')}</SelectItem>
                        <SelectItem value='decrease'>{t('Decrease price by %')}</SelectItem>
                        <SelectItem value='margin'>{t('Set margin % over cost')}</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type='number'
                      step='0.1'
                      placeholder='%'
                      showVoiceInput={false}
                      className='h-8 w-16 text-xs'
                      value={bulkPercentValue}
                      onChange={(e) => setBulkPercentValue(e.target.value)}
                    />
                    <Button type='button' size='sm' variant='outline' className='h-8' onClick={applyBulkPercent}>
                      {t('Apply')} ({selectedProducts.length})
                    </Button>
                  </div>
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
              <LowStockAlert
                products={allProducts}
                lowStockThreshold={lowStockThreshold}
                criticalStockThreshold={criticalStockThreshold}
                onThresholdsSave={handleThresholdsSave}
                loading={loadingAllProducts}
              />
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
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : formatCurrency(productStats?.totalStockValue ?? 0)}</span>
                </div>
                <div className='flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm'>
                  <CircleDollarSign className='h-4 w-4 text-muted-foreground' />
                  <span className='text-muted-foreground'>{t('Avg Purchase Price')}:</span>
                  <span className='font-semibold tabular-nums'>{loadingStats ? '…' : formatCurrency(avgPurchasePrice)}</span>
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
              sorting={sorting}
              onSortingChange={setSorting}
              manualSorting
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
                  <ProductFiltersPanel
                    subCategories={filterableSubCategories}
                    subCategoryFilter={subCategoryFilter}
                    onSubCategoryChange={setSubCategoryFilter}
                    brands={brands}
                    brandFilter={brandFilter}
                    onBrandChange={setBrandFilter}
                    quantity={quantityFilter}
                    onQuantityChange={setQuantityFilter}
                    tags={tagsFilter}
                    onTagsChange={setTagsFilter}
                    priceRange={priceRange}
                    onPriceRangeChange={setPriceRange}
                    costRange={costRange}
                    onCostRangeChange={setCostRange}
                    tracking={trackingFilter}
                    onTrackingChange={setTrackingFilter}
                  />
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

        <ConfirmDialog
          open={!!pendingBulkUpdate}
          onOpenChange={(next) => {
            if (!isBulkUpdating) setPendingBulkUpdate(next ? pendingBulkUpdate : null)
          }}
          handleConfirm={confirmBulkUpdate}
          isLoading={isBulkUpdating}
          title={t('confirm_bulk_update_title', { count: String(pendingBulkUpdate?.length ?? 0) })}
          desc={
            <div className='space-y-3'>
              <p>{t('confirm_bulk_update_desc', { count: String(pendingBulkUpdate?.length ?? 0) })}</p>
              <div className='flex flex-wrap gap-1.5'>
                {pendingBulkUpdateFields.map((field) => (
                  <Badge key={field} variant='secondary' className='font-normal'>
                    {field}
                  </Badge>
                ))}
              </div>
            </div>
          }
          confirmText={t('confirm_and_update')}
        />

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

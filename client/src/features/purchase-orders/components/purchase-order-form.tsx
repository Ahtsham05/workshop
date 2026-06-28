import { useCallback, useEffect, useRef, useState } from 'react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import { Columns2, LayoutGrid } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchSuppliers } from '@/stores/supplier.slice'
import type { AppDispatch } from '@/stores/store'
import type { Category, Product } from '@/features/invoice/index'
import { ProductCatalog } from '@/features/purchase-invoice/components/product-catalog'
import type { PurchaseOrder } from '@/stores/purchaseOrder.api'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

import PurchaseOrderPanel from './purchase-order-panel'

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading.
const EMPTY_PURCHASE_CATALOG: PurchaseCatalogItem[] = []

const PO_SHOW_CATALOG_KEY = 'purchaseOrderShowProductCatalog'

const getInitialShowCatalog = (): boolean => {
  const stored = localStorage.getItem(PO_SHOW_CATALOG_KEY)
  if (stored === null) return true
  return stored === 'true'
}

interface Props {
  onBack: () => void
  onSaved: () => void
  editing?: PurchaseOrder | null
  /** Pre-add these products (e.g. from a "Create Purchase Order" reorder suggestion) once products load. */
  prefillItems?: { productId: string; variantId?: string; quantity: number }[]
  /** Auto-select this supplier (e.g. the AI-recommended supplier) once suppliers load. */
  prefillSupplierId?: string
}

export default function PurchaseOrderForm({ onBack, onSaved, editing, prefillItems, prefillSupplierId }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const addProductRef = useRef<(product: Product, quantity?: number, variantId?: string) => void>(() => {})
  const prefillAppliedRef = useRef(false)

  const [products, setProducts] = useState<Product[]>([])
  const [categorizedProducts, setCategorizedProducts] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [showImages, setShowImages] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [showProductCatalog, setShowProductCatalog] = useState(getInitialShowCatalog)

  const toggleProductCatalog = useCallback(() => {
    setShowProductCatalog((prev) => {
      const next = !prev
      try {
        localStorage.setItem(PO_SHOW_CATALOG_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [])

  useEffect(() => {
    setLoading(true)
    dispatch(fetchAllProducts({}))
      .then((data) => {
        let productsData: Product[] = []
        if (data.payload?.results) {
          productsData = data.payload.results
        } else if (Array.isArray(data.payload)) {
          productsData = data.payload
        }
        setProducts(productsData)
      })
      .catch(() => {
        setProducts([])
        toast.error('Failed to load products')
      })
      .finally(() => setLoading(false))

    dispatch(fetchSuppliers({ page: 1, limit: 1000 })).catch(() => {
      toast.error('Failed to load suppliers')
    })
  }, [dispatch])

  const { data: purchasableCatalog = EMPTY_PURCHASE_CATALOG, isLoading: catalogLoading } = useGetPurchasableCatalogQuery()

  // Build catalog tiles from the flat, variant-aware purchasable catalog — one tile
  // per real variant (its own price/cost/stock), one tile per non-variant product. See
  // the identical pattern in purchase-invoice/index.tsx.
  useEffect(() => {
    const categoryMap = new Map<string, Category>()
    purchasableCatalog.forEach((item) => {
      let categoryId = 'other'
      let categoryName = 'Other'
      if (item.categories && item.categories.length > 0) {
        categoryId = item.categories[0]._id
        categoryName = item.categories[0].name
      }
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, { _id: categoryId, name: categoryName, products: [] })
      }
      categoryMap.get(categoryId)!.products.push({
        id: item.type === 'variant' ? item.productId : item.id,
        _id: item.type === 'variant' ? item.productId : item.id,
        name: item.name,
        nameUrdu: item.nameUrdu,
        image: item.image,
        barcode: item.barcode,
        unit: item.unit,
        hasVariants: item.type === 'variant',
        brandId: item.brand,
        price: item.price,
        cost: item.cost,
        stockQuantity: item.stockQuantity,
        variantId: item.variantId,
        trackBatch: item.trackBatch,
        trackExpiry: item.trackExpiry,
        knownBatches: item.batches,
        // getDisplayStock/formatDisplayPrice (used by the tile rendering) read these
        // when hasVariants is true — min===max here so they resolve to this row's own
        // single real number instead of a range, since each row is already one
        // specific variant.
        variantStockTotal: item.stockQuantity,
        variantPriceRange: item.type === 'variant'
          ? { minPrice: item.price, maxPrice: item.price, minCost: item.cost, maxCost: item.cost }
          : null,
      } as Product)
    })
    setCategorizedProducts(Array.from(categoryMap.values()))
  }, [purchasableCatalog])

  const addToOrder = useCallback((product: Product, quantity = 1, variantId?: string) => {
    addProductRef.current(product, quantity, variantId)
    setSearchTerm('')
  }, [])

  // Apply reorder-suggestion prefill once: when products have loaded and the panel has
  // registered its add-product function. Runs at most once per mount (editing existing
  // orders never carries prefillItems, so there's no conflict with that flow).
  useEffect(() => {
    if (!prefillItems || prefillItems.length === 0) return
    if (prefillAppliedRef.current || loading || products.length === 0) return
    // Any prefilled item carrying a variantId needs the purchasable catalog to resolve
    // that variant's own stock/price — wait for it instead of falling back to the bare
    // parent product (no variant pre-selected), same fix as purchase-invoice/index.tsx.
    const needsCatalog = prefillItems.some((item) => item.variantId)
    if (needsCatalog && (catalogLoading || purchasableCatalog.length === 0)) return

    let addedCount = 0
    for (const { productId, variantId, quantity } of prefillItems) {
      if (variantId) {
        // A reorder suggestion for a specific real variant (or a batch-tracked
        // simple product's hidden default variant) — pull its own price/cost from
        // the purchasable catalog instead of the parent product's.
        const catalogItem = purchasableCatalog.find((c) => c.variantId === variantId)
        if (catalogItem) {
          const builtProduct = {
            id: catalogItem.productId,
            _id: catalogItem.productId,
            name: catalogItem.name,
            nameUrdu: catalogItem.nameUrdu,
            image: catalogItem.image,
            barcode: catalogItem.barcode,
            unit: catalogItem.unit,
            hasVariants: catalogItem.type === 'variant',
            price: catalogItem.price,
            cost: catalogItem.cost,
            stockQuantity: catalogItem.stockQuantity,
            trackBatch: catalogItem.trackBatch,
            trackExpiry: catalogItem.trackExpiry,
            knownBatches: catalogItem.batches,
            // getDisplayStock/formatDisplayPrice (used by the order item row) read
            // these once hasVariants is true — without them the row shows "Stock 0"
            // even though the variant has real stock, since stockQuantity/price are
            // only the legacy parent-product fallbacks. min===max here because this
            // row is already one specific variant, not a range.
            variantStockTotal: catalogItem.stockQuantity,
            variantPriceRange: catalogItem.type === 'variant'
              ? { minPrice: catalogItem.price, maxPrice: catalogItem.price, minCost: catalogItem.cost, maxCost: catalogItem.cost }
              : null,
          } as Product
          addProductRef.current(builtProduct, quantity, variantId)
          addedCount += 1
          continue
        }
      }
      const product = products.find((p) => (p.id || (p as { _id?: string })._id) === productId)
      if (product) {
        addProductRef.current(product, quantity)
        addedCount += 1
      }
    }
    prefillAppliedRef.current = true
    if (addedCount > 0) {
      toast.success(`Added ${addedCount} product(s) from reorder suggestions`)
    }
  }, [prefillItems, loading, products, purchasableCatalog, catalogLoading])

  const handleBarcodeSearch = useCallback(
    (barcode: string) => {
      const product = products.find((p) => p.barcode === barcode)
      if (product) {
        addToOrder(product)
        toast.success(`Added: ${product.name}`)
      } else {
        toast.error('Product not found')
      }
    },
    [products, addToOrder],
  )

  return (
    <div
      className={cn(
        'flex h-full min-h-0 flex-col p-4',
        showProductCatalog ? 'gap-4' : 'gap-3 pt-3',
      )}
    >
      <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
        <p className='order-2 max-w-xl text-xs leading-snug text-muted-foreground sm:order-1'>
          Pick supplier → order date → products. Press Enter to move to the next field. Click
          products in the catalog or scan a barcode to add lines quickly.
        </p>
        <div className='order-1 flex flex-wrap justify-end gap-2 sm:order-2'>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='gap-2 shadow-sm'
            onClick={toggleProductCatalog}
            aria-pressed={showProductCatalog}
          >
            {showProductCatalog ? (
              <>
                <Columns2 className='h-4 w-4 shrink-0' />
                Hide catalog
              </>
            ) : (
              <>
                <LayoutGrid className='h-4 w-4 shrink-0' />
                Show catalog
              </>
            )}
          </Button>
        </div>
      </div>

      <div
        className={cn(
          'grid min-h-0 w-full flex-1 items-start content-start',
          showProductCatalog ? 'grid-cols-1 gap-6 lg:grid-cols-2' : 'grid-cols-1 gap-4',
        )}
      >
        <div
          className={cn(
            'min-w-0 pb-6',
            !showProductCatalog && 'mx-auto w-full max-w-2xl sm:max-w-3xl 2xl:max-w-4xl',
          )}
        >
          <PurchaseOrderPanel
            onBack={onBack}
            onSaved={onSaved}
            editing={editing}
            products={products}
            productsLoading={loading}
            prefillSupplierId={prefillSupplierId}
            onRegisterAddProduct={(fn) => {
              addProductRef.current = fn
            }}
          />
        </div>

        {showProductCatalog ? (
          <div className='min-w-0 max-h-[2000px] overflow-y-auto pb-6'>
            <ProductCatalog
              categorizedProducts={categorizedProducts}
              loading={loading}
              showImages={showImages}
              setShowImages={setShowImages}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddToInvoice={addToOrder}
              onBarcodeSearch={handleBarcodeSearch}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}

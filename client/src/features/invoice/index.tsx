import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { permissionMessage } from '@/lib/permission-messages'
import { useState, useEffect, useLayoutEffect, useCallback, useRef, useMemo } from 'react'
import { useSearch } from '@tanstack/react-router'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchCustomers } from '@/stores/customer.slice'
import { InvoicePanel, ProductCatalog, InvoiceList, PendingInvoiceConverter } from './components'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Clock, Columns2, History, LayoutGrid, PauseCircle, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  clearSaleWorkspace,
  saveSaleWorkspace,
  loadSaleWorkspace,
  listSaleHeld,
  pushSaleHeld,
  removeSaleHeld,
  newHoldId,
  isSaleDraftSnapshotEmpty,
  POS_HOLD_MAX_AGE_MS,
  type SaleHeldRecord,
} from '@/lib/pos-hold-storage'
import { applySaleDraftStock, revertSaleDraftStock } from '@/lib/pos-hold-stock'
import { calculateInvoiceLineValues, getProductUnitOptions, resolveUnitConversion } from '@/lib/inventory-unit-conversions'

const INVOICE_URDU_ONLY_PREF_KEY = 'invoiceIsUrduOnly'
const INVOICE_SHOW_CATALOG_KEY = 'invoiceShowProductCatalog'

const getInitialUrduOnlyPreference = (): boolean => {
  const stored = localStorage.getItem(INVOICE_URDU_ONLY_PREF_KEY)
  return stored === 'true'
}

const getInitialShowProductCatalog = (): boolean => {
  const stored = localStorage.getItem(INVOICE_SHOW_CATALOG_KEY)
  if (stored === null) return true
  return stored === 'true'
}

export interface InvoiceItem {
  id: string
  productId: string
  name: string
  nameUrdu?: string
  image?: { url: string; publicId: string }
  quantity: number
  unit?: string
  conversionFactor?: number
  stockQuantity?: number
  unitPrice: number
  cost: number
  subtotal: number
  profit: number
  isManualEntry?: boolean
}

export function createEmptyManualInvoiceItem(): InvoiceItem {
  return {
    id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    productId: '',
    name: '',
    image: undefined,
    quantity: 1,
    unit: 'pcs',
    conversionFactor: 1,
    stockQuantity: 1,
    unitPrice: 0,
    cost: 0,
    subtotal: 0,
    profit: 0,
    isManualEntry: true,
  }
}

export interface Invoice {
  items: InvoiceItem[]
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
  language?: 'en' | 'ur'
  isUrduOnly?: boolean
  type: 'cash' | 'credit' | 'pending'
  status?: 'draft' | 'finalized' | 'paid' | 'cancelled' | 'refunded'
  subtotal: number
  tax: number
  discount: number
  total: number
  totalProfit: number
  totalCost: number
  paidAmount: number
  balance: number
  invoiceDate?: string
  dueDate?: string
  notes?: string
  // Payment method (how customer paid)
  paymentMethod?: 'cash' | 'wallet' | 'bank' | 'card'
  walletType?: string
  // Additional POS features
  splitPayment?: SplitPayment[]
  loyaltyPoints?: number
  couponCode?: string
  returnPolicy?: string
  deliveryCharge?: number
  serviceCharge?: number
  roundingAdjustment?: number
}

export interface SplitPayment {
  method: 'cash' | 'card' | 'digital' | 'check'
  amount: number
  reference?: string
}

export interface Product {
  id: string  // Backend transforms _id to id via toJSON plugin
  _id?: string  // Fallback for compatibility
  name: string
  price: number
  cost: number
  stockQuantity: number
  unit?: string  // Unit of measurement
  unitConversions?: {
    fromUnit: string
    toUnit: string
    factor: number
    businessTypes?: string[]
    isActive?: boolean
  }[]
  image?: { url: string; publicId: string }
  category?: { _id: string; name: string; nameUrdu?: string }
  categories?: { _id: string; name: string; nameUrdu?: string }[]
  barcode?: string
  description?: string
  nameUrdu?: string
}

export interface Category {
  _id: string  // Categories use _id (check if backend also transforms these)
  id?: string
  name: string
  nameUrdu?: string
  image?: { url: string; publicId: string }
  products: Product[]
}

export default function InvoicePage() {
  const { t } = useLanguage()
  const { hasExplicitPermission } = usePermissions()
  const dispatch = useDispatch<AppDispatch>()
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const search = useSearch({ from: '/_authenticated/invoice/' })

  const initialView =
    search.view === 'list' || search.view === 'convert-pending' ? search.view : 'create'
  
  // View state management
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit' | 'convert-pending'>(initialView)
  const [editingInvoice, setEditingInvoice] = useState<any>(null)

  // State for invoice
  const [invoice, setInvoice] = useState<Invoice>({
    items: [createEmptyManualInvoiceItem()],
    language: preferredLanguage,
    isUrduOnly: getInitialUrduOnlyPreference(),
    customerId: search.customerId?.trim() || 'walk-in',
    type: search.customerId?.trim() ? 'credit' : 'cash',
    subtotal: 0,
    tax: 0,
    discount: 0,
    total: 0,
    totalProfit: 0,
    totalCost: 0,
    paidAmount: 0,
    balance: 0,
    paymentMethod: 'cash',
    walletType: undefined,
    splitPayment: [],
    loyaltyPoints: 0,
    deliveryCharge: 0,
    serviceCharge: 0,
    roundingAdjustment: 0
  })
  
  // Track if invoice has been saved to prevent stock restoration
  const [invoiceSaved, setInvoiceSaved] = useState(false)
  
  // State for products and categories
  const [products, setProducts] = useState<Product[]>([])
  const [categorizedProducts, setCategorizedProducts] = useState<Category[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
  // UI state
  const [showImages, setShowImages] = useState(true)
  /** Shared with Product Catalog — when true, purchase cost is readable in catalog and product picker */
  const [showProductCost, setShowProductCost] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [taxRate, setTaxRate] = useState(0) // Configurable tax rate
  const [showProductCatalog, setShowProductCatalog] = useState(getInitialShowProductCatalog)

  const toggleProductCatalog = useCallback(() => {
    setShowProductCatalog((prev) => {
      const next = !prev
      try {
        localStorage.setItem(INVOICE_SHOW_CATALOG_KEY, String(next))
      } catch {
        /* quota / private mode */
      }
      return next
    })
  }, [])

  const [heldSheetOpen, setHeldSheetOpen] = useState(false)
  const [heldUiEpoch, setHeldUiEpoch] = useState(0)
  const saleAutosaveRecoveredRef = useRef(false)

  /** Always-latest snapshot for synchronous persist (tab close / route change / visibility) */
  const salePersistRef = useRef({
    loading,
    currentView,
    invoice,
    taxRate,
    showImages,
    showProductCost,
    searchTerm,
    showProductCatalog,
  })
  salePersistRef.current = {
    loading,
    currentView,
    invoice,
    taxRate,
    showImages,
    showProductCost,
    searchTerm,
    showProductCatalog,
  }

  const persistSaleDraftSync = useCallback(() => {
    const s = salePersistRef.current
    if (s.loading) return
    if (s.currentView !== 'create') return
    if (isSaleDraftSnapshotEmpty(s.invoice as unknown as Record<string, unknown>)) {
      clearSaleWorkspace()
      return
    }
    saveSaleWorkspace({
      invoice: s.invoice as unknown as Record<string, unknown>,
      taxRate: s.taxRate,
      showImages: s.showImages,
      showProductCost: s.showProductCost,
      searchTerm: s.searchTerm,
      showProductCatalog: s.showProductCatalog,
    })
  }, [])

  const resetSaleInvoiceForm = useCallback(() => {
    const preferredUrduOnly = getInitialUrduOnlyPreference()
    setInvoice({
      items: [createEmptyManualInvoiceItem()],
      language: preferredUrduOnly ? 'ur' : preferredLanguage,
      isUrduOnly: preferredUrduOnly,
      customerId: 'walk-in',
      type: 'cash',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalProfit: 0,
      totalCost: 0,
      paidAmount: 0,
      balance: 0,
      paymentMethod: 'cash',
      walletType: undefined,
      splitPayment: [],
      loyaltyPoints: 0,
      deliveryCharge: 0,
      serviceCharge: 0,
      roundingAdjustment: 0,
      notes: '',
    })
  }, [preferredLanguage])

  const saleHeldList = useMemo(() => listSaleHeld(), [heldUiEpoch])

  // Persist after each draft change. Skip while products/customers load — avoids clearing localStorage
  // before useLayoutEffect restores the workspace snapshot.
  useEffect(() => {
    if (loading) return
    persistSaleDraftSync()
  }, [
    loading,
    invoice,
    taxRate,
    showImages,
    showProductCost,
    searchTerm,
    showProductCatalog,
    currentView,
    persistSaleDraftSync,
  ])

  // Tab / window close, mobile backgrounding, and full browser exit
  useEffect(() => {
    const onHidden = () => {
      if (document.visibilityState === 'hidden') persistSaleDraftSync()
    }
    const onPageLifecycle = () => persistSaleDraftSync()
    document.addEventListener('visibilitychange', onHidden)
    window.addEventListener('pagehide', onPageLifecycle)
    window.addEventListener('beforeunload', onPageLifecycle)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      window.removeEventListener('pagehide', onPageLifecycle)
      window.removeEventListener('beforeunload', onPageLifecycle)
    }
  }, [persistSaleDraftSync])

  // SPA route change: React may cancel pending timers without firing them — always flush on unmount
  useEffect(() => {
    return () => persistSaleDraftSync()
  }, [persistSaleDraftSync])

  useLayoutEffect(() => {
    if (loading) return
    if (currentView !== 'create') return
    if (saleAutosaveRecoveredRef.current) return
    saleAutosaveRecoveredRef.current = true

    const ws = loadSaleWorkspace()
    if (
      !ws ||
      isSaleDraftSnapshotEmpty(ws.invoice) ||
      Date.now() - ws.updatedAt > POS_HOLD_MAX_AGE_MS
    ) {
      if (ws && Date.now() - ws.updatedAt > POS_HOLD_MAX_AGE_MS) clearSaleWorkspace()
      return
    }
    const inv = ws.invoice as unknown as Invoice
    setInvoice(inv)
    setTaxRate(ws.taxRate)
    setShowImages(ws.showImages)
    setShowProductCost(ws.showProductCost)
    setSearchTerm(ws.searchTerm)
    setShowProductCatalog(ws.showProductCatalog)
    setProducts((prev) => applySaleDraftStock(prev, inv.items))
    toast.success(t('draft_restored'))
  }, [loading, currentView, t])

  const manualHoldSale = useCallback(() => {
    if (currentView !== 'create') return
    if (isSaleDraftSnapshotEmpty(invoice as unknown as Record<string, unknown>)) {
      toast.error(t('nothing_to_hold'))
      return
    }
    setProducts((prev) => revertSaleDraftStock(prev, invoice.items))
    const cust =
      invoice.customerId === 'walk-in'
        ? invoice.walkInCustomerName?.trim() || t('walk_in_customer')
        : invoice.customerName ||
          customers.find((c) => c._id === invoice.customerId)?.name ||
          t('customer')
    const lineCount = invoice.items.filter((it) => it.productId || it.name?.trim()).length
    const label = `${cust} · Rs ${Number(invoice.total ?? 0).toLocaleString('en-PK', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} · ${lineCount}`
    const record: SaleHeldRecord = {
      id: newHoldId(),
      label,
      savedAt: Date.now(),
      snapshot: {
        invoice: invoice as unknown as Record<string, unknown>,
        taxRate,
        showImages,
        showProductCost,
        searchTerm,
        showProductCatalog,
      },
    }
    pushSaleHeld(record)
    clearSaleWorkspace()
    resetSaleInvoiceForm()
    setHeldUiEpoch((x) => x + 1)
    toast.success(t('draft_saved_to_held'))
  }, [
    currentView,
    invoice,
    customers,
    taxRate,
    showImages,
    showProductCost,
    searchTerm,
    showProductCatalog,
    t,
    resetSaleInvoiceForm,
  ])

  const resumeSaleHeld = useCallback(
    (id: string) => {
      const entry = listSaleHeld().find((h) => h.id === id)
      if (!entry) return
      if (!isSaleDraftSnapshotEmpty(invoice as unknown as Record<string, unknown>)) {
        setProducts((prev) => revertSaleDraftStock(prev, invoice.items))
      }
      const inv = entry.snapshot.invoice as unknown as Invoice
      setInvoice(inv)
      setTaxRate(entry.snapshot.taxRate)
      setShowImages(entry.snapshot.showImages)
      setShowProductCost(entry.snapshot.showProductCost)
      setSearchTerm(entry.snapshot.searchTerm)
      setShowProductCatalog(entry.snapshot.showProductCatalog)
      setProducts((prev) => applySaleDraftStock(prev, inv.items))
      removeSaleHeld(id)
      clearSaleWorkspace()
      setHeldUiEpoch((x) => x + 1)
      setHeldSheetOpen(false)
      toast.success(t('held_restored'))
    },
    [invoice, t],
  )

  const deleteSaleHeld = useCallback(
    (id: string) => {
      removeSaleHeld(id)
      setHeldUiEpoch((x) => x + 1)
      toast.success(t('held_deleted'))
    },
    [t],
  )

  // Refresh products to get latest stock data
  const refreshProducts = useCallback(async () => {
    try {
      const data = await dispatch(fetchAllProducts({}))
      let productsData = []
      
      if (data.payload?.results) {
        productsData = data.payload.results
      } else if (data.payload) {
        productsData = Array.isArray(data.payload) ? data.payload : []
      } else {
        productsData = []
      }
      
      setProducts(productsData)
      console.log('Products refreshed with latest stock data')
    } catch (error) {
      console.error('Error refreshing products:', error)
    }
  }, [dispatch])

  // Fetch products and customers on component mount
  useEffect(() => {
    console.log('=== INVOICE COMPONENT MOUNT ===')
    console.log('Fetching fresh products and customers data')
    
    setLoading(true)
    
    // Fetch products
    const fetchProductsPromise = dispatch(fetchAllProducts({}))
      .then((data) => {
        console.log('Products response:', data)
        let productsData = []
        
        if (data.payload?.results) {
          productsData = data.payload.results
        } else if (data.payload) {
          // Handle different response structures
          productsData = Array.isArray(data.payload) ? data.payload : []
        } else {
          productsData = []
        }
        
        console.log('Processed products data:', productsData.length, 'products')
        console.log('First product sample:', productsData[0])
        setProducts(productsData)
        console.log('Products state updated with fresh data')
      })
      .catch((error) => {
        console.error('Error fetching products:', error)
        setProducts([])
        toast.error('Failed to fetch products')
      })

    // Fetch customers
    const fetchCustomersPromise = dispatch(fetchCustomers({
      page: 1,
      limit: 1000
    }))
      .then((data) => {
        console.log('Customers response:', data)
        if (data.payload?.results) {
          setCustomers(data.payload.results)
        } else if (data.payload) {
          setCustomers(Array.isArray(data.payload) ? data.payload : [])
        } else {
          setCustomers([])
        }
      })
      .catch((error) => {
        console.error('Error fetching customers:', error)
        setCustomers([])
        toast.error('Failed to fetch customers')
      })

    // Wait for both to complete
    Promise.all([fetchProductsPromise, fetchCustomersPromise])
      .finally(() => {
        setLoading(false)
      })
  }, [dispatch])

  useEffect(() => {
    const customerId = search.customerId?.trim()
    if (!customerId || currentView !== 'create') return
    const match = customers.find((c) => c._id === customerId || c.id === customerId)
    setInvoice((prev) => ({
      ...prev,
      customerId,
      customerName: match?.name || prev.customerName,
      type: 'credit',
      paidAmount: 0,
      balance: prev.total,
    }))
  }, [search.customerId, customers, currentView])

  // Group products by category
  useEffect(() => {
    const categoryMap = new Map<string, Category>()
    
    products.forEach(product => {
      let categoryId = 'other'
      let categoryName = 'Other'
      let categoryNameUrdu: string | undefined
      
      // Check for category in different possible formats
      if (product.category) {
        categoryId = product.category._id
        categoryName = product.category.name
        categoryNameUrdu = product.category.nameUrdu
      } else if (product.categories && product.categories.length > 0) {
        categoryId = product.categories[0]._id
        categoryName = product.categories[0].name
        categoryNameUrdu = product.categories[0].nameUrdu
      }
      
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          _id: categoryId,
          name: categoryName,
          nameUrdu: categoryNameUrdu,
          products: []
        })
      }
      
      categoryMap.get(categoryId)!.products.push(product)
    })
    
    setCategorizedProducts(Array.from(categoryMap.values()))
  }, [products])

  useEffect(() => {
    setInvoice((prev) => {
      if (prev.isUrduOnly) {
        return prev.language === 'ur' ? prev : { ...prev, language: 'ur' }
      }
      if (prev.language) {
        return prev
      }
      return { ...prev, language: preferredLanguage }
    })
  }, [preferredLanguage])

  // Calculate invoice totals
  const calculateTotals = useCallback((items: InvoiceItem[], discountAmount: number = 0, deliveryCharge: number = 0, serviceCharge: number = 0) => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    const totalProfit = items.reduce((sum, item) => sum + item.profit, 0)
    const totalCost = items.reduce((sum, item) => sum + (item.cost * (item.stockQuantity || item.quantity)), 0)
    const discountedSubtotal = subtotal - discountAmount
    const taxableAmount = discountedSubtotal + deliveryCharge + serviceCharge
    const tax = taxableAmount * (taxRate / 100)
    const total = taxableAmount + tax
    
    return { subtotal, tax, total, totalProfit, totalCost, discountedSubtotal, taxableAmount }
  }, [taxRate])

  // Add product to invoice
  const addToInvoice = useCallback((product: Product, quantity: number = 1) => {
    // Get the product ID - try different possible field names
    const productId = product._id || product.id
    console.log('=== ADD TO INVOICE DEBUG ===')
    console.log('Adding product to invoice:', product.name, 'ID:', productId)
    console.log('Requested quantity:', quantity)
    console.log('Existing items:', invoice.items.map(item => ({ name: item.name, quantity: item.quantity, productId: item.productId })))
    
    if (!productId) {
      console.error('Product has no valid ID:', product)
      return;
    }

    // Get current stock from the products state (real-time stock)
    const currentProduct = products.find(p => (p._id || p.id) === productId)
    const currentStock = currentProduct ? currentProduct.stockQuantity : product.stockQuantity
    const defaultUnitOption = getProductUnitOptions(product)[0]
    const defaultLine = calculateInvoiceLineValues({
      product,
      quantity,
      unit: defaultUnitOption?.value || product.unit,
      unitPrice: product.price,
      cost: product.cost,
      conversionFactor: defaultUnitOption?.factor,
    })

    if (!defaultLine) {
      toast.error(`Missing unit conversion for ${product.name}`)
      return
    }
    
    console.log('Current stock from products state:', currentStock)
    console.log('Product stock from parameter:', product.stockQuantity)
    
    // Check stock availability
    if (currentStock <= 0) {
      toast.error(`${product.name} is out of stock`)
      return;
    }
    
    const existingItemIndex = invoice.items.findIndex(item => item.productId === productId)
    console.log('Existing item index:', existingItemIndex)
    
    let newItems: InvoiceItem[]
    let actualQuantityAdded = 0
    
    if (existingItemIndex >= 0) {
      // Update existing item - check stock for new total quantity
      const existingItem = invoice.items[existingItemIndex]
      const newQuantity = existingItem.quantity + quantity
      const recalculatedLine = calculateInvoiceLineValues({
        product,
        quantity: newQuantity,
        unit: existingItem.unit,
        unitPrice: existingItem.unitPrice,
        cost: existingItem.cost,
        conversionFactor: existingItem.conversionFactor,
      })

      if (!recalculatedLine) {
        toast.error(`Missing unit conversion for ${product.name}`)
        return
      }
      
      console.log('Existing item quantity:', existingItem.quantity)
      console.log('Requested additional quantity:', quantity) 
      console.log('New total quantity would be:', newQuantity)
      
      // Calculate actual available stock including items already in invoice
      const totalAvailableStock = currentStock + (existingItem.stockQuantity || existingItem.quantity)
      console.log('Total available stock (current + existing):', totalAvailableStock)
      
      // Check if new quantity exceeds total available stock
      if (recalculatedLine.stockQuantity > totalAvailableStock) {
        const perUnitImpact = existingItem.quantity > 0
          ? (existingItem.stockQuantity || existingItem.quantity) / existingItem.quantity
          : 1
        const availableStockToAdd = totalAvailableStock - (existingItem.stockQuantity || existingItem.quantity)
        const availableQuantity = Math.floor(availableStockToAdd / perUnitImpact)
        console.log('Available quantity to add:', availableQuantity)
        
        if (availableQuantity <= 0) {
          toast.error(`${product.name} - No more stock available (Current: ${existingItem.quantity}, Total Available: ${totalAvailableStock})`)
          console.log('ERROR: No more stock available')
          return;
        } else {
          toast.warning(`${product.name} - Only ${availableQuantity} more units available (Requested: ${quantity}, Available: ${availableQuantity})`)
          // Add only the available quantity
          actualQuantityAdded = availableQuantity
          const finalQuantity = existingItem.quantity + actualQuantityAdded
          const partialLine = calculateInvoiceLineValues({
            product,
            quantity: finalQuantity,
            unit: existingItem.unit,
            unitPrice: existingItem.unitPrice,
            cost: existingItem.cost,
            conversionFactor: existingItem.conversionFactor,
          })
          if (!partialLine) {
            toast.error(`Missing unit conversion for ${product.name}`)
            return
          }
          
          console.log('PARTIAL ADD: Adding', actualQuantityAdded, 'units')
          
          newItems = [...invoice.items]
          newItems[existingItemIndex] = {
            ...existingItem,
            quantity: finalQuantity,
            subtotal: partialLine.subtotal,
            profit: partialLine.profit,
            stockQuantity: partialLine.stockQuantity,
            conversionFactor: partialLine.conversionFactor
          }
        }
      } else {
        // Stock is sufficient
        actualQuantityAdded = quantity
        
        console.log('FULL ADD: Adding', actualQuantityAdded, 'units')
        console.log('Updating existing item:', existingItem.name, 'New quantity:', newQuantity)
        
        newItems = [...invoice.items]
        newItems[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          subtotal: recalculatedLine.subtotal,
          profit: recalculatedLine.profit,
          stockQuantity: recalculatedLine.stockQuantity,
          conversionFactor: recalculatedLine.conversionFactor
        }
      }
    } else {
      // Add new item - check stock for requested quantity
      if (defaultLine.stockQuantity > currentStock) {
        toast.error(`${product.name} - Requested quantity (${quantity}) exceeds stock (${currentStock})`)
        if (currentStock > 0) {
          // Add available stock instead
          const perUnitImpact = defaultLine.stockQuantity / quantity
          actualQuantityAdded = Math.max(1, Math.floor(currentStock / perUnitImpact))
          const cappedLine = calculateInvoiceLineValues({
            product,
            quantity: actualQuantityAdded,
            unit: defaultLine.lineUnit,
            unitPrice: product.price,
            cost: product.cost,
            conversionFactor: defaultLine.conversionFactor,
          })
          if (!cappedLine) {
            toast.error(`Missing unit conversion for ${product.name}`)
            return
          }
          const newItem: InvoiceItem = {
            id: `${productId}_${Date.now()}_${Math.random()}`,
            productId: productId,
            name: product.name,
            nameUrdu: product.nameUrdu,
            image: product.image,
            quantity: actualQuantityAdded,
            unit: cappedLine.lineUnit,
            conversionFactor: cappedLine.conversionFactor,
            stockQuantity: cappedLine.stockQuantity,
            unitPrice: product.price,
            cost: product.cost,
            subtotal: cappedLine.subtotal,
            profit: cappedLine.profit
          }
          
          toast.info(`Added ${actualQuantityAdded} ${cappedLine.lineUnit} of ${product.name} (maximum available)`)
          console.log('Adding new item with max stock:', newItem)
          newItems = [...invoice.items, newItem]
        } else {
          return;
        }
      } else {
        // Stock is sufficient
        actualQuantityAdded = quantity
        const newItem: InvoiceItem = {
          id: `${productId}_${Date.now()}_${Math.random()}`,
          productId: productId,
          name: product.name,
          nameUrdu: product.nameUrdu,
          image: product.image,
          quantity,
          unit: defaultLine.lineUnit,
          conversionFactor: defaultLine.conversionFactor,
          stockQuantity: defaultLine.stockQuantity,
          unitPrice: product.price,
          cost: product.cost,
          subtotal: defaultLine.subtotal,
          profit: defaultLine.profit
        }
        
        console.log('Adding new item:', newItem)
        newItems = [...invoice.items, newItem]
      }
    }
    
    // Update stock in real-time
    if (actualQuantityAdded > 0) {
      const stockImpact = existingItemIndex >= 0
        ? ((newItems[existingItemIndex].stockQuantity || 0) - (invoice.items[existingItemIndex].stockQuantity || invoice.items[existingItemIndex].quantity || 0))
        : (newItems[newItems.length - 1].stockQuantity || actualQuantityAdded)
      console.log('STOCK UPDATE: Decreasing stock by', actualQuantityAdded)
      console.log('STOCK UPDATE: Current stock before update:', currentStock)
      
      setProducts(prevProducts => prevProducts.map(p => 
        (p._id || p.id) === productId 
          ? { ...p, stockQuantity: p.stockQuantity - stockImpact }
          : p
      ))
      
      console.log('STOCK UPDATE: New stock will be:', currentStock - stockImpact)
      console.log(`Stock updated: ${product.name} - decreased by ${stockImpact}`)
    }
    
    console.log('=== ADD TO INVOICE DEBUG END ===')
    
    const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
    
    setInvoice(prev => ({
      ...prev,
      items: newItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      totalProfit: totals.totalProfit,
      totalCost: totals.totalCost,
      paidAmount: prev.type === 'cash' ? totals.total : prev.paidAmount,
      balance: prev.type === 'cash' ? 0 : totals.total - prev.paidAmount
    }))
    
    toast.success(`${product.name} added to invoice`)
  }, [invoice, calculateTotals, products, setProducts])

  // Remove item from invoice
  const removeFromInvoice = useCallback((itemId: string) => {
    // Find the item being removed to restore its stock
    const removedItem = invoice.items.find(item => item.id === itemId)
    
    const newItems = invoice.items.filter(item => item.id !== itemId)
    const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
    
    // Restore stock when item is removed
    if (removedItem) {
      setProducts(prevProducts => prevProducts.map(p => 
        (p._id || p.id) === removedItem.productId 
          ? { ...p, stockQuantity: p.stockQuantity + (removedItem.stockQuantity || removedItem.quantity) }
          : p
      ))
      
      console.log(`Stock restored: ${removedItem.name} + ${(removedItem.stockQuantity || removedItem.quantity)}`)
    }
    
    setInvoice(prev => ({
      ...prev,
      items: newItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      totalProfit: totals.totalProfit,
      totalCost: totals.totalCost,
      paidAmount: prev.type === 'cash' ? totals.total : prev.paidAmount,
      balance: prev.type === 'cash' ? 0 : totals.total - prev.paidAmount
    }))
  }, [invoice, calculateTotals, setProducts])

  // Update item quantity
  const updateQuantity = useCallback((itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromInvoice(itemId)
      return
    }

    // Find the current item and its corresponding product
    const currentItem = invoice.items.find(item => item.id === itemId)
    if (!currentItem) {
      console.error('Item not found:', itemId)
      return
    }

    // Find the product to check stock
    const product = products.find(p => (p._id || p.id) === currentItem.productId)
    if (!product) {
      console.error('Product not found for item:', currentItem.name)
      // Allow update without stock check if product not found (might be a manual entry)
    } else {
      // Calculate the difference in quantity
      const quantityDifference = newQuantity - currentItem.quantity
      
      if (quantityDifference > 0) {
        const recalculatedLine = resolveUnitConversion({
          product,
          quantity: newQuantity,
          unit: currentItem.unit,
          conversionFactor: currentItem.conversionFactor,
        })

        if (!recalculatedLine) {
          toast.error(`${currentItem.name} is missing a unit conversion`)
          return
        }

        const existingStockQuantity = currentItem.stockQuantity || currentItem.quantity
        const stockDifference = recalculatedLine.stockQuantity - existingStockQuantity

        // Increasing quantity - check if we have enough stock
        if (stockDifference > product.stockQuantity) {
          toast.error(`${currentItem.name} - Cannot increase by ${quantityDifference}. Only ${product.stockQuantity} units available`)
          return
        }
        
        // Update stock (decrease)
        setProducts(prevProducts => prevProducts.map(p => 
          (p._id || p.id) === currentItem.productId 
            ? { ...p, stockQuantity: p.stockQuantity - stockDifference }
            : p
        ))
        
        console.log(`Stock updated: ${currentItem.name} - decreased by ${stockDifference}`)
      } else if (quantityDifference < 0) {
        // Decreasing quantity - restore stock
        const recalculatedLine = resolveUnitConversion({
          product,
          quantity: newQuantity,
          unit: currentItem.unit,
          conversionFactor: currentItem.conversionFactor,
        })

        if (!recalculatedLine) {
          toast.error(`${currentItem.name} is missing a unit conversion`)
          return
        }

        const quantityToRestore = (currentItem.stockQuantity || currentItem.quantity) - recalculatedLine.stockQuantity
        
        setProducts(prevProducts => prevProducts.map(p => 
          (p._id || p.id) === currentItem.productId 
            ? { ...p, stockQuantity: p.stockQuantity + quantityToRestore }
            : p
        ))
        
        console.log(`Stock updated: ${currentItem.name} + restored ${quantityToRestore}`)
      }
    }
    
    const newItems = invoice.items.map(item => {
      if (item.id === itemId) {
        const lineValues = calculateInvoiceLineValues({
          product: product || { unit: item.unit },
          quantity: newQuantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          cost: item.cost,
          conversionFactor: item.conversionFactor,
        })
        if (!lineValues) {
          return item
        }
        return {
          ...item,
          quantity: newQuantity,
          subtotal: lineValues.subtotal,
          profit: lineValues.profit,
          stockQuantity: lineValues.stockQuantity,
          conversionFactor: lineValues.conversionFactor
        }
      }
      return item
    })
    
    const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
    
    setInvoice(prev => ({
      ...prev,
      items: newItems,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      totalProfit: totals.totalProfit,
      totalCost: totals.totalCost,
      paidAmount: prev.type === 'cash' ? totals.total : prev.paidAmount,
      balance: prev.type === 'cash' ? 0 : totals.total - prev.paidAmount
    }))
  }, [invoice, calculateTotals, removeFromInvoice, products, setProducts])

  // Handle barcode search
  const handleBarcodeSearch = useCallback((barcode: string) => {
    const product = products.find(p => p.barcode === barcode)
    if (product) {
      addToInvoice(product)
      setSearchTerm('')
      toast.success(`Product found: ${product.name}`)
    } else {
      toast.error('Product not found')
    }
  }, [products, addToInvoice])

  // Update invoice type
  const updateInvoiceType = useCallback((type: 'cash' | 'credit' | 'pending') => {
    const totals = calculateTotals(invoice.items, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
    
    setInvoice(prev => ({
      ...prev,
      type,
      paidAmount: type === 'cash' ? totals.total : 0,
      balance: type === 'cash' ? 0 : totals.total
    }))
  }, [invoice, calculateTotals])

  // Update discount
  const updateDiscount = useCallback((discountAmount: number) => {
    const totals = calculateTotals(invoice.items, discountAmount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
    
    setInvoice(prev => ({
      ...prev,
      discount: discountAmount,
      subtotal: totals.subtotal,
      tax: totals.tax,
      total: totals.total,
      totalProfit: totals.totalProfit,
      totalCost: totals.totalCost,
      paidAmount: prev.type === 'cash' ? totals.total : prev.paidAmount,
      balance: prev.type === 'cash' ? 0 : totals.total - prev.paidAmount
    }))
  }, [invoice, calculateTotals])

  const handleCreateNew = () => {
    if (!hasExplicitPermission('createInvoices')) {
      toast.error(permissionMessage(t, 'no_permission_create_invoice'))
      return
    }
    // Restore stock for current invoice items before creating new (only if not saved)
    if (!invoiceSaved && invoice.items.length > 0) {
      setProducts(prevProducts => {
        let updatedProducts = [...prevProducts]
        invoice.items.forEach(item => {
          const productIndex = updatedProducts.findIndex(p => (p._id || p.id) === item.productId)
          if (productIndex !== -1) {
            updatedProducts[productIndex] = {
              ...updatedProducts[productIndex],
              stockQuantity: updatedProducts[productIndex].stockQuantity + (item.stockQuantity || item.quantity)
            }
          }
        })
        return updatedProducts
      })
      console.log('Stock restored for previous invoice items')
    } else if (invoiceSaved) {
      console.log('Previous invoice was saved - stock already committed, no restoration needed')
    }
    
    // Reset the saved flag for new invoice
    setInvoiceSaved(false)

    clearSaleWorkspace()
    
    // Refresh products to ensure latest stock data
    refreshProducts()
    
    setCurrentView('create')
    setEditingInvoice(null)
    const preferredUrduOnly = getInitialUrduOnlyPreference()
    // Reset invoice state
    setInvoice({
      items: [createEmptyManualInvoiceItem()],
      language: preferredUrduOnly ? 'ur' : preferredLanguage,
      isUrduOnly: preferredUrduOnly,
      customerId: 'walk-in',
      type: 'cash',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalProfit: 0,
      totalCost: 0,
      paidAmount: 0,
      balance: 0,
      paymentMethod: 'cash',
      walletType: undefined,
      splitPayment: [],
      loyaltyPoints: 0,
      deliveryCharge: 0,
      serviceCharge: 0,
      roundingAdjustment: 0,
      notes: '',
    })
  }

  const handleEdit = (invoiceData: any) => {
    // Check permission before allowing edit
    if (!hasExplicitPermission('editInvoices')) {
      toast.error(permissionMessage(t, 'no_permission_edit_invoice'))
      return
    }

    clearSaleWorkspace()
    
    // Reset the saved flag when starting to edit
    setInvoiceSaved(false)
    
    // Refresh products to ensure latest stock data
    refreshProducts()
    
    setCurrentView('edit')
    setEditingInvoice(invoiceData)
    
    // Format invoice date for HTML date input (YYYY-MM-DD)
    let formattedInvoiceDate = invoiceData.invoiceDate
    if (formattedInvoiceDate) {
      try {
        const date = new Date(formattedInvoiceDate)
        if (!isNaN(date.getTime())) {
          formattedInvoiceDate = date.toISOString().split('T')[0]
        }
      } catch (error) {
        console.warn('Invalid invoice date format:', formattedInvoiceDate)
        formattedInvoiceDate = undefined
      }
    }
    
    // Map invoice data to form state and ensure each item has a unique ID
    const itemsWithUniqueIds = (invoiceData.items || []).map((item: any, index: number) => {
      const rawPid = item.productId
      const productId =
        rawPid && typeof rawPid === 'object' && rawPid._id != null
          ? String(rawPid._id)
          : rawPid != null && rawPid !== ''
            ? String(rawPid)
            : ''
      const nameUrdu =
        item.nameUrdu ||
        (typeof rawPid === 'object' && rawPid != null ? rawPid.nameUrdu : undefined) ||
        ''
      return {
      ...item,
      id: item.id || `edit-item-${Date.now()}-${index}`, // Ensure unique ID for each item
      productId,
      name: item.name || '',
      nameUrdu: nameUrdu || undefined,
      quantity: item.quantity || 1,
      unit: item.unit,
      conversionFactor: item.conversionFactor,
      stockQuantity: item.stockQuantity,
      unitPrice: item.unitPrice || 0,
      cost: item.cost || 0,
      subtotal: item.subtotal || (item.quantity * item.unitPrice) || 0,
      profit: item.profit || ((item.quantity * (item.unitPrice - item.cost)) || 0),
      image: item.image || undefined,
      isManualEntry: item.isManualEntry || false
    }
    })
    
    setInvoice({
      items: itemsWithUniqueIds,
      language: invoiceData.language || preferredLanguage,
      isUrduOnly: invoiceData.isUrduOnly || false,
      type: invoiceData.type || 'cash',
      subtotal: invoiceData.subtotal || 0,
      tax: invoiceData.tax || 0,
      discount: invoiceData.discount || 0,
      total: invoiceData.total || 0,
      totalProfit: invoiceData.totalProfit || 0,
      totalCost: invoiceData.totalCost || 0,
      paidAmount: invoiceData.paidAmount || 0,
      balance: invoiceData.balance || 0,
      paymentMethod: invoiceData.paymentMethod || 'cash',
      walletType: invoiceData.walletType || undefined,
      splitPayment: invoiceData.splitPayment || [],
      loyaltyPoints: invoiceData.loyaltyPoints || 0,
      deliveryCharge: invoiceData.deliveryCharge || 0,
      serviceCharge: invoiceData.serviceCharge || 0,
      roundingAdjustment: invoiceData.roundingAdjustment || 0,
      customerId: invoiceData.customerId,
      customerName: invoiceData.customerName,
      walkInCustomerName: invoiceData.walkInCustomerName,
      notes: invoiceData.notes || '',
      invoiceDate: formattedInvoiceDate,
      couponCode: invoiceData.couponCode,
      returnPolicy: invoiceData.returnPolicy,
      status: invoiceData.status
    })
  }

  const handleBackToList = () => {
    // Only restore stock if invoice was not saved (i.e., user canceled/navigated away)
    if (!invoiceSaved && invoice.items.length > 0) {
      setProducts(prevProducts => {
        let updatedProducts = [...prevProducts]
        invoice.items.forEach(item => {
          const productIndex = updatedProducts.findIndex(p => (p._id || p.id) === item.productId)
          if (productIndex !== -1) {
            updatedProducts[productIndex] = {
              ...updatedProducts[productIndex],
              stockQuantity: updatedProducts[productIndex].stockQuantity + (item.stockQuantity || item.quantity)
            }
          }
        })
        return updatedProducts
      })
      console.log('Stock restored before going back to list')
    } else if (invoiceSaved) {
      console.log('Invoice was saved - stock changes committed, no restoration needed')
    }
    
    // Reset the saved flag for next invoice
    setInvoiceSaved(false)

    clearSaleWorkspace()
    
    // Refresh products to ensure we have the latest stock data from server
    refreshProducts()
    
    setCurrentView('list')
    setEditingInvoice(null)
  }

  // Handle successful invoice save - commit stock changes
  const handleSaveSuccess = useCallback(() => {
    clearSaleWorkspace()
    // Mark invoice as saved to prevent stock restoration
    setInvoiceSaved(true)
    
    console.log('Invoice saved - stock changes committed')
    
    // Reset to create new invoice instead of going to list
    setCurrentView('create')
    setEditingInvoice(null)
    const preferredUrduOnly = getInitialUrduOnlyPreference()
    
    // Reset invoice state for new invoice
    setInvoice({
      items: [createEmptyManualInvoiceItem()],
      language: preferredUrduOnly ? 'ur' : preferredLanguage,
      isUrduOnly: preferredUrduOnly,
      customerId: 'walk-in',
      type: 'cash',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalProfit: 0,
      totalCost: 0,
      paidAmount: 0,
      balance: 0,
      paymentMethod: 'cash',
      walletType: undefined,
      splitPayment: [],
      loyaltyPoints: 0,
      deliveryCharge: 0,
      serviceCharge: 0,
      roundingAdjustment: 0,
      notes: '',
    })
    
    // Reset the saved flag for next invoice
    setInvoiceSaved(false)
    
    // Refresh products to ensure we have the latest stock data from server
    refreshProducts()
  }, [preferredLanguage, refreshProducts])

  const handleConvertPending = () => {
    clearSaleWorkspace()
    setCurrentView('convert-pending')
  }
  if (currentView === 'list') {
    return (
      <div className='flex-1 flex flex-col'>
          <InvoiceList 
            onCreateNew={handleCreateNew}
            onEdit={handleEdit}
            onConvertPending={handleConvertPending}
            initialTypeFilter={search.type}
          />
      </div>
    )
  }

  // Convert pending view
  if (currentView === 'convert-pending') {
    return (
      <div className='flex-1 flex flex-col'>
          <PendingInvoiceConverter 
            customers={customers}
            onBack={handleBackToList}
          />
      </div>
    )
  }

  // Create/Edit view
  return (
    <div className='flex-1 flex flex-col'>
      <div
        className={cn(
          'pb-6',
          showProductCatalog ? 'pt-3 md:pt-4' : 'pt-2 md:pt-2.5',
        )}
      >
        <div className={cn('space-y-3', !showProductCatalog && 'space-y-2')}>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between'>
            <p className='order-2 max-w-xl text-xs leading-snug text-muted-foreground sm:order-1'>
              {t('autosave_hint')}
            </p>
            <div className='flex flex-wrap justify-end gap-2 order-1 sm:order-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-2 shadow-sm'
                onClick={() => setCurrentView('list')}
              >
                <History className='h-4 w-4 shrink-0' aria-hidden />
                {t('invoice_history')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-2 shadow-sm'
                onClick={handleConvertPending}
              >
                <Clock className='h-4 w-4 shrink-0' aria-hidden />
                {t('convert_pending_invoices')}
              </Button>
              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-2 shadow-sm'
                onClick={manualHoldSale}
              >
                <PauseCircle className='h-4 w-4 shrink-0' aria-hidden />
                {t('hold_invoice')}
              </Button>

              <Sheet open={heldSheetOpen} onOpenChange={setHeldSheetOpen}>
                <SheetTrigger asChild>
                  <Button type='button' variant='outline' size='sm' className='gap-2 shadow-sm'>
                    {t('held_drafts')}
                    {saleHeldList.length > 0 ? (
                      <Badge variant='secondary' className='px-1.5 py-0'>
                        {saleHeldList.length}
                      </Badge>
                    ) : null}
                  </Button>
                </SheetTrigger>
                <SheetContent side='right' className='flex w-full flex-col gap-0 overflow-hidden sm:max-w-md'>
                  <SheetHeader className='text-left'>
                    <SheetTitle>{t('held_drafts_sheet_title_sales')}</SheetTitle>
                    {saleHeldList.length === 0 ? (
                      <SheetDescription className='text-xs'>{t('held_drafts_empty')}</SheetDescription>
                    ) : (
                      <SheetDescription className='sr-only'>{t('held_drafts_sheet_title_sales')}</SheetDescription>
                    )}
                  </SheetHeader>
                  <div className='mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-1'>
                    {saleHeldList.length === 0 ? null : (
                      saleHeldList.map((h) => (
                        <div
                          key={h.id}
                          className='flex flex-col gap-2 rounded-lg border bg-card p-3 text-card-foreground shadow-sm'
                        >
                          <p className='text-sm font-medium leading-snug'>{h.label}</p>
                          <p className='text-xs text-muted-foreground'>
                            {new Date(h.savedAt).toLocaleString()}
                          </p>
                          <div className='flex flex-wrap gap-2'>
                            <Button size='sm' type='button' onClick={() => resumeSaleHeld(h.id)}>
                              {t('resume_held')}
                            </Button>
                            <Button
                              size='sm'
                              type='button'
                              variant='outline'
                              className='gap-1'
                              onClick={() => deleteSaleHeld(h.id)}
                            >
                              <Trash2 className='h-4 w-4' aria-hidden />
                              {t('held_remove')}
                            </Button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SheetContent>
              </Sheet>

              <Button
                type='button'
                variant='outline'
                size='sm'
                className='gap-2 shadow-sm'
                onClick={toggleProductCatalog}
                aria-pressed={showProductCatalog}
                aria-expanded={showProductCatalog}
                aria-label={
                  showProductCatalog ? t('hide_product_catalog') : t('show_product_catalog')
                }
              >
                {showProductCatalog ? (
                  <>
                    <Columns2 className='h-4 w-4 shrink-0' aria-hidden />
                    {t('hide_product_catalog')}
                  </>
                ) : (
                  <>
                    <LayoutGrid className='h-4 w-4 shrink-0' aria-hidden />
                    {t('show_product_catalog')}
                  </>
                )}
              </Button>
            </div>
          </div>

        <div
          className={cn(
            'grid w-full items-start content-start',
            showProductCatalog ? 'gap-6 lg:grid-cols-2' : 'grid-cols-1 gap-4',
          )}
        >
          {/* Invoice panel — centered readable width when catalog hidden (matches modern SaaS checkout) */}
          <div
            className={cn(
              'min-w-0 space-y-4 pb-6',
              !showProductCatalog &&
                'mx-auto w-full max-w-2xl sm:max-w-3xl 2xl:max-w-4xl',
            )}
          >
            <InvoicePanel
              invoice={invoice}
              setInvoice={setInvoice}
              updateQuantity={updateQuantity}
              removeFromInvoice={removeFromInvoice}
              updateInvoiceType={updateInvoiceType}
              updateDiscount={updateDiscount}
              taxRate={taxRate}
              setTaxRate={setTaxRate}
              customers={customers}
              customersLoading={loading}
              productsLoading={loading}
              products={products}
              setProducts={setProducts}
              calculateTotals={calculateTotals}
              onBackToList={handleBackToList}
              onSaveSuccess={handleSaveSuccess}
              isEditing={currentView === 'edit'}
              editingInvoice={editingInvoice}
              showProductCost={showProductCost}
            />
          </div>

          {showProductCatalog && (
          <div className='min-w-0 space-y-4 max-h-[2000px] overflow-y-auto pb-6'>
            <ProductCatalog
              categorizedProducts={categorizedProducts}
              loading={loading}
              showImages={showImages}
              setShowImages={setShowImages}
              showCost={showProductCost}
              setShowCost={setShowProductCost}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddToInvoice={addToInvoice}
              onBarcodeSearch={handleBarcodeSearch}
              selectedCustomerId={invoice.customerId}
              selectedCustomerName={
                invoice.customerId === 'walk-in' 
                  ? invoice.walkInCustomerName 
                  : invoice.customerName || customers.find(c => c._id === invoice.customerId)?.name
              }
            />
          </div>
          )}
        </div>
        </div>
      </div>
    </div>
  )
}

import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useState, useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchCustomers } from '@/stores/customer.slice'
import { InvoicePanel, ProductCatalog, InvoiceList, PendingInvoiceConverter } from './components'
import { toast } from 'sonner'

export interface InvoiceItem {
  id: string
  productId: string
  name: string
  image?: { url: string; publicId: string }
  quantity: number
  unit?: string
  unitPrice: number
  cost: number
  subtotal: number
  profit: number
  isManualEntry?: boolean
}

export interface Invoice {
  items: InvoiceItem[]
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
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
  dueDate?: string
  notes?: string
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
  image?: { url: string; publicId: string }
  category?: { _id: string; name: string }
  categories?: { _id: string; name: string }[]
  barcode?: string
  description?: string
}

export interface Category {
  _id: string  // Categories use _id (check if backend also transforms these)
  id?: string
  name: string
  image?: { url: string; publicId: string }
  products: Product[]
}

export default function InvoicePage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const dispatch = useDispatch<AppDispatch>()
  
  // View state management
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit' | 'convert-pending'>('create')
  const [editingInvoice, setEditingInvoice] = useState<any>(null)

  // State for invoice
  const [invoice, setInvoice] = useState<Invoice>({
    items: [],
    type: 'credit',
    subtotal: 0,
    tax: 0,
    discount: 0,
    total: 0,
    totalProfit: 0,
    totalCost: 0,
    paidAmount: 0,
    balance: 0,
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
  const [searchTerm, setSearchTerm] = useState('')
  const [taxRate, setTaxRate] = useState(0) // Configurable tax rate

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

  // Group products by category
  useEffect(() => {
    const categoryMap = new Map<string, Category>()
    
    products.forEach(product => {
      let categoryId = 'other'
      let categoryName = 'Other'
      
      // Check for category in different possible formats
      if (product.category) {
        categoryId = product.category._id
        categoryName = product.category.name
      } else if (product.categories && product.categories.length > 0) {
        categoryId = product.categories[0]._id
        categoryName = product.categories[0].name
      }
      
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          _id: categoryId,
          name: categoryName,
          products: []
        })
      }
      
      categoryMap.get(categoryId)!.products.push(product)
    })
    
    setCategorizedProducts(Array.from(categoryMap.values()))
  }, [products])

  // Calculate invoice totals
  const calculateTotals = useCallback((items: InvoiceItem[], discountAmount: number = 0, deliveryCharge: number = 0, serviceCharge: number = 0) => {
    const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0)
    const totalProfit = items.reduce((sum, item) => sum + item.profit, 0)
    const totalCost = items.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
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
      
      console.log('Existing item quantity:', existingItem.quantity)
      console.log('Requested additional quantity:', quantity) 
      console.log('New total quantity would be:', newQuantity)
      
      // Calculate actual available stock including items already in invoice
      const totalAvailableStock = currentStock + existingItem.quantity
      console.log('Total available stock (current + existing):', totalAvailableStock)
      
      // Check if new quantity exceeds total available stock
      if (newQuantity > totalAvailableStock) {
        const availableQuantity = totalAvailableStock - existingItem.quantity
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
          const newSubtotal = finalQuantity * product.price
          const newProfit = finalQuantity * (product.price - product.cost)
          
          console.log('PARTIAL ADD: Adding', actualQuantityAdded, 'units')
          
          newItems = [...invoice.items]
          newItems[existingItemIndex] = {
            ...existingItem,
            quantity: finalQuantity,
            subtotal: newSubtotal,
            profit: newProfit
          }
        }
      } else {
        // Stock is sufficient
        actualQuantityAdded = quantity
        const newSubtotal = newQuantity * product.price
        const newProfit = newQuantity * (product.price - product.cost)
        
        console.log('FULL ADD: Adding', actualQuantityAdded, 'units')
        console.log('Updating existing item:', existingItem.name, 'New quantity:', newQuantity)
        
        newItems = [...invoice.items]
        newItems[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          subtotal: newSubtotal,
          profit: newProfit
        }
      }
    } else {
      // Add new item - check stock for requested quantity
      if (quantity > currentStock) {
        toast.error(`${product.name} - Requested quantity (${quantity}) exceeds stock (${currentStock})`)
        if (currentStock > 0) {
          // Add available stock instead
          actualQuantityAdded = currentStock
          const newItem: InvoiceItem = {
            id: `${productId}_${Date.now()}_${Math.random()}`,
            productId: productId,
            name: product.name,
            image: product.image,
            quantity: currentStock,
            unit: product.unit,
            unitPrice: product.price,
            cost: product.cost,
            subtotal: currentStock * product.price,
            profit: currentStock * (product.price - product.cost)
          }
          
          toast.info(`Added ${currentStock} units of ${product.name} (maximum available)`)
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
          image: product.image,
          quantity,
          unit: product.unit,
          unitPrice: product.price,
          cost: product.cost,
          subtotal: quantity * product.price,
          profit: quantity * (product.price - product.cost)
        }
        
        console.log('Adding new item:', newItem)
        newItems = [...invoice.items, newItem]
      }
    }
    
    // Update stock in real-time
    if (actualQuantityAdded > 0) {
      console.log('STOCK UPDATE: Decreasing stock by', actualQuantityAdded)
      console.log('STOCK UPDATE: Current stock before update:', currentStock)
      
      setProducts(prevProducts => prevProducts.map(p => 
        (p._id || p.id) === productId 
          ? { ...p, stockQuantity: p.stockQuantity - actualQuantityAdded }
          : p
      ))
      
      console.log('STOCK UPDATE: New stock will be:', currentStock - actualQuantityAdded)
      console.log(`Stock updated: ${product.name} - decreased by ${actualQuantityAdded}`)
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
          ? { ...p, stockQuantity: p.stockQuantity + removedItem.quantity }
          : p
      ))
      
      console.log(`Stock restored: ${removedItem.name} + ${removedItem.quantity}`)
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
        // Increasing quantity - check if we have enough stock
        if (quantityDifference > product.stockQuantity) {
          toast.error(`${currentItem.name} - Cannot increase by ${quantityDifference}. Only ${product.stockQuantity} units available`)
          return
        }
        
        // Update stock (decrease)
        setProducts(prevProducts => prevProducts.map(p => 
          (p._id || p.id) === currentItem.productId 
            ? { ...p, stockQuantity: p.stockQuantity - quantityDifference }
            : p
        ))
        
        console.log(`Stock updated: ${currentItem.name} - decreased by ${quantityDifference}`)
      } else if (quantityDifference < 0) {
        // Decreasing quantity - restore stock
        const quantityToRestore = Math.abs(quantityDifference)
        
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
        const newSubtotal = newQuantity * item.unitPrice
        const newProfit = newQuantity * (item.unitPrice - item.cost)
        return {
          ...item,
          quantity: newQuantity,
          subtotal: newSubtotal,
          profit: newProfit
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
    // Restore stock for current invoice items before creating new (only if not saved)
    if (!invoiceSaved && invoice.items.length > 0) {
      setProducts(prevProducts => {
        let updatedProducts = [...prevProducts]
        invoice.items.forEach(item => {
          const productIndex = updatedProducts.findIndex(p => (p._id || p.id) === item.productId)
          if (productIndex !== -1) {
            updatedProducts[productIndex] = {
              ...updatedProducts[productIndex],
              stockQuantity: updatedProducts[productIndex].stockQuantity + item.quantity
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
    
    // Refresh products to ensure latest stock data
    refreshProducts()
    
    setCurrentView('create')
    setEditingInvoice(null)
    // Reset invoice state
    setInvoice({
      items: [],
      type: 'credit',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalProfit: 0,
      totalCost: 0,
      paidAmount: 0,
      balance: 0,
      splitPayment: [],
      loyaltyPoints: 0,
      deliveryCharge: 0,
      serviceCharge: 0,
      roundingAdjustment: 0,
      notes: '',
      dueDate: undefined
    })
  }

  const handleEdit = (invoiceData: any) => {
    // Check permission before allowing edit
    if (!hasPermission('editInvoices' as any)) {
      toast.error(t('no_permission_edit_invoice') || 'You do not have permission to edit invoices')
      return
    }
    
    // Reset the saved flag when starting to edit
    setInvoiceSaved(false)
    
    // Refresh products to ensure latest stock data
    refreshProducts()
    
    setCurrentView('edit')
    setEditingInvoice(invoiceData)
    
    // Format due date for HTML date input (YYYY-MM-DD)
    let formattedDueDate = invoiceData.dueDate
    if (formattedDueDate) {
      try {
        const date = new Date(formattedDueDate)
        if (!isNaN(date.getTime())) {
          // Convert to YYYY-MM-DD format for HTML date input
          formattedDueDate = date.toISOString().split('T')[0]
        }
      } catch (error) {
        console.warn('Invalid date format:', formattedDueDate)
        formattedDueDate = undefined
      }
    }
    
    // Map invoice data to form state and ensure each item has a unique ID
    const itemsWithUniqueIds = (invoiceData.items || []).map((item: any, index: number) => ({
      ...item,
      id: item.id || `edit-item-${Date.now()}-${index}`, // Ensure unique ID for each item
      productId: item.productId || '',
      name: item.name || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      cost: item.cost || 0,
      subtotal: item.subtotal || (item.quantity * item.unitPrice) || 0,
      profit: item.profit || ((item.quantity * (item.unitPrice - item.cost)) || 0),
      image: item.image || undefined,
      isManualEntry: item.isManualEntry || false
    }))
    
    setInvoice({
      items: itemsWithUniqueIds,
      type: invoiceData.type || 'cash',
      subtotal: invoiceData.subtotal || 0,
      tax: invoiceData.tax || 0,
      discount: invoiceData.discount || 0,
      total: invoiceData.total || 0,
      totalProfit: invoiceData.totalProfit || 0,
      totalCost: invoiceData.totalCost || 0,
      paidAmount: invoiceData.paidAmount || 0,
      balance: invoiceData.balance || 0,
      splitPayment: invoiceData.splitPayment || [],
      loyaltyPoints: invoiceData.loyaltyPoints || 0,
      deliveryCharge: invoiceData.deliveryCharge || 0,
      serviceCharge: invoiceData.serviceCharge || 0,
      roundingAdjustment: invoiceData.roundingAdjustment || 0,
      customerId: invoiceData.customerId,
      customerName: invoiceData.customerName,
      walkInCustomerName: invoiceData.walkInCustomerName,
      notes: invoiceData.notes || '',
      dueDate: formattedDueDate,
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
              stockQuantity: updatedProducts[productIndex].stockQuantity + item.quantity
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
    
    // Refresh products to ensure we have the latest stock data from server
    refreshProducts()
    
    setCurrentView('list')
    setEditingInvoice(null)
  }

  // Handle successful invoice save - commit stock changes
  const handleSaveSuccess = useCallback(() => {
    // Mark invoice as saved to prevent stock restoration
    setInvoiceSaved(true)
    
    console.log('Invoice saved - stock changes committed')
    
    // Reset to create new invoice instead of going to list
    setCurrentView('create')
    setEditingInvoice(null)
    
    // Reset invoice state for new invoice
    setInvoice({
      items: [],
      type: 'credit',
      subtotal: 0,
      tax: 0,
      discount: 0,
      total: 0,
      totalProfit: 0,
      totalCost: 0,
      paidAmount: 0,
      balance: 0,
      splitPayment: [],
      loyaltyPoints: 0,
      deliveryCharge: 0,
      serviceCharge: 0,
      roundingAdjustment: 0,
      notes: '',
      dueDate: undefined
    })
    
    // Reset the saved flag for next invoice
    setInvoiceSaved(false)
    
    // Refresh products to ensure we have the latest stock data from server
    refreshProducts()
  }, [refreshProducts])

  const handleConvertPending = () => {
    setCurrentView('convert-pending')
  }
  if (currentView === 'list') {
    return (
      <div className='flex-1 flex flex-col'>
        <Header fixed>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <LanguageSwitch />
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          <InvoiceList 
            onCreateNew={handleCreateNew}
            onEdit={handleEdit}
            onConvertPending={handleConvertPending}
          />
        </Main>
      </div>
    )
  }

  // Convert pending view
  if (currentView === 'convert-pending') {
    return (
      <div className='flex-1 flex flex-col'>
        <Header fixed>
          <Search />
          <div className='ml-auto flex items-center space-x-4'>
            <LanguageSwitch />
            <ThemeSwitch />
            <ProfileDropdown />
          </div>
        </Header>
        <Main>
          <PendingInvoiceConverter 
            customers={customers}
            onBack={handleBackToList}
          />
        </Main>
      </div>
    )
  }

  // Create/Edit view
  return (
    <div className='flex-1 flex flex-col'>
      <Header fixed>
        <Search />
        <div className='ml-auto flex items-center space-x-4'>
          <LanguageSwitch />
          <ThemeSwitch />
          <ProfileDropdown />
        </div>
      </Header>
      <Main>
        <div className='grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-screen'>
          {/* Left Panel - Invoice */}
          <div className='space-y-4 pb-6'>
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
              products={products}
              setProducts={setProducts}
              calculateTotals={calculateTotals}
              onBackToList={handleBackToList}
              onSaveSuccess={handleSaveSuccess}
              isEditing={currentView === 'edit'}
              editingInvoice={editingInvoice}
            />
          </div>

          {/* Right Panel - Product Catalog */}
          <div className='space-y-4 max-h-[2000px] overflow-y-auto pb-6'>
            <ProductCatalog
              categorizedProducts={categorizedProducts}
              loading={loading}
              showImages={showImages}
              setShowImages={setShowImages}
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
        </div>
      </Main>
    </div>
  )
}

import { Header } from '@/components/layout/header'
import { Main } from '@/components/layout/main'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { Search } from '@/components/search'
import { ThemeSwitch } from '@/components/theme-switch'
import { LanguageSwitch } from '@/components/language-switch'
// import { useLanguage } from '@/context/language-context'
import { useState, useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchCustomers } from '@/stores/customer.slice'
import { InvoicePanel, ProductCatalog, InvoiceList } from './components'
import { toast } from 'sonner'

export interface InvoiceItem {
  id: string
  productId: string
  name: string
  image?: { url: string; publicId: string }
  quantity: number
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
  _id: string
  id?: string
  name: string
  price: number
  cost: number
  stockQuantity: number
  image?: { url: string; publicId: string }
  category?: { _id: string; name: string }
  categories?: { _id: string; name: string }[]
  barcode?: string
  description?: string
}

export interface Category {
  _id: string
  name: string
  image?: { url: string; publicId: string }
  products: Product[]
}

export default function InvoicePage() {
  // const { t, language } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  
  // View state management
  const [currentView, setCurrentView] = useState<'list' | 'create' | 'edit'>('list')
  const [editingInvoice, setEditingInvoice] = useState<any>(null)

  // State for invoice
  const [invoice, setInvoice] = useState<Invoice>({
    items: [],
    type: 'cash',
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
  
  // State for products and categories
  const [products, setProducts] = useState<Product[]>([])
  const [categorizedProducts, setCategorizedProducts] = useState<Category[]>([])
  const [customers, setCustomers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  
  // UI state
  const [showImages, setShowImages] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [taxRate, setTaxRate] = useState(0) // Configurable tax rate

  // Fetch products and customers on component mount
  useEffect(() => {
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
        
        console.log('Processed products data:', productsData)
        console.log('First product sample:', productsData[0])
        setProducts(productsData)
      })
      .catch((error) => {
        console.error('Error fetching products:', error)
        setProducts([])
        toast.error('Failed to fetch products')
      })

    // Fetch customers
    const fetchCustomersPromise = dispatch(fetchCustomers({
      page: 1,
      limit: 100
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
    console.log('Adding product to invoice:', product.name, 'ID:', productId, 'Product object:', product)
    console.log('Existing items:', invoice.items.map(item => ({ name: item.name, id: item.productId })))
    
    if (!productId) {
      console.error('Product has no valid ID:', product)
      return;
    }
    
    const existingItemIndex = invoice.items.findIndex(item => item.productId === productId)
    console.log('Existing item index:', existingItemIndex)
    
    let newItems: InvoiceItem[]
    
    if (existingItemIndex >= 0) {
      // Update existing item
      newItems = [...invoice.items]
      const existingItem = newItems[existingItemIndex]
      const newQuantity = existingItem.quantity + quantity
      const newSubtotal = newQuantity * product.price
      const newProfit = newQuantity * (product.price - product.cost)
      
      console.log('Updating existing item:', existingItem.name, 'New quantity:', newQuantity)
      
      newItems[existingItemIndex] = {
        ...existingItem,
        quantity: newQuantity,
        subtotal: newSubtotal,
        profit: newProfit
      }
    } else {
      // Add new item
      const newItem: InvoiceItem = {
        id: `${productId}_${Date.now()}_${Math.random()}`,
        productId: productId,
        name: product.name,
        image: product.image,
        quantity,
        unitPrice: product.price,
        cost: product.cost,
        subtotal: quantity * product.price,
        profit: quantity * (product.price - product.cost)
      }
      
      console.log('Adding new item:', newItem)
      newItems = [...invoice.items, newItem]
    }
    
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
  }, [invoice, calculateTotals])

  // Remove item from invoice
  const removeFromInvoice = useCallback((itemId: string) => {
    const newItems = invoice.items.filter(item => item.id !== itemId)
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
  }, [invoice, calculateTotals])

  // Update item quantity
  const updateQuantity = useCallback((itemId: string, newQuantity: number) => {
    if (newQuantity <= 0) {
      removeFromInvoice(itemId)
      return
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
  }, [invoice, calculateTotals, removeFromInvoice])

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
    setCurrentView('create')
    setEditingInvoice(null)
    // Reset invoice state
    setInvoice({
      items: [],
      type: 'cash',
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
    setCurrentView('edit')
    setEditingInvoice(invoiceData)
    
    // Map invoice data to form state
    setInvoice({
      items: invoiceData.items || [],
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
      dueDate: invoiceData.dueDate,
      couponCode: invoiceData.couponCode,
      returnPolicy: invoiceData.returnPolicy,
      status: invoiceData.status
    })
  }

  const handleBackToList = () => {
    setCurrentView('list')
    setEditingInvoice(null)
  }

  // Render based on current view
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
          <div className='space-y-4 max-h-screen overflow-y-auto pb-6'>
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
              products={products}
              calculateTotals={calculateTotals}
              onBackToList={handleBackToList}
              isEditing={currentView === 'edit'}
              editingInvoice={editingInvoice}
            />
          </div>

          {/* Right Panel - Product Catalog */}
          <div className='space-y-4 max-h-screen overflow-y-auto pb-6'>
            <ProductCatalog
              categorizedProducts={categorizedProducts}
              loading={loading}
              showImages={showImages}
              setShowImages={setShowImages}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              onAddToInvoice={addToInvoice}
              onBarcodeSearch={handleBarcodeSearch}
            />
          </div>
        </div>
      </Main>
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Minus, Plus, Trash2, Save, Calculator, DollarSign, Search, Check, User, Package, Loader2, Printer, ArrowLeft, ChevronDown, Banknote, FileCheck } from 'lucide-react'
import { useState, useCallback, useEffect, useRef } from 'react'
import { useLanguage } from '@/context/language-context'
import { Invoice, createEmptyManualInvoiceItem } from '../index'
import { toast } from 'sonner'
import { useCreateInvoiceMutation, useUpdateInvoiceMutation } from '@/stores/invoice.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindow, openA4PrintWindow } from '../utils/print-utils'
import { withCustomerContactForPrint } from '../utils/invoice-print-whatsapp'
import {
  fetchAndStashPrintContact,
  resolveCustomerIdString,
  stashPrintContact,
  type PrintWindowContact,
} from '../utils/invoice-print-contact-bridge'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import SmartInput from '@/components/smart-input.tsx'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
// import { KeyboardLanguageOverride } from '@/components/keyboard-language-override'
import { cn } from '@/lib/utils'
import { getTextClasses, getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { detectCurrentKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '@/stores/store'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { calculateInvoiceLineValues, getProductUnitOptions, getUnitAdjustedPrice } from '@/lib/inventory-unit-conversions'
import { focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { useSync } from '@/lib/sync/use-sync'
import { buildOfflineInvoicePayload } from '@/lib/sync/offline-invoice'
import { getElectronAPI } from '@/lib/sync/electron'
import { normalizeInvoiceNotesHtml } from '@/lib/rich-text-utils'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { getInvoicePrintInUrdu, setInvoicePrintInUrdu } from '../utils/print-preferences'
import { isWholesaleRetailBusiness } from '@/lib/business-types'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { fetchCustomers } from '@/stores/customer.slice'
import { fetchAllProducts } from '@/stores/product.slice'
import { usePermissions } from '@/context/permission-context'
import {
  EntityCreateEmptyPrompt,
  EntityCreateShortcutButton,
  EntityQuickCreateDialogs,
  type QuickCreateState,
} from '@/components/entity-create-shortcut'
import { QuotationConvertDialog } from './quotation-convert-dialog'

/** Toggle to show payment source fields on invoice checkout. */
const SHOW_INVOICE_PAYMENT_METHOD_UI = true

interface InvoicePanelProps {
  invoice: Invoice
  setInvoice: React.Dispatch<React.SetStateAction<Invoice>>
  updateQuantity: (itemId: string, newQuantity: number) => void
  removeFromInvoice: (itemId: string) => void
  updateInvoiceType: (type: 'cash' | 'credit' | 'pending' | 'quotation') => void
  updateDiscount: (discountAmount: number) => void
  taxRate: number
  setTaxRate: (rate: number) => void
  customers: any[]
  customersLoading?: boolean
  setCustomers?: React.Dispatch<React.SetStateAction<any[]>>
  productsLoading?: boolean
  products: any[]
  setProducts: React.Dispatch<React.SetStateAction<any[]>>
  calculateTotals?: (items: any[], discountAmount?: number, deliveryCharge?: number, serviceCharge?: number) => any
  onBackToList?: () => void
  onSaveSuccess?: () => void
  isEditing?: boolean
  editingInvoice?: any
  /** Matches Product Catalog "Cost" toggle — when true, purchase cost is readable in the product picker */
  showProductCost?: boolean
}

export function InvoicePanel({
  invoice,
  setInvoice,
  updateQuantity,
  removeFromInvoice,
  updateInvoiceType,
  updateDiscount,
  taxRate,
  // setTaxRate,
  customers,
  customersLoading = false,
  setCustomers,
  productsLoading = false,
  products,
  setProducts,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingInvoice,
  showProductCost = false,
}: InvoicePanelProps) {
  const { t, isRTL } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const canCreateCustomer = hasPermission('createCustomers' as never)
  const canCreateProduct = hasPermission('createProducts' as never)
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !SHOW_INVOICE_PAYMENT_METHOD_UI })
  const wallets = walletsData?.results?.filter(w => w.isActive) ?? []
  const [discountInput, setDiscountInput] = useState(invoice.discount?.toString() || '0')
  const [paidAmountInput, setPaidAmountInput] = useState('')
  const [showProfitDetails, setShowProfitDetails] = useState(false)
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [savingType, setSavingType] = useState<'none' | 'receipt' | 'a4' | null>(null)
  const [customerBalance, setCustomerBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [cashReceivedInput, setCashReceivedInput] = useState('')
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [quickCreateProductItemId, setQuickCreateProductItemId] = useState<string | null>(null)

  // Refs for keyboard Enter navigation
  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const priceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const invoiceTypeTriggerRef = useRef<HTMLButtonElement>(null)
  const invoiceDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  const autoOpenedInvoiceItemIdRef = useRef<string | null>(null)
  const [invoiceTypeSelectOpen, setInvoiceTypeSelectOpen] = useState(false)

  useEffect(() => {
    if (isEditing) {
      autoOpenedInvoiceItemIdRef.current = null
      return
    }
    const first = invoice.items[0]
    if (
      invoice.items.length === 1 &&
      first?.isManualEntry &&
      !first?.productId &&
      first?.id &&
      autoOpenedInvoiceItemIdRef.current !== first.id
    ) {
      autoOpenedInvoiceItemIdRef.current = first.id
      queueMicrotask(() => setProductSelectOpen(first.id))
    }
  }, [invoice.items, isEditing])

  // Auto-scroll items list when items change
  useEffect(() => {
    if (itemsScrollRef.current) {
      itemsScrollRef.current.scrollTop = itemsScrollRef.current.scrollHeight
    }
  }, [invoice.items.length])

  // Detect current keyboard language
  const currentKeyboardLanguage = detectCurrentKeyboardLanguage()
  const voiceLanguage = currentKeyboardLanguage === 'ur' ? 'ur-PK' : 'en-US'

  // RTK Query mutations
  const [createInvoice] = useCreateInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()
  const { isElectron, online } = useSync()
  
  // Fetch active branch data for invoice printing
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showUnitConversions = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)

  const [printReceiptInUrdu, setPrintReceiptInUrdu] = useState(() => getInvoicePrintInUrdu())
  const [showConvertDialog, setShowConvertDialog] = useState(false)
  // Print functionality using utility
  const printInvoice = useCallback(async (invoiceData: any) => {
    try {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice
        })),
        customerId: invoiceData.customerId,
        customerName: invoice.customerName || invoiceData.customerName,
        walkInCustomerName: invoiceData.walkInCustomerName,
        type: invoiceData.type,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        discount: invoiceData.discount,
        total: invoiceData.total,
        paidAmount: invoiceData.paidAmount,
        balance: invoiceData.balance,
        notes: invoiceData.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: prevBal,
        netBalance: netBal,
        companyName: orgData?.name || branchData?.name,
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyTaxNumber: undefined,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoiceData.language,
        isUrduOnly: invoiceData.isUrduOnly,
        userPreferredLanguage: preferredLanguage,
        invoiceNote: branchData?.invoiceNote,
        customerNameUrdu: (() => {
          const cid = invoiceData.customerId ?? invoice.customerId
          if (!cid || cid === 'walk-in') return undefined
          if (typeof cid === 'object' && cid != null && 'nameUrdu' in cid) {
            const u = String((cid as { nameUrdu?: string }).nameUrdu || '').trim()
            return u || undefined
          }
          return customers.find((c) => String(c._id || c.id) === String(cid))?.nameUrdu?.trim()
        })(),
        printInUrdu: getInvoicePrintInUrdu(),
        printAsQuotation: invoiceData.type === 'quotation',
        invoiceDate: invoiceData.invoiceDate || invoice.invoiceDate,
      }, invoiceData)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        try {
          await fetchAndStashPrintContact(customerIdStr)
        } catch {
          /* prompt in print window */
        }
      }

      const htmlContent = generateInvoiceHTML(printData)
      openPrintWindow(htmlContent, printContact)
      
      // Don't show success toast - let the print dialog speak for itself
    } catch (error: any) {
      console.error('Print error:', error)
      // Only show error if window couldn't be opened (popup blocker)
      if (error.message && error.message.includes('popup blocker')) {
        toast.error('Please allow popups to print. Check your browser settings.')
      } else {
        toast.error('Failed to open print window')
      }
    }
  }, [t, invoice.customerName, invoice.customerId, branchData, customerBalance, preferredLanguage, orgData, customers])

  // A4 Print functionality using utility
  const printA4Invoice = useCallback(async (invoiceData: any) => {
    try {
      const prevBal = invoiceData.previousBalance ?? customerBalance
      const netBal = (prevBal || 0) + (invoiceData.total || 0) - (invoiceData.paidAmount || 0)

      const printData = withCustomerContactForPrint({
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          nameUrdu: item.nameUrdu,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.quantity * item.unitPrice
        })),
        customerId: invoiceData.customerId,
        customerName: invoice.customerName || invoiceData.customerName,
        walkInCustomerName: invoiceData.walkInCustomerName,
        type: invoiceData.type,
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        discount: invoiceData.discount,
        total: invoiceData.total,
        paidAmount: invoiceData.paidAmount,
        balance: invoiceData.balance,
        notes: invoiceData.notes,
        invoiceAddress: branchData?.location?.address?.trim() || undefined,
        invoiceAddressUrdu: branchData?.location?.addressUrdu?.trim() || undefined,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: prevBal,
        netBalance: netBal,
        companyName: orgData?.name || branchData?.name,
        companyNameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim() || undefined,
        companyAddress: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country].filter(Boolean).join(', ') || undefined,
        companyPhone: branchData?.phone,
        companyEmail: branchData?.email,
        companyTaxNumber: undefined,
        companyLogo: orgData?.logo?.url,
        isTrial: orgData?.subscription?.isTrial,
        language: invoiceData.language,
        isUrduOnly: invoiceData.isUrduOnly,
        userPreferredLanguage: preferredLanguage,
        invoiceNote: branchData?.invoiceNote,
        customerNameUrdu: (() => {
          const cid = invoiceData.customerId ?? invoice.customerId
          if (!cid || cid === 'walk-in') return undefined
          if (typeof cid === 'object' && cid != null && 'nameUrdu' in cid) {
            const u = String((cid as { nameUrdu?: string }).nameUrdu || '').trim()
            return u || undefined
          }
          return customers.find((c) => String(c._id || c.id) === String(cid))?.nameUrdu?.trim()
        })(),
        printInUrdu: getInvoicePrintInUrdu(),
        printAsQuotation: invoiceData.type === 'quotation',
        invoiceDate: invoiceData.invoiceDate || invoice.invoiceDate,
      }, invoiceData)

      const customerIdStr = resolveCustomerIdString(printData.customerId)
      const printContact: PrintWindowContact = {
        customerId: customerIdStr,
        phone: printData.customerPhone,
        whatsapp: printData.customerWhatsapp,
      }
      if (customerIdStr) {
        stashPrintContact(printContact)
        try {
          await fetchAndStashPrintContact(customerIdStr)
        } catch {
          /* prompt in print window */
        }
      }

      const htmlContent = generateA4InvoiceHTML(printData)
      openA4PrintWindow(htmlContent, printContact)
      
      // Don't show success toast - let the print dialog speak for itself
    } catch (error: any) {
      console.error('A4 Print error:', error)
      // Only show error if window couldn't be opened (popup blocker)
      if (error.message && error.message.includes('popup blocker')) {
        toast.error('Please allow popups to print. Check your browser settings.')
      } else {
        toast.error('Failed to open print window')
      }
    }
  }, [t, invoice.customerName, invoice.customerId, branchData, customerBalance, preferredLanguage, orgData, customers])

  // Initialize form values when in edit mode
  useEffect(() => {
    if (isEditing && editingInvoice) {
      // setDiscountInput(editingInvoice.discount?.toString() || '0')
      setPaidAmountInput(editingInvoice.paidAmount?.toString() || '0')
      
      // Set the invoice type and status independently
      setInvoice(prev => ({
        ...prev,
        // Keep original type - don't change it based on status
        type: editingInvoice.type || 'credit',
        status: editingInvoice.status
      }))
    }
  }, [isEditing, editingInvoice, setInvoice])

  // Handle walk-in customer business rules
  useEffect(() => {
    if (invoice.customerId === 'walk-in') {
      // Force cash type for walk-in customers
      if (invoice.type !== 'cash') {
        setInvoice(prev => ({ 
          ...prev, 
          type: 'cash'
        }))
      }
    }
  }, [invoice.customerId, invoice.type, setInvoice])

  // Fetch customer balance when customer is selected
  useEffect(() => {
    const fetchCustomerBalance = async () => {
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        setLoadingBalance(true)
        try {
          const url = `${summery.fetchCustomerBalance.url}/${invoice.customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          setCustomerBalance(response.data.balance || 0)
        } catch (error) {
          console.error('Failed to fetch customer balance:', error)
          setCustomerBalance(0)
        } finally {
          setLoadingBalance(false)
        }
      } else {
        setCustomerBalance(0)
      }
    }
    
    fetchCustomerBalance()
  }, [invoice.customerId])

  // Filter customers by name, Urdu name, or phone
  const filteredCustomers = customers.filter((customer) =>
    matchesBilingualSearch(customerSearchQuery, customer.name, customer.nameUrdu, customer.phone),
  )

  // Filter products by name, Urdu name, barcode, description (description may be non-string from API)
  const filteredProducts = products.filter((product) =>
    matchesBilingualSearch(
      productSearchQuery,
      product.name,
      product.nameUrdu,
      product.barcode,
      typeof product.description === 'string' ? product.description : undefined,
    ),
  )

  // Handle product selection for manual entries
  const handleProductSelect = useCallback((itemId: string, product: any) => {
    const productId = product._id || product.id
    if (!productId) {
      console.error('Product has no valid ID:', product)
      toast.error('Selected product has no valid ID')
      return
    }

    // Get current stock from the products state (real-time stock)
    const currentProduct = products.find(p => (p._id || p.id) === productId)
    const currentStock = currentProduct ? currentProduct.stockQuantity : product.stockQuantity
    const unitOptions = getProductUnitOptions(product)
    
    console.log('=== PRODUCT SELECT DEBUG ===')
    console.log('Selected product:', product.name, 'ID:', productId)
    console.log('Current stock from products state:', currentStock)
    console.log('Product stock from parameter:', product.stockQuantity)
    
    // Find the current item to get its quantity
    const currentItem = invoice.items.find(item => item.id === itemId)
    if (!currentItem) {
      console.error('Item not found:', itemId)
      return
    }

    // If this item already had a product selected, restore its stock first
    if (currentItem.productId && !currentItem.isManualEntry) {
      const previousStockQuantity = currentItem.stockQuantity || currentItem.quantity
      setProducts(prevProducts => prevProducts.map(p => 
        (p._id || p.id) === currentItem.productId 
          ? { ...p, stockQuantity: p.stockQuantity + previousStockQuantity }
          : p
      ))
      console.log(`Stock restored for previous product: ${currentItem.name} + ${previousStockQuantity}`)
    }

    const lineValues = calculateInvoiceLineValues({
      product,
      quantity: currentItem.quantity,
      unit: unitOptions[0]?.value || product.unit,
      unitPrice: product.price,
      cost: product.cost,
      conversionFactor: unitOptions[0]?.factor,
    })

    if (!lineValues) {
      toast.error(`Missing conversion for ${product.name}`)
      return
    }

    // Check if we have enough stock for the current quantity
    if (lineValues.stockQuantity > currentStock) {
      toast.error(`${product.name} - Not enough stock available. Current stock: ${currentStock}, Required: ${lineValues.stockQuantity}`)
      console.log('ERROR: Not enough stock for current quantity')
      return
    }
    
    const newItems = invoice.items.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            productId: productId,
            name: product.name,
            nameUrdu: product.nameUrdu,
            image: product.image,
            unit: lineValues.lineUnit,
            conversionFactor: lineValues.conversionFactor,
            stockQuantity: lineValues.stockQuantity,
            unitPrice: product.price,
            cost: product.cost,
            subtotal: lineValues.subtotal,
            profit: lineValues.profit,
            isManualEntry: false
          }
        : item
    )

    // Update stock to reflect the selection (decrease by current item quantity)
    setProducts(prevProducts => prevProducts.map(p => 
      (p._id || p.id) === productId 
        ? { ...p, stockQuantity: p.stockQuantity - lineValues.stockQuantity }
        : p
    ))
    
    console.log(`Stock updated: ${product.name} - decreased by ${lineValues.stockQuantity}`)
    console.log('=== PRODUCT SELECT DEBUG END ===')
    
    if (calculateTotals) {
      // Use parent's calculateTotals function
      const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
      setInvoice(prev => ({
        ...prev,
        items: newItems,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        balance: totals.total - prev.paidAmount
      }))
    } else {
      // Fallback calculation
      const subtotal = newItems.reduce((sum, item) => sum + item.subtotal, 0)
      const totalCost = newItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
      const totalProfit = newItems.reduce((sum, item) => sum + item.profit, 0)
      const discountAmount = invoice.discount || 0
      const taxAmount = ((subtotal - discountAmount) * taxRate) / 100
      const total = subtotal - discountAmount + taxAmount
      const balance = total - invoice.paidAmount
      
      setInvoice(prev => ({
        ...prev,
        items: newItems,
        subtotal,
        totalCost,
        totalProfit,
        tax: taxAmount,
        total,
        balance
      }))
    }
    
    setProductSelectOpen('')
    setProductSearchQuery('')

    // Focus the quantity input of the just-selected product
    setTimeout(() => {
      const qtyInput = qtyInputRefs.current[itemId]
      if (qtyInput) {
        qtyInput.focus()
        qtyInput.select()
      }
    }, 100)
  }, [invoice.items, invoice.discount, invoice.deliveryCharge, invoice.serviceCharge, invoice.paidAmount, taxRate, calculateTotals, setInvoice, products, setProducts])

  const addNewRowAndOpenProduct = useCallback(() => {
    const nextEmptyRow = invoice.items.find((item) => item.isManualEntry && !item.productId)
    if (nextEmptyRow) {
      setProductSelectOpen(nextEmptyRow.id)
      return
    }
    const newItem = createEmptyManualInvoiceItem()
    setInvoice((prev) => ({
      ...prev,
      items: [...prev.items, newItem],
    }))
    setTimeout(() => setProductSelectOpen(newItem.id), 150)
  }, [invoice.items, setInvoice])

  const openProductSelectorForEntry = useCallback(() => {
    const emptyRow = invoice.items.find((item) => item.isManualEntry && !item.productId)
    if (emptyRow) {
      setProductSelectOpen(emptyRow.id)
      return
    }
    const lastManual = [...invoice.items].reverse().find((item) => item.isManualEntry)
    if (lastManual) {
      setProductSelectOpen(lastManual.id)
      return
    }
    addNewRowAndOpenProduct()
  }, [invoice.items, addNewRowAndOpenProduct])

  const handleQuantityKeyDown = useCallback((e: React.KeyboardEvent, currentItemId: string) => {
    onEnterAdvance(e, () => focusField(priceInputRefs.current[currentItemId]))
  }, [])

  const handlePriceKeyDown = useCallback((e: React.KeyboardEvent) => {
    onEnterAdvance(e, addNewRowAndOpenProduct)
  }, [addNewRowAndOpenProduct])

  const focusInvoiceType = useCallback(() => focusField(invoiceTypeTriggerRef.current), [])
  const focusInvoiceDate = useCallback(() => focusField(invoiceDateRef.current), [])

  const openQuickCreate = useCallback(
    (type: 'customer' | 'product', defaultName?: string, productItemId?: string) => {
      setQuickCreate({ type, defaultName: defaultName?.trim() || undefined })
      if (productItemId) setQuickCreateProductItemId(productItemId)
      if (type === 'customer') setCustomerSelectOpen(false)
      if (type === 'product') {
        setProductSelectOpen('')
        setProductSearchQuery('')
      }
    },
    [],
  )

  const handleQuickCreated = useCallback(
    async (type: 'customer' | 'supplier' | 'product', entity: any) => {
      if (type === 'customer') {
        const data = await dispatch(fetchCustomers({ page: 1, limit: 1000 })).unwrap()
        const list = data?.results || (Array.isArray(data) ? data : [])
        setCustomers?.(list)
        const customerId = entity._id || entity.id
        const created = list.find((c: any) => (c._id || c.id) === customerId) || entity
        setInvoice((prev) => ({
          ...prev,
          customerId,
          customerName: created.name,
          type: 'credit',
        }))
        setCustomerSearchQuery('')
        focusInvoiceType()
        return
      }

      if (type === 'product') {
        const data = await dispatch(fetchAllProducts({})).unwrap()
        const list = data?.results || (Array.isArray(data) ? data : [])
        setProducts(list)
        const created = list.find((p: any) => (p._id || p.id) === (entity._id || entity.id)) || entity
        if (quickCreateProductItemId) {
          handleProductSelect(quickCreateProductItemId, created)
        }
        setQuickCreateProductItemId(null)
      }
    },
    [
      dispatch,
      focusInvoiceType,
      handleProductSelect,
      quickCreateProductItemId,
      setCustomers,
      setInvoice,
      setProducts,
    ],
  )

  const handleDiscountChange = useCallback((value: string) => {
    setDiscountInput(value)
    const discountAmount = parseFloat(value) || 0
    updateDiscount(discountAmount)
  }, [updateDiscount])

  const handlePaidAmountChange = useCallback((value: string) => {
    setPaidAmountInput(value)
    const paidAmount = parseFloat(value) || 0
    setInvoice(prev => ({
      ...prev,
      paidAmount,
      balance: prev.total - paidAmount
    }))
  }, [setInvoice])

  const handleSaveInvoice = useCallback(async (printType: 'none' | 'receipt' | 'a4' = 'none') => {
    // Validate required fields
    if (!invoice.customerId) {
      toast.error('Please select a customer')
      return
    }

    // Filter out empty auto-added entries (from multi-entry flow)
    const itemsWithProducts = invoice.items.filter(item => item.productId && item.name)

    if (itemsWithProducts.length === 0) {
      toast.error('Please add items to the invoice')
      return
    }

    // Check if user is authenticated
    const token = localStorage.getItem('accessToken')
    if (!token) {
      toast.error('Please login to save invoice')
      return
    }

    // Set the saving state for the specific button
    setSavingType(printType)

    try {
      if (SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.paymentMethod === 'wallet' && !invoice.walletType) {
        toast.error('Please select a wallet for wallet payment')
        return
      }

      // Prepare invoice data for API
      const validItems = invoice.items.filter(item => {
        // Include items that have productId and name (completed items)
        return item.productId && item.name
      })

      // Validate that we have valid items
      if (validItems.length === 0) {
        toast.error('Please select products for all items before saving')
        return
      }

      const invoiceData = {
        items: validItems.map(item => ({
          productId: item.productId,
          name: item.name,
          nameUrdu: item.nameUrdu,
          image: item.image,
          quantity: item.quantity,
          unit: item.unit,
          conversionFactor: item.conversionFactor,
          stockQuantity: item.stockQuantity,
          unitPrice: item.unitPrice,
          cost: item.cost,
          subtotal: item.subtotal,
          profit: item.profit,
          isManualEntry: item.isManualEntry || false
        })),
        customerId: invoice.customerId,
        customerName: invoice.customerName,
        walkInCustomerName: invoice.walkInCustomerName,
        type: invoice.type,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        discount: invoice.discount,
        total: invoice.total,
        totalProfit: invoice.totalProfit,
        totalCost: invoice.totalCost,
        paidAmount: invoice.paidAmount,
        balance: invoice.balance,
        notes: normalizeInvoiceNotesHtml(invoice.notes || ''),
        deliveryCharge: invoice.deliveryCharge,
        serviceCharge: invoice.serviceCharge,
        roundingAdjustment: invoice.roundingAdjustment,
        splitPayment: invoice.splitPayment,
        paymentMethod: invoice.paymentMethod || 'cash',
        walletType: invoice.paymentMethod === 'wallet' ? (invoice.walletType || '') : undefined,
        loyaltyPoints: invoice.loyaltyPoints,
        couponCode: invoice.couponCode,
        returnPolicy: invoice.returnPolicy,
        invoiceDate: invoice.invoiceDate,
        language: invoice.language,
        isUrduOnly: invoice.isUrduOnly,
      }

      // Don't include status in the payload as it's not allowed in updates
      // Status is likely managed by the backend

      console.log('Saving invoice - isEditing:', isEditing, 'editingInvoice._id:', editingInvoice?._id)
      console.log('Invoice data being sent:', invoiceData)
      
      let result: Record<string, unknown>

      const canSaveOffline =
        isElectron &&
        !online &&
        !isEditing &&
        invoice.type === 'cash' &&
        invoice.paymentMethod !== 'wallet'

      if (canSaveOffline) {
        const electron = getElectronAPI()
        const syncStatus = await electron?.sync.status()
        const deviceId = syncStatus?.deviceId || 'local-device'
        const { clientId, localInvoiceNumber, operation } = buildOfflineInvoicePayload(invoiceData, deviceId)
        await electron?.sync.queue(operation)
        result = {
          ...invoiceData,
          id: clientId,
          invoiceNumber: localInvoiceNumber,
          _offline: true,
        }
        toast.success(`Invoice ${localInvoiceNumber} saved offline. It will sync when you are back online.`)
      } else if (isEditing && editingInvoice?._id) {
        result = await updateInvoice({ id: editingInvoice._id, ...invoiceData }).unwrap()
      } else {
        result = await createInvoice(invoiceData).unwrap()
      }
      
      console.log('Save result:', result)
      
      const successMessage = canSaveOffline
        ? null
        : isEditing 
        ? `Invoice ${editingInvoice?.invoiceNumber || result.invoiceNumber} updated successfully!`
        : `Invoice ${result.invoiceNumber} created successfully!`
      
      if (successMessage) {
        toast.success(successMessage)
      }
      
      // Call success callback to commit stock changes
      if (onSaveSuccess) {
        onSaveSuccess()
      }

      // Refresh customer balance after successful save and prepare print data
      let updatedBalance = customerBalance
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        try {
          const url = `${summery.fetchCustomerBalance.url}/${invoice.customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          updatedBalance = response.data.balance || 0
          setCustomerBalance(updatedBalance)
          console.log('Customer balance refreshed:', updatedBalance)
        } catch (error) {
          console.error('Failed to refresh customer balance:', error)
        }
      }
      
      // Print if requested
      if (printType !== 'none') {
        // Enhanced customer name resolution for both create and edit scenarios
        let resolvedCustomerName = null
        let resolvedWalkInCustomerName = null
        
        if (result.customerId === 'walk-in') {
          resolvedWalkInCustomerName = result.walkInCustomerName || 
                                     invoice.walkInCustomerName || 
                                     editingInvoice?.walkInCustomerName
        } else {
          // For regular customers, prioritize the custom display name entered by user
          resolvedCustomerName = invoice.customerName || 
                               result.customerName || 
                               editingInvoice?.customerName ||
                               (result.customerId || invoice.customerId || editingInvoice?.customerId 
                                 ? customers.find(c => (c._id || c.id) === (result.customerId || invoice.customerId || editingInvoice?.customerId))?.name 
                                 : null)
        }

        let resolvedCustomerUrdu = ''
        const cidForUrdu = result.customerId ?? invoice.customerId ?? editingInvoice?.customerId
        if (cidForUrdu && cidForUrdu !== 'walk-in') {
          if (typeof cidForUrdu === 'object' && cidForUrdu != null && 'nameUrdu' in cidForUrdu) {
            resolvedCustomerUrdu = String((cidForUrdu as { nameUrdu?: string }).nameUrdu || '').trim()
          } else {
            const idStr = String(cidForUrdu)
            resolvedCustomerUrdu = customers.find((c) => String(c._id || c.id) === idStr)?.nameUrdu?.trim() || ''
          }
        }
        
        // Calculate previous balance before current invoice:
        // server returned `updatedBalance` which likely includes this invoice.
        // invoiceEffect = current invoice total - paid now
        const invoiceTotal = Number(result.total ?? invoice.total ?? 0)
        const invoicePaid = Number(result.paidAmount ?? invoice.paidAmount ?? 0)
        const invoiceEffect = invoiceTotal - invoicePaid
        const previousBalanceBeforeInvoice = updatedBalance - invoiceEffect

        const savedInvoicePayload = {
          ...result,
          invoiceNumber: result.invoiceNumber || editingInvoice?.invoiceNumber,
          items: validItems,
          customerId: result.customerId || invoice.customerId || editingInvoice?.customerId,
          customerName: resolvedCustomerName,
          customerNameUrdu: resolvedCustomerUrdu || undefined,
          walkInCustomerName: resolvedWalkInCustomerName,
          previousBalance: previousBalanceBeforeInvoice,
          newBalance: updatedBalance,
          language: result.language || invoice.language,
          isUrduOnly: result.isUrduOnly ?? invoice.isUrduOnly,
          invoiceDate: result.invoiceDate || invoice.invoiceDate,
          notes: result.notes ?? invoice.notes,
        }

        if (printType === 'receipt') {
          printInvoice(savedInvoicePayload)
        } else if (printType === 'a4') {
          printA4Invoice(savedInvoicePayload)
        }
      }
      
    } catch (error: any) {
      console.error('Error saving invoice:', error)
      
      if (error?.status === 401) {
        toast.error('Authentication failed. Please login again.')
      } else {
        toast.error(error?.data?.message || 'Failed to save invoice')
      }
    } finally {
      // Reset saving state
      setSavingType(null)
    }
  }, [invoice, createInvoice, updateInvoice, isEditing, editingInvoice, t, printInvoice, printA4Invoice, customers, onSaveSuccess, customerBalance, isElectron, online])

  useInvoiceSaveShortcuts(
    () => handleSaveInvoice('none'),
    () => handleSaveInvoice('receipt'),
    () => handleSaveInvoice('a4'),
    savingType !== null,
  )

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cash': return 'bg-green-100 text-green-800'
      case 'credit': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      case 'quotation': return 'bg-violet-100 text-violet-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  // const getStatusColor = (status: string) => {
  //   switch (status) {
  //     case 'paid': return 'bg-green-100 text-green-800'
  //     case 'finalized': return 'bg-purple-100 text-purple-800'
  //     case 'draft': return 'bg-blue-100 text-blue-800'
  //     case 'cancelled': return 'bg-gray-100 text-gray-800'
  //     case 'overdue': return 'bg-red-100 text-red-800'
  //     case 'pending': return 'bg-yellow-100 text-yellow-800'
  //     default: return 'bg-gray-100 text-gray-800'
  //   }
  // }

  return (
    <div className='space-y-4'>
      {/* Keyboard Language Override 
      <KeyboardLanguageOverride />*/}
      
      {/* Customer and Type Selection */}
      <Card>
        <CardHeader>
          <div className='flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between'>
            <CardTitle className='flex items-center gap-2'>
              {onBackToList && (
                <Button variant="ghost" size="sm" onClick={onBackToList}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <DollarSign className='h-5 w-5' />
              {t('invoice_details')}
            </CardTitle>

            <div className='flex w-full flex-wrap items-center gap-x-6 gap-y-2 lg:w-auto lg:justify-end'>
              <div className='flex items-center gap-2'>
                <Label htmlFor='invoice-print-urdu-header' className='text-sm font-normal whitespace-nowrap'>
                  {t('urdu_print')}
                </Label>
                <Switch
                  id='invoice-print-urdu-header'
                  checked={printReceiptInUrdu}
                  onCheckedChange={(v) => {
                    setPrintReceiptInUrdu(v)
                    setInvoicePrintInUrdu(v)
                  }}
                />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className='space-y-4'>
          {/* Show invoice number in edit mode */}
          {isEditing && editingInvoice?.invoiceNumber && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="font-medium text-blue-800 flex-shrink-0">Invoice Number:</Label>
                <span 
                  className="font-bold text-blue-900 truncate" 
                  title={editingInvoice.invoiceNumber}
                >
                  {editingInvoice.invoiceNumber}
                </span>
              </div>
            </div>
          )}
          
          <div className={`grid gap-4 ${editingInvoice ? 'grid-cols-2' : 'grid-cols-2'}`}>
            <div>
              <Label htmlFor="customer" className='mb-2'>
                {t('customer')} <span className="text-red-500">*</span>
              </Label>
              <div className="flex gap-2">
              <Popover open={customerSelectOpen} onOpenChange={setCustomerSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSelectOpen}
                    onKeyDown={(e) => {
                      if (!customerSelectOpen && invoice.customerId) {
                        onEnterAdvance(e, focusInvoiceType)
                      }
                    }}
                    className={`flex-1 justify-between min-h-[2.5rem] h-auto py-0 ${
                      !invoice.customerId ? 'border-red-500 bg-red-50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Search className="w-4 h-4 flex-shrink-0" />
                      {invoice.customerId ? (
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {invoice.customerId === 'walk-in' ? (
                            <Badge variant="secondary" className="flex items-center gap-1 max-w-full min-w-0">
                              <User className="w-3 h-3 flex-shrink-0" />
                              <span className="text-xs truncate" title={t('walk_in_customer')}>
                                {t('walk_in_customer')}
                              </span>
                            </Badge>
                          ) : (
                            (() => {
                              const selectedCustomer = customers.find(c => (c._id || c.id) === invoice.customerId)
                              console.log('Customer search:', { 
                                customerId: invoice.customerId, 
                                customerName: invoice.customerName,
                                walkInCustomerName: invoice.walkInCustomerName,
                                selectedCustomer,
                                customersLength: customers.length 
                              })
                              
                              if (selectedCustomer) {
                                const urdu = selectedCustomer.nameUrdu?.trim()
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full min-w-0 pl-1">
                                    <ContactPhotoCell
                                      picture={selectedCustomer.picture}
                                      name={selectedCustomer.name || ''}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className="flex min-w-0 flex-row flex-wrap items-center gap-x-1.5 gap-y-0">
                                      <span className={getTextClasses(selectedCustomer.name, 'text-xs truncate shrink-0')} title={selectedCustomer.name}>
                                        {selectedCustomer.name}
                                      </span>
                                      {urdu ? (
                                        <span dir="rtl" className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(urdu))} title={urdu}>
                                          {urdu}
                                        </span>
                                      ) : null}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.customerName) {
                                // Fallback to showing the stored customer name if customer not found in list
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full pl-1">
                                    <ContactPhotoCell
                                      picture={undefined}
                                      name={invoice.customerName}
                                      className="h-5 w-5 shrink-0 rounded-full"
                                    />
                                    <span className={getTextClasses(invoice.customerName, "text-xs truncate")} title={invoice.customerName}>
                                      {invoice.customerName}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.walkInCustomerName) {
                                // Show walk-in customer name
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                                    <User className="w-3 h-3 flex-shrink-0" />
                                    <span className={getTextClasses(invoice.walkInCustomerName, "text-xs truncate")} title={invoice.walkInCustomerName}>
                                      {invoice.walkInCustomerName}
                                    </span>
                                  </Badge>
                                )
                              }
                              return null
                            })()
                          )}
                        </div>
                      ) : (
                        <span className={`truncate ${
                          !invoice.customerId ? 'text-red-500' : 'text-muted-foreground'
                        }`} title={t('select_customer')}>
                          {t('select_customer')} {!invoice.customerId && '*'}
                        </span>
                      )}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align={isRTL ? "end" : "start"} side="bottom" sideOffset={4}>
                  <Command shouldFilter={false}>
                    <div className="relative">
                      <CommandInput 
                        placeholder={t('search_customers_by_name_or_phone')} 
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                        className="pr-10"
                      />
                      <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                        <VoiceInputButton 
                          onTranscript={(text) => {
                            setCustomerSearchQuery(text);
                          }}
                          language={voiceLanguage}
                          size="sm"
                        />
                      </div>
                    </div>
                    {customersLoading ? (
                      <div className="py-6 text-center text-sm text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                        {t('Loading customers...')}
                      </div>
                    ) : filteredCustomers.length === 0 && customerSearchQuery.trim() ? (
                      canCreateCustomer ? (
                        <EntityCreateEmptyPrompt
                          message={t('no_customers_found')}
                          actionLabel={t('add_customer')}
                          onCreate={() => openQuickCreate('customer', customerSearchQuery)}
                        />
                      ) : (
                        <CommandEmpty>{t('no_customers_found')}</CommandEmpty>
                      )
                    ) : null}
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setInvoice(prev => ({ ...prev, customerId: 'walk-in' }))
                            setCustomerSelectOpen(false)
                            setCustomerSearchQuery('')
                            focusInvoiceType()
                          }}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <div className="flex items-center gap-2 flex-1">
                            <User className="w-4 h-4" />
                            <span>{t('walk_in_customer')}</span>
                          </div>
                          {invoice.customerId === 'walk-in' && (
                            <div className="w-4 h-4 rounded-sm flex items-center justify-center">
                              <Check className="w-3 h-3 text-black" />
                            </div>
                          )}
                        </CommandItem>
                        {filteredCustomers.map((customer) => {
                          const customerId = customer._id || customer.id
                          const isSelected = invoice.customerId === customerId
                          return (
                            <CommandItem
                              key={customerId}
                              onSelect={() => {
                                setInvoice(prev => ({ 
                                  ...prev, 
                                  customerId,
                                  customerName: customer.name, // Set customer name for editing
                                  type: 'credit',
                                }))
                                setCustomerSelectOpen(false)
                                setCustomerSearchQuery('')
                                focusInvoiceType()
                              }}
                              className="flex items-center gap-3 cursor-pointer p-3"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <ContactPhotoCell
                                  picture={customer.picture}
                                  name={customer.name || ''}
                                  className="h-8 w-8 shrink-0"
                                />
                                <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                                  <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                    <span className={getTextClasses(customer.name, 'truncate font-medium shrink-0')} title={customer.name}>
                                      {customer.name}
                                    </span>
                                    {customer.nameUrdu?.trim() ? (
                                      <span
                                        dir="rtl"
                                        className={cn('min-w-0 truncate', getUrduSecondaryNameClasses(customer.nameUrdu))}
                                        title={customer.nameUrdu.trim()}
                                      >
                                        {customer.nameUrdu.trim()}
                                      </span>
                                    ) : null}
                                  </div>
                                  {customer.phone && (
                                    <span className="text-xs text-muted-foreground truncate" title={customer.phone}>
                                      {customer.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0">
                                  <Check className="w-3 h-3 text-black" />
                                </div>
                              )}
                            </CommandItem>
                          )
                        })}
                        {canCreateCustomer ? (
                          <CommandItem
                            onSelect={() => openQuickCreate('customer', customerSearchQuery)}
                            className="flex cursor-pointer items-center gap-2 border-t p-3 text-primary"
                          >
                            <Plus className="h-4 w-4" />
                            <span>{t('add_customer')}</span>
                          </CommandItem>
                        ) : null}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {canCreateCustomer ? (
                <EntityCreateShortcutButton
                  label={t('add_customer')}
                  onClick={() => openQuickCreate('customer', customerSearchQuery)}
                />
              ) : null}
              </div>
            </div>
            
            <div>
              <Label htmlFor="type" className='mb-2'>{t('invoice_type')}</Label>
              <Select
                value={invoice.type}
                onOpenChange={setInvoiceTypeSelectOpen}
                onValueChange={(value: 'cash' | 'credit' | 'pending' | 'quotation') => updateInvoiceType(value)}
              >
                <SelectTrigger
                  ref={invoiceTypeTriggerRef}
                  className='w-full'
                  onKeyDown={(e) => {
                    if (!invoiceTypeSelectOpen) {
                      onEnterAdvance(e, focusInvoiceDate)
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('cash')}</SelectItem>
                  {/* Disable credit and pending for walk-in customers */}
                  <SelectItem 
                    value="credit" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('credit')}
                  </SelectItem>
                  <SelectItem 
                    value="pending" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('pending')}
                  </SelectItem>
                  <SelectItem 
                    value="quotation" 
                    disabled={invoice.customerId === 'walk-in'}
                  >
                    {t('quotation') || 'Quotation'}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            {/* {isEditing && invoice.status && (
              <div>
                <Label className='mb-2'>{t('status') || 'Status'}</Label>
                <div className="flex items-center h-10 w-full">
                  <Badge className={getStatusColor(invoice.status)}>
                    {(invoice.status || 'draft').toUpperCase()}
                  </Badge>
                </div>
              </div>
            )} */}
          </div>

          <div>
            <Label htmlFor="invoiceDate">Invoice Date</Label>
            <Input
              ref={invoiceDateRef}
              type="date"
              value={invoice.invoiceDate || new Date().toISOString().split('T')[0]}
              onChange={(e) => setInvoice(prev => ({ ...prev, invoiceDate: e.target.value }))}
              onKeyDown={(e) => onEnterAdvance(e, openProductSelectorForEntry)}
            />
          </div>

          {invoice.customerId === 'walk-in' && (
            <div>
              <Label htmlFor="walkInCustomerName">{t('customer_name')}</Label>
              <SmartInput
                id="walkInCustomerName"
                placeholder={t('enter_customer_name')}
                value={invoice.walkInCustomerName || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, walkInCustomerName: e.target.value }))}
                showVoiceInput={true}
                voiceInputSize="sm"
                className="w-full"
              />
            </div>
          )}

          {((invoice.customerId && invoice.customerId !== 'walk-in') || invoice.type === 'pending' || invoice.type === 'quotation') && invoice.customerId !== 'walk-in' ? (
            <div>
              <Label htmlFor="customerDisplayName">{t('customer_name')}</Label>
              <SmartInput
                id="customerDisplayName"
                placeholder={t('enter_customer_name') || 'Enter customer name'}
                value={invoice.customerName || ''}
                onChange={(e) => setInvoice(prev => ({ ...prev, customerName: e.target.value }))}
                showVoiceInput={true}
                voiceInputSize="sm"
                className="w-full"
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Invoice Items */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle>{t('invoice_items')} ({invoice.items.length})</CardTitle>
            <div className="flex items-center gap-2">
              {canCreateProduct ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openQuickCreate('product', productSearchQuery)}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {t('add_product')}
                </Button>
              ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                const newItem = createEmptyManualInvoiceItem()
                setInvoice(prev => ({
                  ...prev,
                  items: [...prev.items, newItem],
                }))
              }}
              className='flex items-center gap-1'
            >
              <Plus className='h-4 w-4' />
              {t('add_item')}
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          <div ref={itemsScrollRef} className='space-y-2'>
            {invoice.items.length === 0 ? (
              <div className='text-center text-muted-foreground py-8'>
                {t('no_items_added')}
              </div>
            ) : (
              invoice.items.map((item) => {
                const currentProduct = products.find(p => (p._id || p.id) === item.productId)
                const remainingStock = currentProduct?.stockQuantity
                return (
                  <div key={item.id} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                    {/* Row 1: Image + Name/Selector + Delete */}
                    <div className='flex items-start gap-3 p-3'>
                      {item.image?.url ? (
                        <img
                          src={item.image.url}
                          alt={item.name}
                          className='w-10 h-10 object-cover rounded-lg flex-shrink-0 mt-0.5'
                        />
                      ) : (
                        <div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5'>
                          <Package className='h-5 w-5 text-muted-foreground/50' />
                        </div>
                      )}

                      <div className='flex-1 min-w-0'>
                        {item.isManualEntry ? (
                          <div className='space-y-1'>
                            <Popover
                              open={productSelectOpen === item.id}
                              onOpenChange={(open) => {
                                setProductSelectOpen(open ? item.id : '')
                                setProductSearchQuery('')
                              }}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  onKeyDown={(e) => {
                                    if (productSelectOpen !== item.id && item.productId) {
                                      onEnterAdvance(e, () => focusField(qtyInputRefs.current[item.id]))
                                    }
                                  }}
                                  className={`w-full justify-between min-h-8 h-auto py-1 text-xs ${
                                    !item.productId ? 'border-red-500 bg-red-50' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Search className="w-3 h-3 flex-shrink-0" />
                                    <span className='flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0 text-left'>
                                      <span
                                        className={getTextClasses(item.name || t('select_product'), `truncate shrink-0 ${
                                          !item.productId ? 'text-red-500' : 'text-muted-foreground'
                                        }`)}
                                        title={item.name || t('select_product')}
                                      >
                                        {item.name || t('select_product')}
                                        {!item.productId && ' *'}
                                      </span>
                                      {item.nameUrdu?.trim() ? (
                                        <span
                                          className={cn('min-w-0 truncate rtl text-xs shrink', getUrduSecondaryNameClasses(item.nameUrdu))}
                                          dir='rtl'
                                          title={item.nameUrdu.trim()}
                                        >
                                          {item.nameUrdu.trim()}
                                        </span>
                                      ) : null}
                                    </span>
                                  </div>
                                  <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0" align="start" side="bottom" sideOffset={4}>
                                <Command shouldFilter={false}>
                                  <div className="relative">
                                    <CommandInput
                                      placeholder={t('search_products')}
                                      value={productSearchQuery}
                                      onValueChange={setProductSearchQuery}
                                    />
                                  <div className="absolute right-2 top-1/2 transform -translate-y-1/2 z-10">
                                    <VoiceInputButton
                                      onTranscript={setProductSearchQuery}
                                      language={voiceLanguage}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                                <CommandList className="max-h-[300px] overflow-y-auto">
                                  {productsLoading && products.length === 0 ? (
                                    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                                      {t('loading_products')}
                                    </div>
                                  ) : filteredProducts.length === 0 ? (
                                    canCreateProduct ? (
                                      <EntityCreateEmptyPrompt
                                        message={t('no_products_found')}
                                        actionLabel={t('add_product')}
                                        onCreate={() => openQuickCreate('product', productSearchQuery, item.id)}
                                      />
                                    ) : (
                                      <div className="py-6 text-center text-sm text-muted-foreground">
                                        {t('no_products_found')}
                                      </div>
                                    )
                                  ) : (
                                    <CommandGroup>
                                      {filteredProducts.map((product) => {
                                        const pid = product._id || product.id
                                        return (
                                        <CommandItem
                                          key={String(pid)}
                                          value={`${String(pid)}-${String(product.name ?? '')}`}
                                          onSelect={() => handleProductSelect(item.id, product)}
                                          className="flex items-center gap-2 cursor-pointer p-3"
                                        >
                                          <div className="flex items-center gap-3 flex-1 min-w-0">
                                            {product.image?.url ? (
                                              <img
                                                src={product.image.url}
                                                alt={product.name}
                                                className="w-8 h-8 object-cover rounded flex-shrink-0"
                                              />
                                            ) : (
                                              <div className="w-8 h-8 rounded bg-muted flex items-center justify-center flex-shrink-0">
                                                <Package className="w-4 h-4 text-muted-foreground" />
                                              </div>
                                            )}
                                            <div className="flex flex-col flex-1 min-w-0">
                                              <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                                <span className={getTextClasses(product.name, 'text-sm font-medium truncate shrink-0')} title={product.name}>
                                                  {product.name}
                                                </span>
                                                {product.nameUrdu?.trim() ? (
                                                  <span
                                                    dir="rtl"
                                                    className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(product.nameUrdu))}
                                                    title={product.nameUrdu.trim()}
                                                  >
                                                    {product.nameUrdu.trim()}
                                                  </span>
                                                ) : null}
                                              </div>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span key={`price-${product._id}`}>Rs{product.price}</span>
                                                <span
                                                  key={`stock-${product._id}`}
                                                  className={product.stockQuantity <= 0 ? 'text-red-600 font-medium' : product.stockQuantity <= 5 ? 'text-red-500 font-medium' : product.stockQuantity <= 20 ? 'text-amber-500' : 'text-green-600'}
                                                >
                                                  Stock: {product.stockQuantity}
                                                </span>
                                                {product.cost != null && (
                                                  <span
                                                    key={`cost-${product._id}`}
                                                    className={cn(
                                                      'text-amber-600 dark:text-amber-400 font-medium transition-all duration-200 select-none',
                                                      showProductCost
                                                        ? 'cursor-default'
                                                        : 'cursor-pointer blur-sm opacity-60 hover:blur-none hover:opacity-100',
                                                    )}
                                                    title="Purchase cost"
                                                  >
                                                    Cost: Rs{Number(product.cost).toFixed(2)}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        </CommandItem>
                                        )
                                      })}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                        ) : (
                          <div className='min-w-0 flex-1'>
                            <BilingualName primary={item.name} secondary={item.nameUrdu} primaryClassName='font-semibold text-sm' />
                            <div className='flex items-center gap-2 mt-0.5 flex-wrap'>
                              <span className='text-xs text-muted-foreground'>Rs{item.unitPrice} · {item.unit || 'pcs'}</span>
                              {remainingStock !== undefined && (
                                <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                  remainingStock <= 0 ? 'bg-red-100 text-red-700' :
                                  remainingStock <= 5 ? 'bg-red-50 text-red-500' :
                                  remainingStock <= 20 ? 'bg-amber-50 text-amber-600' :
                                  'bg-green-50 text-green-700'
                                }`}>
                                  <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    remainingStock <= 0 ? 'bg-red-500' :
                                    remainingStock <= 5 ? 'bg-red-400' :
                                    remainingStock <= 20 ? 'bg-amber-400' :
                                    'bg-green-500'
                                  }`} />
                                  {remainingStock <= 0 ? 'Out of stock' : `${remainingStock} left`}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeFromInvoice(item.id)}
                        className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                      >
                        <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                      </Button>
                    </div>

                    {/* Row 2: Controls — only when a product is selected */}
                    {(item.productId && item.name) && (
                      <div className='flex items-center gap-3 flex-wrap border-t bg-muted/20 px-3 py-2.5'>
                        {/* Quantity Stepper */}
                        <div className='flex items-center gap-1.5'>
                          <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity - 1)}
                              className='h-7 w-7 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            >
                              <Minus className='h-3.5 w-3.5' />
                            </Button>
                            <Input
                              ref={(el) => { qtyInputRefs.current[item.id] = el }}
                              type="number"
                              min="1"
                              value={item.quantity}
                              onChange={(e) => {
                                const qty = parseInt(e.target.value) || 1
                                updateQuantity(item.id, qty)
                              }}
                              onKeyDown={(e) => handleQuantityKeyDown(e, item.id)}
                              onFocus={(e) => e.target.select()}
                              className='h-7 w-20 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => updateQuantity(item.id, item.quantity + 1)}
                              className='h-7 w-7 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            >
                              <Plus className='h-3.5 w-3.5' />
                            </Button>
                          </div>
                          <span className='text-xs text-muted-foreground'>{item.unit || 'pcs'}</span>
                        </div>

                        {showUnitConversions && (
                          <div className='flex flex-col gap-1 min-w-[80px]'>
                            <Label className='text-[10px] text-muted-foreground'>{t('unit')}</Label>
                            <Select
                              value={item.unit || 'pcs'}
                              onValueChange={(value) => {
                                const selectedProduct = products.find((p) => (p._id || p.id) === item.productId)
                                if (!selectedProduct) {
                                  toast.error('Product not found for this line')
                                  return
                                }

                                const adjustedUnitPrice = getUnitAdjustedPrice({
                                  product: selectedProduct,
                                  unit: value,
                                  basePrice: selectedProduct.price || item.unitPrice || 0,
                                })

                                if (adjustedUnitPrice === null) {
                                  toast.error(`Missing conversion for ${item.name}`)
                                  return
                                }

                                const lineValues = calculateInvoiceLineValues({
                                  product: selectedProduct,
                                  quantity: item.quantity,
                                  unit: value,
                                  unitPrice: adjustedUnitPrice,
                                  cost: item.cost,
                                })

                                if (!lineValues) {
                                  toast.error(`Missing conversion for ${item.name}`)
                                  return
                                }

                                const previousStockQuantity = item.stockQuantity || item.quantity
                                const stockDifference = lineValues.stockQuantity - previousStockQuantity

                                if (stockDifference > 0 && stockDifference > selectedProduct.stockQuantity) {
                                  toast.error(`${item.name} - Only ${selectedProduct.stockQuantity} pcs available for this unit`)
                                  return
                                }

                                if (stockDifference !== 0) {
                                  setProducts((prevProducts) => prevProducts.map((productRow) =>
                                    (productRow._id || productRow.id) === item.productId
                                      ? { ...productRow, stockQuantity: productRow.stockQuantity - stockDifference }
                                      : productRow
                                  ))
                                }

                                const newItems = invoice.items.map((invoiceItem) =>
                                  invoiceItem.id === item.id
                                    ? {
                                        ...invoiceItem,
                                        unit: lineValues.lineUnit,
                                        conversionFactor: lineValues.conversionFactor,
                                        stockQuantity: lineValues.stockQuantity,
                                        unitPrice: adjustedUnitPrice,
                                        subtotal: lineValues.subtotal,
                                        profit: lineValues.profit,
                                      }
                                    : invoiceItem
                                )

                                if (calculateTotals) {
                                  const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
                                  setInvoice((prev) => ({
                                    ...prev,
                                    items: newItems,
                                    subtotal: totals.subtotal,
                                    tax: totals.tax,
                                    total: totals.total,
                                    totalProfit: totals.totalProfit,
                                    totalCost: totals.totalCost,
                                    balance: totals.total - prev.paidAmount,
                                  }))
                                }
                              }}
                            >
                              <SelectTrigger className='h-6 text-xs px-2'>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(products.find((p) => (p._id || p.id) === item.productId)
                                  ? getProductUnitOptions(products.find((p) => (p._id || p.id) === item.productId))
                                  : [{ value: item.unit || 'pcs', label: item.unit || 'pcs' }]
                                ).map((unitOption) => (
                                  <SelectItem key={unitOption.value} value={unitOption.value}>
                                    {unitOption.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}

                        {/* Price Input */}
                        <span className='text-muted-foreground/60 text-sm select-none'>×</span>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <span className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-r font-medium select-none'>Rs</span>
                          <Input
                            ref={(el) => { priceInputRefs.current[item.id] = el }}
                            type="text"
                            inputMode="decimal"
                            value={item.unitPrice > 0 ? item.unitPrice : ''}
                            onKeyDown={handlePriceKeyDown}
                            onChange={(e) => {
                              const newPrice = parseFloat(e.target.value) || 0
                              const newItems = invoice.items.map(i =>
                                i.id === item.id
                                  ? (() => {
                                      const selectedProduct = products.find((p) => (p._id || p.id) === i.productId) || { unit: i.unit }
                                      const lineValues = calculateInvoiceLineValues({
                                        product: selectedProduct,
                                        quantity: i.quantity,
                                        unit: i.unit,
                                        unitPrice: newPrice,
                                        cost: i.cost,
                                        conversionFactor: i.conversionFactor,
                                      })

                                      if (!lineValues) {
                                        return i
                                      }

                                      return {
                                        ...i,
                                        unitPrice: newPrice,
                                        subtotal: lineValues.subtotal,
                                        profit: lineValues.profit,
                                        stockQuantity: lineValues.stockQuantity,
                                        conversionFactor: lineValues.conversionFactor,
                                      }
                                    })()
                                  : i
                              )

                              if (calculateTotals) {
                                const totals = calculateTotals(newItems, invoice.discount, invoice.deliveryCharge || 0, invoice.serviceCharge || 0)
                                setInvoice(prev => ({
                                  ...prev,
                                  items: newItems,
                                  subtotal: totals.subtotal,
                                  tax: totals.tax,
                                  total: totals.total,
                                  totalProfit: totals.totalProfit,
                                  totalCost: totals.totalCost,
                                  balance: totals.total - prev.paidAmount
                                }))
                              } else {
                                const subtotal = newItems.reduce((sum, item) => sum + item.subtotal, 0)
                                const totalCost = newItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
                                const totalProfit = newItems.reduce((sum, item) => sum + item.profit, 0)
                                const discountAmount = invoice.discount || 0
                                const taxAmount = ((subtotal - discountAmount) * taxRate) / 100
                                const total = subtotal - discountAmount + taxAmount
                                const balance = total - invoice.paidAmount

                                setInvoice(prev => ({
                                  ...prev,
                                  items: newItems,
                                  subtotal,
                                  totalCost,
                                  totalProfit,
                                  tax: taxAmount,
                                  total,
                                  balance
                                }))
                              }
                            }}
                            onFocus={(e) => e.target.select()}
                            className='h-7 w-16 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>

                        {/* Subtotal */}
                        <div className='flex items-center gap-1.5 ml-auto'>
                          <span className='text-muted-foreground/60 text-sm select-none'>=</span>
                          <div className='text-right'>
                            <p className='font-bold text-sm'>Rs{item.subtotal}</p>
                            {showProfitDetails && (
                              <p className='text-xs text-green-600'>+Rs{item.profit}</p>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals and Payment */}
      <Card>
        <CardContent className='p-4 space-y-4'>
          {/* Discount Control */}
          <div>
            <Label htmlFor="discount">{t('discount')} (Rs)</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={discountInput}
              onChange={(e) => handleDiscountChange(e.target.value)}
              placeholder="0.00"
            />
          </div>

          <Separator />

          {/* Totals Display */}
          <div className='space-y-2'>
            <div className='flex justify-between gap-6'>
              <span className='text-muted-foreground'>{t('subtotal')}:</span>
              <span className='tabular-nums font-medium'>Rs{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className='flex justify-between gap-6 text-red-600'>
                <span>{t('discount')}:</span>
                <span className='tabular-nums'>-Rs{invoice.discount.toFixed(2)}</span>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className='flex justify-between gap-6'>
                <span className='text-muted-foreground'>
                  {t('tax')} ({taxRate}%):
                </span>
                <span className='tabular-nums'>Rs{invoice.tax.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className='flex justify-between gap-6 font-bold text-lg'>
              <span>{t('total')}:</span>
              <span className='tabular-nums'>Rs{invoice.total.toFixed(2)}</span>
            </div>
            
            {/* Profit Display */}
            {/* <div className='flex justify-between items-center'> */}
            <div className='justify-between items-center hidden'>
              <span className='text-green-600'>{t('total_profit')}:</span>
              <div className='flex items-center gap-2'>
                <span className='text-green-600 font-medium'>
                  Rs{invoice.totalProfit.toFixed(2)}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowProfitDetails(!showProfitDetails)}
                >
                  <Calculator className='h-4 w-4' />
                </Button>
              </div>
            </div>
          </div>

          <Separator />

          {/* Payment Details */}
          <div className='space-y-4'>
            <div className='flex items-center gap-2'>
              <Badge className={getTypeColor(invoice.type)}>
                {t(invoice.type)}
              </Badge>
            </div>

            {/* Payment Method selector — gated by SHOW_INVOICE_PAYMENT_METHOD_UI */}
            {SHOW_INVOICE_PAYMENT_METHOD_UI && invoice.type !== 'pending' && invoice.type !== 'quotation' && (
              <div className='space-y-3'>
                <div>
                  <Label className='mb-2 block'>{t('payment_method') || 'Payment Method'}</Label>
                  <Select
                    value={invoice.paymentMethod || 'cash'}
                    onValueChange={(val: 'cash' | 'wallet' | 'bank' | 'card') =>
                      setInvoice(prev => ({ ...prev, paymentMethod: val, walletType: val !== 'wallet' ? undefined : prev.walletType }))
                    }
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">{t('cash') || 'Cash'}</SelectItem>
                      <SelectItem value="wallet">{t('wallet') || 'Wallet'}</SelectItem>
                      <SelectItem value="bank">{t('bank_transfer') || 'Bank Transfer'}</SelectItem>
                      <SelectItem value="card">{t('card') || 'Card'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Wallet selector — shown when payment method is wallet */}
                {invoice.paymentMethod === 'wallet' && (
                  <div>
                    <Label className='mb-2 block'>{t('select_wallet') || 'Select Wallet'}</Label>
                    {wallets.length > 0 ? (
                      <Select
                        value={invoice.walletType || ''}
                        onValueChange={(val) => setInvoice(prev => ({ ...prev, walletType: val }))}
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue placeholder={t('select_wallet') || 'Select wallet...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {wallets.map(w => (
                            <SelectItem key={w.id} value={w.type}>
                              {w.type}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className='text-xs text-muted-foreground'>{t('no_wallets_configured') || 'No wallets configured. Add wallets in Mobile Shop → Wallet.'}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {invoice.type !== 'pending' && invoice.type !== 'quotation' && (
              <>
                {invoice.type === 'credit' && (
                  <div>
                    <Label htmlFor="paidAmount">{t('paid_amount')}</Label>
                    <Input
                      type="text"
                      inputMode="decimal"
                      value={paidAmountInput}
                      onChange={(e) => handlePaidAmountChange(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* Cash Received & Change Calculator — only for cash payments */}
                {invoice.type === 'cash' && (!invoice.paymentMethod || invoice.paymentMethod === 'cash') && (
                  <div className='space-y-3 p-3 rounded-lg border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800'>
                    <h4 className='text-sm font-semibold text-emerald-800 dark:text-emerald-200 flex items-center gap-2'>
                      <Banknote className='h-4 w-4' />
                      Cash Received
                    </h4>
                    <div>
                      <Label className='text-xs text-muted-foreground'>Amount Given by Customer (Rs)</Label>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={cashReceivedInput}
                        onChange={(e) => setCashReceivedInput(e.target.value)}
                        placeholder={invoice.total.toFixed(2)}
                        className='mt-1 text-base font-semibold'
                        onFocus={(e) => e.target.select()}
                      />
                    </div>
                    {parseFloat(cashReceivedInput) > 0 && (
                      <div className='space-y-2 pt-2 border-t border-emerald-200 dark:border-emerald-700'>
                        <div className='flex justify-between text-sm'>
                          <span className='text-muted-foreground'>Total Bill:</span>
                          <span className='font-semibold'>Rs{invoice.total.toFixed(2)}</span>
                        </div>
                        <div className='flex justify-between text-sm'>
                          <span className='text-muted-foreground'>Amount Received:</span>
                          <span className='font-semibold text-emerald-700'>Rs{parseFloat(cashReceivedInput).toFixed(2)}</span>
                        </div>
                        {parseFloat(cashReceivedInput) >= invoice.total ? (
                          <div className='flex justify-between items-center p-2.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 border border-emerald-300 dark:border-emerald-700'>
                            <span className='font-bold text-emerald-800 dark:text-emerald-200'>Change to Return:</span>
                            <span className='font-bold text-xl text-emerald-700 dark:text-emerald-300'>
                              Rs{(parseFloat(cashReceivedInput) - invoice.total).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <div className='flex justify-between items-center p-2.5 rounded-lg bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700'>
                            <span className='font-bold text-red-800 dark:text-red-200'>Amount Short:</span>
                            <span className='font-bold text-xl text-red-600 dark:text-red-400'>
                              Rs{(invoice.total - parseFloat(cashReceivedInput)).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}

            {/* Customer Balance Display - After Payment Details */}
            {invoice.customerId && invoice.customerId !== 'walk-in' && (
              <>
                <Separator className="my-2" />
                <div className='space-y-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg'>
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Previous Balance')}:</span>
                    <span className={`font-bold ${customerBalance > 0 ? 'text-red-600' : customerBalance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {loadingBalance ? (
                        <span className="text-xs">Loading...</span>
                      ) : (
                        `Rs${Math.abs(customerBalance).toFixed(2)} ${customerBalance > 0 ? '(Dr)' : customerBalance < 0 ? '(Cr)' : ''}`
                      )}
                    </span>
                  </div>
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Current Amount')}:</span>
                    <span className="font-bold text-red-600">Rs{invoice.total.toFixed(2)} (Dr)</span>
                  </div>
                  {invoice.paidAmount > 0 && (
                    <div className='flex justify-between items-center text-sm'>
                      <span className="font-medium">{t('Paid Now')}:</span>
                      <span className="font-bold text-green-600">-Rs{invoice.paidAmount.toFixed(2)} (Cr)</span>
                    </div>
                  )}
                  <Separator />
                  <div className='flex justify-between items-center'>
                    <span className="font-bold">{t('Net Balance')}:</span>
                    <span className={`font-bold text-lg ${(customerBalance + invoice.total - invoice.paidAmount) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Rs{Math.abs(customerBalance + invoice.total - invoice.paidAmount).toFixed(2)} {(customerBalance + invoice.total - invoice.paidAmount) > 0 ? '(Receivable)' : '(Payable)'}
                    </span>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Terms & Conditions */}
          <RichTextEditor
            value={invoice.notes || ''}
            onChange={(notes) => setInvoice((prev) => ({ ...prev, notes }))}
            fieldLabel={t('terms_and_conditions')}
            addButtonLabel={t('add_terms_and_conditions')}
            placeholder={t('terms_and_conditions_placeholder')}
            defaultExpanded={Boolean(invoice.notes?.trim())}
          />

          {/* Save Buttons */}
          {isEditing && editingInvoice?.type === 'quotation' && (
            <Button
              type='button'
              className='w-full bg-emerald-600 hover:bg-emerald-700'
              size='lg'
              onClick={() => setShowConvertDialog(true)}
            >
              <FileCheck className='h-4 w-4 mr-2' />
              {t('convert_to_invoice') || 'Convert to Invoice'}
            </Button>
          )}

          <div className='grid grid-cols-1 gap-3'>
            <Button 
              onClick={() => handleSaveInvoice('none')}
              className='w-full'
              size="lg"
              disabled={!invoice.customerId || invoice.items.length === 0 || savingType !== null}
              variant="outline"
            >
              {savingType === 'none' ? (
                <>
                  <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                  {t('saving')}...
                </>
              ) : (
                <>
                  <Save className='h-4 w-4 mr-2' />
                  {isEditing ? t('update_invoice') : t('save_invoice')} (Ctrl+D)
                </>
              )}
            </Button>

            <div className='grid grid-cols-2 gap-3'>
              <Button 
                onClick={() => handleSaveInvoice('receipt')}
                className='w-full'
                size="lg"
                disabled={!invoice.customerId || invoice.items.length === 0 || savingType !== null}
                variant="default"
              >
                {savingType === 'receipt' ? (
                  <>
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                    {t('saving')}...
                  </>
                ) : (
                  <>
                    <Printer className='h-4 w-4 mr-2' />
                    {isEditing 
                      ? `${t('update_and_print_receipt')} (Ctrl+Enter)`
                      : `${t('save_and_print_receipt')} (Ctrl+Enter)`
                    }
                  </>
                )}
              </Button>

              <Button 
                onClick={() => handleSaveInvoice('a4')}
                className='w-full'
                size="lg"
                disabled={!invoice.customerId || invoice.items.length === 0 || savingType !== null}
                variant="default"
              >
                {savingType === 'a4' ? (
                  <>
                    <Loader2 className='h-4 w-4 mr-2 animate-spin' />
                    {t('saving')}...
                  </>
                ) : (
                  <>
                    <Package className='h-4 w-4 mr-2' />
                    {isEditing 
                      ? `${t('update_and_print_a4')} (Ctrl+F)`
                      : `${t('save_and_print_a4')} (Ctrl+F)`
                    }
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <EntityQuickCreateDialogs
        state={quickCreate}
        onClose={() => {
          setQuickCreate(null)
          setQuickCreateProductItemId(null)
        }}
        onCreated={handleQuickCreated}
      />

      <QuotationConvertDialog
        invoice={isEditing && editingInvoice?.type === 'quotation' ? editingInvoice : null}
        open={showConvertDialog}
        onOpenChange={setShowConvertDialog}
        onConverted={() => {
          onSaveSuccess?.()
          onBackToList?.()
        }}
      />
    </div>
  )
}

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Minus, Plus, Trash2, Save, Calculator, DollarSign, Search, Check, User, Package, Loader2, Printer, ArrowLeft, ChevronDown } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'
import { useLanguage } from '@/context/language-context'
import { Invoice } from '../index'
import { toast } from 'sonner'
import { useCreateInvoiceMutation, useUpdateInvoiceMutation } from '@/stores/invoice.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindow, openA4PrintWindow, type PrintInvoiceData } from '../utils/print-utils'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import SmartInput from '@/components/smart-input.tsx'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
// import { KeyboardLanguageOverride } from '@/components/keyboard-language-override'
import { getTextClasses } from '@/utils/urdu-text-utils'
import { detectCurrentKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { useGetCompanyQuery } from '@/stores/company.api'
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

interface InvoicePanelProps {
  invoice: Invoice
  setInvoice: React.Dispatch<React.SetStateAction<Invoice>>
  updateQuantity: (itemId: string, newQuantity: number) => void
  removeFromInvoice: (itemId: string) => void
  updateInvoiceType: (type: 'cash' | 'credit' | 'pending') => void
  updateDiscount: (discountAmount: number) => void
  taxRate: number
  setTaxRate: (rate: number) => void
  customers: any[]
  customersLoading?: boolean
  products: any[]
  setProducts: React.Dispatch<React.SetStateAction<any[]>>
  calculateTotals?: (items: any[], discountAmount?: number, deliveryCharge?: number, serviceCharge?: number) => any
  onBackToList?: () => void
  onSaveSuccess?: () => void
  isEditing?: boolean
  editingInvoice?: any
}

export function InvoicePanel({
  invoice,
  setInvoice,
  updateQuantity,
  removeFromInvoice,
  updateInvoiceType,
  // updateDiscount,
  taxRate,
  // setTaxRate,
  customers,
  customersLoading = false,
  products,
  setProducts,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingInvoice
}: InvoicePanelProps) {
  const { t, isRTL } = useLanguage()
  // const [discountInput, setDiscountInput] = useState('0')
  const [paidAmountInput, setPaidAmountInput] = useState('')
  const [showProfitDetails, setShowProfitDetails] = useState(false)
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [savingType, setSavingType] = useState<'none' | 'receipt' | 'a4' | null>(null)
  const [customerBalance, setCustomerBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Detect current keyboard language
  const currentKeyboardLanguage = detectCurrentKeyboardLanguage()
  const voiceLanguage = currentKeyboardLanguage === 'ur' ? 'ur-PK' : 'en-US'

  // RTK Query mutations
  const [createInvoice] = useCreateInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()
  
  // Fetch company data for invoice printing (skip error if not found)
  const { data: companyData } = useGetCompanyQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
  })
  console.log("invoice",invoice)
  // Print functionality using utility
  const printInvoice = useCallback((invoiceData: any) => {
    try {
      const printData: PrintInvoiceData = {
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
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
        dueDate: invoiceData.dueDate,
        notes: invoiceData.notes,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: customerBalance,
        netBalance: customerBalance + invoiceData.total - (invoiceData.paidAmount || 0),
        companyName: companyData?.name,
        companyAddress: companyData?.address,
        companyPhone: companyData?.phone,
        companyEmail: companyData?.email,
        companyTaxNumber: companyData?.taxNumber
      }

      // Force Urdu/RTL for print
      const htmlContent = generateInvoiceHTML(printData)
      openPrintWindow(htmlContent)
      
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
  }, [t, invoice.customerName, companyData])

  // A4 Print functionality using utility
  const printA4Invoice = useCallback((invoiceData: any) => {
    try {
      const printData: PrintInvoiceData = {
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
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
        dueDate: invoiceData.dueDate,
        notes: invoiceData.notes,
        deliveryCharge: invoiceData.deliveryCharge,
        serviceCharge: invoiceData.serviceCharge,
        previousBalance: customerBalance,
        netBalance: customerBalance + invoiceData.total - (invoiceData.paidAmount || 0),
        companyName: companyData?.name,
        companyAddress: companyData?.address,
        companyPhone: companyData?.phone,
        companyEmail: companyData?.email,
        companyTaxNumber: companyData?.taxNumber
      }

      // Force Urdu/RTL for print
      const htmlContent = generateA4InvoiceHTML(printData)
      openA4PrintWindow(htmlContent)
      
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
  }, [t, invoice.customerName, companyData])

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

  // Auto-set due date when invoice type changes to credit
  useEffect(() => {
    if (invoice.type === 'credit' && !invoice.dueDate) {
      setInvoice(prev => ({ 
        ...prev, 
        dueDate: new Date().toISOString().split('T')[0] 
      }))
    }
  }, [invoice.type, setInvoice])

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

  // Set default date when customer is selected or type is pending
  useEffect(() => {
    if ((invoice.customerId && invoice.customerId !== 'walk-in') || invoice.type === 'pending') {
      if (!invoice.dueDate) {
        setInvoice(prev => ({ 
          ...prev, 
          dueDate: new Date().toISOString().split('T')[0] 
        }))
      }
    }
  }, [invoice.customerId, invoice.type, invoice.dueDate, setInvoice])

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

  // Filter customers by name or phone number
  const filteredCustomers = customers.filter(customer => {
    if (!customerSearchQuery) return true
    const query = customerSearchQuery.toLowerCase()
    const name = customer.name?.toLowerCase() || ''
    const phone = customer.phone?.toLowerCase() || ''
    return name.includes(query) || phone.includes(query)
  })

  // Filter products by name or barcode
  const filteredProducts = products.filter(product => {
    if (!productSearchQuery) return true
    const query = productSearchQuery.toLowerCase()
    const name = product.name?.toLowerCase() || ''
    const barcode = product.barcode?.toLowerCase() || ''
    return name.includes(query) || barcode.includes(query)
  })

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
      setProducts(prevProducts => prevProducts.map(p => 
        (p._id || p.id) === currentItem.productId 
          ? { ...p, stockQuantity: p.stockQuantity + currentItem.quantity }
          : p
      ))
      console.log(`Stock restored for previous product: ${currentItem.name} + ${currentItem.quantity}`)
    }

    // Check if we have enough stock for the current quantity
    if (currentItem.quantity > currentStock) {
      toast.error(`${product.name} - Not enough stock available. Current stock: ${currentStock}, Required: ${currentItem.quantity}`)
      console.log('ERROR: Not enough stock for current quantity')
      return
    }
    
    const newItems = invoice.items.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            productId: productId,
            name: product.name,
            image: product.image,
            unit: product.unit,
            unitPrice: product.price,
            cost: product.cost,
            subtotal: product.price * item.quantity,
            profit: item.quantity * (product.price - product.cost),
            isManualEntry: false
          }
        : item
    )

    // Update stock to reflect the selection (decrease by current item quantity)
    setProducts(prevProducts => prevProducts.map(p => 
      (p._id || p.id) === productId 
        ? { ...p, stockQuantity: p.stockQuantity - currentItem.quantity }
        : p
    ))
    
    console.log(`Stock updated: ${product.name} - decreased by ${currentItem.quantity}`)
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
  }, [invoice.items, invoice.discount, invoice.deliveryCharge, invoice.serviceCharge, invoice.paidAmount, taxRate, calculateTotals, setInvoice, products, setProducts])

  // const handleDiscountChange = useCallback((value: string) => {
  //   setDiscountInput(value)
  //   const discountAmount = parseFloat(value) || 0
  //   updateDiscount(discountAmount)
  // }, [updateDiscount])

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

    if (invoice.items.length === 0) {
      toast.error('Please add items to the invoice')
      return
    }

    // Check if any manual entries don't have a product selected
    const incompleteItems = invoice.items.filter(item => item.isManualEntry && !item.productId)
    if (incompleteItems.length > 0) {
      toast.error(t('select_product_for_manual_entries'))
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
          image: item.image,
          quantity: item.quantity,
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
        dueDate: invoice.dueDate,
        deliveryCharge: invoice.deliveryCharge,
        serviceCharge: invoice.serviceCharge,
        roundingAdjustment: invoice.roundingAdjustment,
        splitPayment: invoice.splitPayment,
        loyaltyPoints: invoice.loyaltyPoints,
        couponCode: invoice.couponCode,
        returnPolicy: invoice.returnPolicy,
        notes: invoice.notes
      }

      // Don't include status in the payload as it's not allowed in updates
      // Status is likely managed by the backend

      console.log('Saving invoice - isEditing:', isEditing, 'editingInvoice._id:', editingInvoice?._id)
      console.log('Invoice data being sent:', invoiceData)
      
      const result = isEditing && editingInvoice?._id 
        ? await updateInvoice({ id: editingInvoice._id, ...invoiceData }).unwrap()
        : await createInvoice(invoiceData).unwrap()
      
      console.log('Save result:', result)
      
      const successMessage = isEditing 
        ? `Invoice ${editingInvoice?.invoiceNumber || result.invoiceNumber} updated successfully!`
        : `Invoice ${result.invoiceNumber} created successfully!`
      
      toast.success(successMessage)
      
      // Call success callback to commit stock changes
      if (onSaveSuccess) {
        onSaveSuccess()
      }

      // Refresh customer balance after successful save
      if (invoice.customerId && invoice.customerId !== 'walk-in') {
        try {
          const url = `${summery.fetchCustomerBalance.url}/${invoice.customerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          setCustomerBalance(response.data.balance || 0)
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
        
        const printData = {
          ...result, // Use the API response data
          invoiceNumber: result.invoiceNumber || editingInvoice?.invoiceNumber,
          items: validItems,
          customerId: result.customerId || invoice.customerId || editingInvoice?.customerId,
          customerName: resolvedCustomerName,
          walkInCustomerName: resolvedWalkInCustomerName
        }
        
        if (printType === 'receipt') {
          printInvoice(printData)
        } else if (printType === 'a4') {
          printA4Invoice(printData)
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
  }, [invoice, createInvoice, updateInvoice, isEditing, editingInvoice, t, printInvoice, printA4Invoice, customers, onSaveSuccess])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cash': return 'bg-green-100 text-green-800'
      case 'credit': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
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
          <CardTitle className='flex items-center gap-2'>
            {onBackToList && (
              <Button variant="ghost" size="sm" onClick={onBackToList}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <DollarSign className='h-5 w-5' />
            {t('invoice_details')}
          </CardTitle>
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
              <Popover open={customerSelectOpen} onOpenChange={setCustomerSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSelectOpen}
                    className={`w-full justify-between min-h-[2.5rem] h-auto py-0 ${
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
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                                    <div className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[10px] font-medium text-white">
                                        {selectedCustomer.name?.charAt(0).toUpperCase() || 'C'}
                                      </span>
                                    </div>
                                    <span className={getTextClasses(selectedCustomer.name, "text-xs truncate")} title={selectedCustomer.name}>
                                      {selectedCustomer.name}
                                    </span>
                                  </Badge>
                                )
                              } else if (invoice.customerName) {
                                // Fallback to showing the stored customer name if customer not found in list
                                return (
                                  <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                                    <div className="w-3 h-3 rounded-full bg-gray-500 flex items-center justify-center flex-shrink-0">
                                      <span className="text-[10px] font-medium text-white">
                                        {invoice.customerName.charAt(0).toUpperCase()}
                                      </span>
                                    </div>
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
                    ) : (
                      <CommandEmpty>{t('no_customers_found')}</CommandEmpty>
                    )}
                    <CommandList className="max-h-[300px] overflow-y-auto">
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => {
                            setInvoice(prev => ({ ...prev, customerId: 'walk-in' }))
                            setCustomerSelectOpen(false)
                            setCustomerSearchQuery('')
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
                                  customerName: customer.name // Set customer name for editing
                                }))
                                setCustomerSelectOpen(false)
                                setCustomerSearchQuery('')
                              }}
                              className="flex items-center gap-3 cursor-pointer p-3"
                            >
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-medium text-white">
                                    {customer.name?.charAt(0).toUpperCase() || 'C'}
                                  </span>
                                </div>
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className={getTextClasses(customer.name, "truncate font-medium")} title={customer.name}>
                                    {customer.name}
                                  </span>
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
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            
            <div>
              <Label htmlFor="type" className='mb-2'>{t('invoice_type')}</Label>
              <Select
                value={invoice.type}
                onValueChange={(value: 'cash' | 'credit' | 'pending') => updateInvoiceType(value)}
              >
                <SelectTrigger className='w-full'>
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

          {(invoice.type === 'credit' || (invoice.customerId && invoice.customerId !== 'walk-in') || invoice.type === 'pending') && (
            <div>
              <Label htmlFor="dueDate">{t('due_date')}</Label>
              <Input
                type="date"
                value={invoice.dueDate || new Date().toISOString().split('T')[0]}
                onChange={(e) => setInvoice(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>
          )}

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

          {((invoice.customerId && invoice.customerId !== 'walk-in') || invoice.type === 'pending') && invoice.customerId !== 'walk-in' ? (
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
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                // Add a new empty row for manual product selection
                const newItem = {
                  id: `manual-${Date.now()}`,
                  productId: '',
                  name: '',
                  image: undefined,
                  quantity: 1,
                  unitPrice: 0,
                  cost: 0,
                  subtotal: 0,
                  profit: 0,
                  isManualEntry: true
                }
                setInvoice(prev => ({
                  ...prev,
                  items: [...prev.items, newItem]
                }))
              }}
              className='flex items-center gap-1'
            >
              <Plus className='h-4 w-4' />
              {t('add_item')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className='p-4'>
          <div className='space-y-2 max-h-96 overflow-y-auto'>
            {invoice.items.length === 0 ? (
              <div className='text-center text-muted-foreground py-8'>
                {t('no_items_added')}
              </div>
            ) : (
              invoice.items.map((item) => (
                <div key={item.id} className='flex items-center gap-2 p-2 bg-muted/30 rounded-lg'>
                  {/* Product Image */}
                  {item.image?.url ? (
                    <img 
                      src={item.image.url} 
                      alt={item.name}
                      className='w-12 h-12 object-cover rounded'
                    />
                  ) : (
                    <div className='w-12 h-12 rounded bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center'>
                      <Package className='h-6 w-6 text-gray-400' />
                    </div>
                  )}
                  
                  {/* Product Info / Selection */}
                  <div className='flex-1 min-w-28'>
                    {item.isManualEntry ? (
                      <div className='space-y-1'>
                        <Popover 
                          open={productSelectOpen === item.id} 
                          onOpenChange={(open) => setProductSelectOpen(open ? item.id : '')}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant="outline"
                              role="combobox"
                              className={`w-full justify-between h-8 text-xs ${
                                !item.productId ? 'border-red-500 bg-red-50' : ''
                              } mt-4`}
                            >
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <Search className="w-3 h-3 flex-shrink-0" />
                                <span 
                                  className={getTextClasses(item.name || t('select_product'), `truncate ${
                                    !item.productId ? 'text-red-500' : 'text-muted-foreground'
                                  }`)}
                                  title={item.name || t('select_product')}
                                >
                                  {item.name || t('select_product')}
                                  {!item.productId && ' *'}
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
                              <CommandEmpty>{t('no_products_found')}</CommandEmpty>
                              <CommandList className="max-h-[300px] overflow-y-auto">
                                <CommandGroup>
                                  {filteredProducts.map((product) => (
                                    <CommandItem
                                      key={product._id}
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
                                          <span className={getTextClasses(product.name, "text-sm font-medium truncate")} title={product.name}>
                                            {product.name}
                                          </span>
                                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                            <span key={`price-${product._id}`}>Rs{product.price}</span>
                                            <span key={`stock-${product._id}`}>Stock: {product.stockQuantity}</span>
                                          </div>
                                        </div>
                                      </div>
                                    </CommandItem>
                                  ))}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    ) : (
                      <div className="min-w-28">
                        <p className={getTextClasses(item.name, 'font-medium truncate')} title={item.name}>{item.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          Rs{item.unitPrice} × {item.quantity} = Rs{item.subtotal}
                        </p>
                      </div>
                    )}
                  </div>
                  
                  {/* Quantity Controls */}
                  <div className='flex flex-col gap-1'>
                    <Label className='text-xs text-center'>{t('qty')}</Label>
                    <div className='flex items-center gap-1'>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.quantity - 1)}
                        className='h-6 w-6 p-0'
                      >
                        <Minus className='h-3 w-3' />
                      </Button>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const qty = parseInt(e.target.value) || 1
                          updateQuantity(item.id, qty)
                        }}
                        onFocus={(e) => e.target.select()}
                        className='h-6 w-12 text-center text-xs p-1 border-0 bg-white focus:ring-0 focus:ring-offset-0 focus:border-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => updateQuantity(item.id, item.quantity + 1)}
                        className='h-6 w-6 p-0'
                      >
                        <Plus className='h-3 w-3' />
                      </Button>
                    </div>
                    <div className='text-[10px] text-center text-muted-foreground mt-0.5'>
                      {item.unit || 'pcs'}
                    </div>
                  </div>

                  {/* Price Controls */}
                  <div className='flex flex-col gap-1'>
                    <Label className='text-xs text-center'>{t('price')}</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.unitPrice}
                      onChange={(e) => {
                        const newPrice = parseFloat(e.target.value) || 0.01
                        const newItems = invoice.items.map(i => 
                          i.id === item.id 
                            ? { ...i, unitPrice: newPrice, subtotal: newPrice * i.quantity, profit: i.quantity * (newPrice - i.cost) }
                            : i
                        )
                        
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
                      }}
                      onFocus={(e) => e.target.select()}
                      className='h-6 w-16 text-center text-xs p-1 border-0 bg-white focus:ring-0 focus:ring-offset-0 focus:border-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                    />
                  </div>

                  {/* Total and Actions */}
                  <div className='flex flex-col items-end gap-1'>
                    <p className='font-medium text-sm'>Rs{item.subtotal}</p>
                    {showProfitDetails && (
                      <p className='text-xs text-green-600'>
                        +Rs{item.profit}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeFromInvoice(item.id)}
                      className='h-6 w-6 p-0'
                    >
                      <Trash2 className='h-3 w-3 text-red-500' />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals and Payment */}
      <Card>
        <CardContent className='p-4 space-y-4'>
          {/* Tax and Discount Controls */}
          {/* <div className='grid grid-cols-2 gap-4'>
            <div>
              <Label htmlFor="taxRate">{t('tax_rate')} (%)</Label>
              <Input
                type="number"
                step="0.1"
                value={taxRate}
                onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
                placeholder="0"
              />
            </div>
            <div>
              <Label htmlFor="discount">{t('discount')} (Rs)</Label>
              <Input
                type="number"
                step="0.01"
                value={discountInput}
                onChange={(e) => handleDiscountChange(e.target.value)}
                placeholder="0.00"
              />
            </div>
          </div> */}

          {/* <Separator /> */}

          {/* Totals Display */}
          <div className='space-y-2'>
            <div className='flex justify-between'>
              <span>{t('subtotal')}:</span>
              <span>Rs{invoice.subtotal.toFixed(2)}</span>
            </div>
            {invoice.discount > 0 && (
              <div className='flex justify-between text-red-600'>
                <span>{t('discount')}:</span>
                <span>-Rs{invoice.discount.toFixed(2)}</span>
              </div>
            )}
            {invoice.tax > 0 && (
              <div className='flex justify-between'>
                <span>{t('tax')} ({taxRate}%):</span>
                <span>Rs{invoice.tax.toFixed(2)}</span>
              </div>
            )}
            <Separator />
            <div className='flex justify-between font-bold text-lg'>
              <span>{t('total')}:</span>
              <span>Rs{invoice.total.toFixed(2)}</span>
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

            {invoice.type !== 'pending' && (
              <>
                {invoice.type === 'credit' && (
                  <div>
                    <Label htmlFor="paidAmount">{t('paid_amount')}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={paidAmountInput}
                      onChange={(e) => handlePaidAmountChange(e.target.value)}
                      placeholder="0.00"
                    />
                  </div>
                )}

                {/* <div className='space-y-2'>
                  <div className='flex justify-between'>
                    <span>{t('paid')}:</span>
                    <span className='text-green-600'>
                      Rs{invoice.paidAmount.toFixed(2)}
                    </span>
                  </div>
                  {invoice.balance > 0 && (
                    <div className='flex justify-between'>
                      <span>{t('balance')}:</span>
                      <span className='text-red-600'>
                        Rs{invoice.balance.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div> */}
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
                    <span className="font-medium">{t('Current Invoice')}:</span>
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

          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t('notes')}</Label>
            <Textarea
              value={invoice.notes || ''}
              onChange={(e) => setInvoice(prev => ({ ...prev, notes: e.target.value }))}
              placeholder={t('add_notes')}
              rows={2}
            />
          </div>

          {/* Save Buttons */}
          <div className='grid grid-cols-1 gap-3'>
            {/* Save Only Button */}
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
                  {isEditing ? t('update_invoice') : t('save_invoice')}
                </>
              )}
            </Button>
            
            {/* Print Buttons Row */}
            <div className='grid grid-cols-2 gap-3'>
              {/* Save & Print Receipt Button */}
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
                      ? t('update_and_print_receipt')
                      : t('save_and_print_receipt')
                    }
                  </>
                )}
              </Button>
              
              {/* Save & Print A4 Button */}
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
                      ? t('update_and_print_a4')
                      : t('save_and_print_a4')
                    }
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

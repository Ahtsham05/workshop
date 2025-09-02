import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
// import {
//   Dialog,
//   DialogContent,
//   DialogHeader,
//   DialogTitle,
//   DialogTrigger,
// } from '@/components/ui/dialog'
import { X, Plus, Minus, AlertCircle, ShoppingCart, Search, ChevronDown, Package } from 'lucide-react'
import { useCreateReturnMutation } from '@/stores/return.api'
import { useGetInvoicesQuery } from '@/stores/invoice.api'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { fetchAllProducts } from '@/stores/product.slice'
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
import { CreateReturnRequest } from '../types'
import { useLanguage } from '@/context/language-context'
import { VoiceInputButton } from '@/components/ui/voice-input-button'

interface ReturnFormItem {
  productId: string
  name: string
  image?: { url: string; publicId: string }
  originalQuantity: number
  returnedQuantity: number
  unitPrice: number
  cost: number
  reason: 'defective' | 'wrong_item' | 'customer_request' | 'damaged' | 'expired' | 'other'
  condition: 'new' | 'used' | 'damaged' | 'defective'
  restockable: boolean
}

interface ReturnFormData {
  originalInvoiceId: string
  originalInvoiceNumber: string
  customerId?: string
  customerName?: string
  walkInCustomerName?: string
  returnType: 'full_refund' | 'partial_refund' | 'exchange' | 'store_credit'
  refundMethod: 'cash' | 'card' | 'original_payment' | 'store_credit'
  returnReason: string
  notes: string
  receiptRequired: boolean
  receiptProvided: boolean
  restockingFee: number
  processingFee: number
  items: ReturnFormItem[]
}

interface ReturnFormProps {
  invoice?: any // Invoice data to pre-populate
  onSuccess?: () => void
  onCancel?: () => void
}

export function ReturnForm({ invoice, onSuccess, onCancel }: ReturnFormProps) {
  const { t } = useLanguage()
  const [createReturn, { isLoading }] = useCreateReturnMutation()
  const { data: invoicesResponse } = useGetInvoicesQuery({})
  const invoices = invoicesResponse?.results || invoicesResponse?.data || []
  const [selectedInvoice, setSelectedInvoice] = useState(invoice || null)
  const [showInvoiceSearch, setShowInvoiceSearch] = useState(!invoice)
  const [invoiceSearchTerm, setInvoiceSearchTerm] = useState('')
  const [products, setProducts] = useState<any[]>([])
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const dispatch = useDispatch<AppDispatch>()
  
  const [formData, setFormData] = useState<ReturnFormData>({
    originalInvoiceId: selectedInvoice?._id || '',
    originalInvoiceNumber: selectedInvoice?.invoiceNumber || '',
    customerId: selectedInvoice?.customerId || '',
    customerName: selectedInvoice?.customerName || '',
    walkInCustomerName: selectedInvoice?.walkInCustomerName || '',
    returnType: 'partial_refund',
    refundMethod: 'original_payment',
    returnReason: '',
    notes: '',
    receiptRequired: false,
    receiptProvided: false,
    restockingFee: 0,
    processingFee: 0,
    items: [],
  })

  // Initialize form data when invoice prop changes
  useEffect(() => {
    if (selectedInvoice?.items) {
      const items = selectedInvoice.items.map((item: any) => ({
        productId: item.productId || item._id,
        name: item.name,
        image: item.image,
        originalQuantity: item.quantity,
        returnedQuantity: 1,
        unitPrice: item.unitPrice || item.price || 0,
        cost: item.cost || 0,
        reason: 'customer_request' as const,
        condition: 'new' as const,
        restockable: true,
      }))
      
      setFormData(prev => ({
        ...prev,
        originalInvoiceId: selectedInvoice._id || '',
        originalInvoiceNumber: selectedInvoice.invoiceNumber || '',
        customerId: selectedInvoice.customerId || '',
        customerName: selectedInvoice.customerName || '',
        walkInCustomerName: selectedInvoice.walkInCustomerName || '',
        items
      }))
    }
  }, [selectedInvoice])

  const [totalReturnAmount, setTotalReturnAmount] = useState(0)

  // Fetch products for manual item selection
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await dispatch(fetchAllProducts({}))
        let productsData = []
        
        if (response.payload?.results) {
          productsData = response.payload.results
        } else if (response.payload) {
          productsData = Array.isArray(response.payload) ? response.payload : []
        }
        
        setProducts(productsData)
      } catch (error) {
        console.error('Error fetching products:', error)
        setProducts([])
      }
    }

    // Only fetch products if we don't have an invoice (manual return creation)
    if (!invoice) {
      fetchProducts()
    }
  }, [dispatch, invoice])

  // Filter products by name or barcode
  const filteredProducts = products.filter(product => {
    if (!productSearchQuery) return true
    const query = productSearchQuery.toLowerCase()
    const name = product.name?.toLowerCase() || ''
    const barcode = product.barcode?.toLowerCase() || ''
    return name.includes(query) || barcode.includes(query)
  })

  // Calculate total return amount
  useEffect(() => {
    const total = formData.items.reduce((sum, item) => {
      return sum + (item.returnedQuantity * item.unitPrice)
    }, 0)
    setTotalReturnAmount(total)
  }, [formData.items])

  const finalRefundAmount = Math.max(0, totalReturnAmount - formData.restockingFee - formData.processingFee)

  const updateFormData = (updates: Partial<ReturnFormData>) => {
    setFormData(prev => ({ ...prev, ...updates }))
  }

  const updateItem = (index: number, updates: Partial<ReturnFormItem>) => {
    const newItems = [...formData.items]
    newItems[index] = { ...newItems[index], ...updates }
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const removeItem = (index: number) => {
    const newItems = formData.items.filter((_, i) => i !== index)
    setFormData(prev => ({ ...prev, items: newItems }))
  }

  const handleInvoiceSelect = (invoice: any) => {
    setSelectedInvoice(invoice)
    setShowInvoiceSearch(false)
    setFormData(prev => ({
      ...prev,
      originalInvoiceId: invoice._id,
      originalInvoiceNumber: invoice.invoiceNumber,
      customerId: invoice.customerId,
      customerName: invoice.customerName,
      walkInCustomerName: invoice.walkInCustomerName,
      items: invoice.items?.map((item: any) => ({
        productId: item.productId || item._id,
        name: item.name,
        image: item.image,
        originalQuantity: item.quantity,
        returnedQuantity: 1,
        unitPrice: item.price,
        cost: item.cost || 0,
        reason: 'customer_request' as const,
        condition: 'new' as const,
        restockable: true,
      })) || [],
    }))
  }

  const addManualItem = () => {
    const newItem: ReturnFormItem = {
      productId: '',
      name: '',
      originalQuantity: 1,
      returnedQuantity: 1,
      unitPrice: 0,
      cost: 0,
      reason: 'customer_request',
      condition: 'new',
      restockable: true,
    }
    setFormData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }))
  }

  // Handle product selection for manual entries
  const handleProductSelect = (itemIndex: string, product: any) => {
    const index = parseInt(itemIndex)
    const productId = product._id || product.id
    if (!productId) {
      console.error('Product has no valid ID:', product)
      return
    }
    
    updateItem(index, {
      productId: productId,
      name: product.name,
      image: product.image,
      unitPrice: product.price || 0,
      cost: product.cost || 0,
    })
    
    setProductSelectOpen('')
    setProductSearchQuery('')
  }

  const filteredInvoices = invoices?.filter((inv: any) => 
    inv.invoiceNumber.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
    inv.customerName?.toLowerCase().includes(invoiceSearchTerm.toLowerCase()) ||
    inv.walkInCustomerName?.toLowerCase().includes(invoiceSearchTerm.toLowerCase())
  ) || []

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    console.log('=== RETURN FORM SUBMISSION STARTED ===')
    console.log('Button clicked! onSubmit function is being called')
    console.log('Form submission started', { formData, isLoading })
    
    // Enhanced validation with detailed logging
    console.log('Validating items - count:', formData.items.length)
    if (formData.items.length === 0) {
      console.log('Validation failed: No items')
      alert('Please add items to return')
      return
    }
    console.log('Items validation passed ✓')
    
    console.log('Validating return reason:', formData.returnReason)
    if (!formData.returnReason.trim()) {
      console.log('Validation failed: No return reason')
      alert('Please enter a return reason')
      return
    }
    console.log('Return reason validation passed ✓')

    // Validate that all items have required fields
    console.log('Validating item fields...')
    const invalidItems = formData.items.filter(item => !item.productId || !item.name)
    if (invalidItems.length > 0) {
      console.log('Validation failed: Invalid items', invalidItems)
      alert('Please ensure all items have valid product information')
      return
    }
    console.log('All item fields validation passed ✓')

    try {
      console.log('Creating return with data:', formData)
      
      const returnData: CreateReturnRequest = {
        originalInvoiceId: formData.originalInvoiceId || '000000000000000000000000', // Default ObjectId for manual returns
        originalInvoiceNumber: formData.originalInvoiceNumber || 'MANUAL-RETURN',
        customerId: formData.customerId || undefined,
        customerName: formData.customerName || undefined,
        walkInCustomerName: formData.walkInCustomerName || undefined,
        returnType: formData.returnType,
        refundMethod: formData.refundMethod,
        returnReason: formData.returnReason,
        notes: formData.notes || '',
        receiptRequired: formData.receiptRequired,
        receiptProvided: formData.receiptProvided,
        restockingFee: formData.restockingFee || 0,
        processingFee: formData.processingFee || 0,
        items: formData.items.map(item => ({
          productId: item.productId,
          name: item.name,
          image: item.image,
          originalQuantity: item.originalQuantity,
          returnedQuantity: item.returnedQuantity,
          unitPrice: item.unitPrice,
          cost: item.cost || 0,
          returnAmount: item.returnedQuantity * item.unitPrice, // Calculate return amount for each item
          reason: item.reason,
          condition: item.condition,
          restockable: item.restockable,
        })),
      }
      
      console.log('=== ALL VALIDATIONS PASSED ===')
      console.log('About to call API with return data:', returnData)
      
      console.log('Calling createReturn API...')
      const result = await createReturn(returnData).unwrap()
      console.log('Return created successfully:', result)
      console.log('Return ID from response:', result?._id || result?.id)
      
      alert('Return created successfully!')
      
      // Make sure onSuccess is called properly
      if (onSuccess) {
        console.log('Calling onSuccess callback...')
        onSuccess()
      } else {
        console.log('No onSuccess callback provided')
      }
    } catch (error: any) {
      console.error('Failed to create return:', error)
      console.error('Error details:', {
        status: error?.status,
        data: error?.data,
        message: error?.message,
        originalStatus: error?.originalStatus
      })
      
      // More detailed error handling
      let errorMessage = 'Failed to create return'
      if (error?.data?.message) {
        errorMessage = error.data.message
      } else if (error?.message) {
        errorMessage = error.message
      } else if (typeof error === 'string') {
        errorMessage = error
      }
      
      alert(`Error: ${errorMessage}`)
    }
  }

  // Debug button state
  const buttonDisabled = isLoading || formData.items.length === 0 || !formData.returnReason.trim()
  console.log('=== BUTTON STATE DEBUG ===')
  console.log('isLoading:', isLoading)
  console.log('formData.items.length:', formData.items.length)
  console.log('formData.returnReason:', `"${formData.returnReason}"`)
  console.log('formData.returnReason.trim():', `"${formData.returnReason.trim()}"`)
  console.log('!formData.returnReason.trim():', !formData.returnReason.trim())
  console.log('Button disabled:', buttonDisabled)

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {/* Invoice Information */}
      <Card>
        <CardHeader>
          <CardTitle>{t('original_invoice_information')}</CardTitle>
          {invoice && (
            <p className="text-sm text-muted-foreground mt-2">
              {t('invoice_details_prefilled')}
            </p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {showInvoiceSearch ? (
            <div className="space-y-4">
              <div>
                <Label>{t('search_invoice')}</Label>
                <div className="relative mt-2">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={t('search_by_invoice_or_customer')}
                    value={invoiceSearchTerm}
                    onChange={(e) => setInvoiceSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              
              {filteredInvoices.length > 0 && (
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  {filteredInvoices.slice(0, 10).map((inv: any) => (
                    <div
                      key={inv._id}
                      className="p-3 border-b cursor-pointer hover:bg-muted"
                      onClick={() => handleInvoiceSelect(inv)}
                    >
                      <div className="flex justify-between items-center">
                        <div>
                          <p className="font-medium">{inv.invoiceNumber}</p>
                          <p className="text-sm text-muted-foreground">
                            {inv.customerName || inv.walkInCustomerName || t('walk_in_customer')}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">Rs{inv.totalAmount?.toFixed(2)}</p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(inv.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowInvoiceSearch(false)
                    setFormData(prev => ({
                      ...prev,
                      originalInvoiceId: '',
                      originalInvoiceNumber: '',
                      customerId: '',
                      customerName: '',
                      walkInCustomerName: '',
                      items: [],
                    }))
                  }}
                >
                  {t('skip_invoice_selection')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('invoice_number')}</Label>
                <div className="flex gap-2 mt-2">
                  <Input 
                    value={formData.originalInvoiceNumber} 
                    onChange={(e) => setFormData(prev => ({ ...prev, originalInvoiceNumber: e.target.value }))}
                    placeholder={t('enter_invoice_number')}
                    disabled={!!invoice} // Disable if invoice is pre-selected
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setShowInvoiceSearch(true)}
                    disabled={!invoice} // Disable if invoice is pre-selected
                  >
                    <Search className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <Label>{t('customer')}</Label>
                <Input
                  value={formData.customerName || formData.walkInCustomerName || ''}
                  onChange={(e) => setFormData(prev => ({ 
                    ...prev, 
                    customerName: e.target.value,
                    walkInCustomerName: e.target.value 
                  }))}
                  placeholder={t('enter_customer_name')}
                  disabled={!!invoice} // Disable if invoice is pre-selecte
                  className='mt-2'
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Return Details */}
      <Card>
        <CardHeader>
          <CardTitle>{t('return_details')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>{t('return_type')}</Label>
              <Select 
                value={formData.returnType} 
                onValueChange={(value) => updateFormData({ returnType: value as any })}
              >
                <SelectTrigger className='w-full mt-2'>
                  <SelectValue placeholder={t('select_return_type')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="full_refund">{t('full_refund')}</SelectItem>
                  <SelectItem value="partial_refund">{t('partial_refund')}</SelectItem>
                  <SelectItem value="exchange">{t('exchange')}</SelectItem>
                  <SelectItem value="store_credit">{t('store_credit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>{t('refund_method')}</Label>
              <Select 
                value={formData.refundMethod} 
                onValueChange={(value) => updateFormData({ refundMethod: value as any })}
              >
                <SelectTrigger className='w-full mt-2'>
                  <SelectValue placeholder={t('select_refund_method')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">{t('refund_cash')}</SelectItem>
                  <SelectItem value="card">{t('refund_card')}</SelectItem>
                  <SelectItem value="original_payment">{t('original_payment')}</SelectItem>
                  <SelectItem value="store_credit">{t('store_credit')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>{t('return_reason')}</Label>
            <div className="relative">
              <Textarea
                value={formData.returnReason}
                onChange={(e) => updateFormData({ returnReason: e.target.value })}
                placeholder={t('enter_return_reason')}
                rows={3}
                className='mt-2 pr-10'
              />
              <div className="absolute right-2 top-4 z-10">
                <VoiceInputButton 
                  onTranscript={(text: string) => {
                    updateFormData({ returnReason: text });
                  }}
                  size="sm"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>{t('additional_notes')}</Label>
            <div className="relative">
              <Textarea
                value={formData.notes}
                onChange={(e) => updateFormData({ notes: e.target.value })}
                placeholder={t('enter_additional_notes')}
                rows={2}
                className='mt-2 pr-10'
              />
              <div className="absolute right-2 top-4 z-10">
                <VoiceInputButton 
                  onTranscript={(text: string) => {
                    updateFormData({ notes: text });
                  }}
                  size="sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="receiptRequired"
                checked={formData.receiptRequired}
                onCheckedChange={(checked) => updateFormData({ receiptRequired: !!checked })}
              />
              <Label htmlFor="receiptRequired">{t('receipt_required')}</Label>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="receiptProvided"
                checked={formData.receiptProvided}
                onCheckedChange={(checked) => updateFormData({ receiptProvided: !!checked })}
              />
              <Label htmlFor="receiptProvided">{t('receipt_provided')}</Label>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Return Items */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>{t('return_items')}</CardTitle>
                {invoice && (
                  <p className="text-sm text-muted-foreground mt-3  ">
                    {t('items_from_invoice')} #{formData.originalInvoiceNumber}
                  </p>
                )}
              </div>
              {/* <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addManualItem}
                disabled={!invoice} // Disable if invoice is pre-selected
              >
                <Plus className="h-4 w-4 mr-2" />
                {t('add_item')}
              </Button> */}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('product')}</TableHead>
                    <TableHead>{t('original_qty')}</TableHead>
                    <TableHead>{t('return_qty')}</TableHead>
                    <TableHead>{t('unit_price')}</TableHead>
                    <TableHead>{t('return_amount')}</TableHead>
                    <TableHead>{t('reason')}</TableHead>
                    <TableHead>{t('condition')}</TableHead>
                    <TableHead>{t('restock')}</TableHead>
                    <TableHead>{t('actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {formData.items.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {item.image && (
                            <img 
                              src={item.image.url} 
                              alt={item.name}
                              className="w-8 h-8 rounded object-cover"
                            />
                          )}
                          {!invoice && !item.name ? (
                            // Show product selector for empty manual items
                            <Popover 
                              open={productSelectOpen === index.toString()} 
                              onOpenChange={(open) => setProductSelectOpen(open ? index.toString() : '')}
                            >
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  className="w-full justify-between h-9 text-sm border-red-500 bg-red-50"
                                >
                                  <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Search className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate text-red-500">
                                      {t('select_product')} *
                                    </span>
                                  </div>
                                  <ChevronDown className="h-3 w-3 opacity-50 flex-shrink-0" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[400px] p-0" align="start" side="bottom" sideOffset={4}>
                                <Command shouldFilter={false}>
                                  <CommandInput 
                                    placeholder={t('search_products') + '...'} 
                                    value={productSearchQuery}
                                    onValueChange={setProductSearchQuery}
                                  />
                                  <CommandEmpty>{t('no_products_found')}.</CommandEmpty>
                                  <CommandList className="max-h-[300px] overflow-y-auto">
                                    <CommandGroup>
                                      {filteredProducts.map((product) => (
                                        <CommandItem
                                          key={product._id}
                                          onSelect={() => handleProductSelect(index.toString(), product)}
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
                                              <span className="text-sm font-medium truncate" title={product.name}>
                                                {product.name}
                                              </span>
                                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                                <span>Rs{product.price}</span>
                                                <span>Stock: {product.stockQuantity}</span>
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
                          ) : (
                            // Show input for invoice items or selected products
                            <Input
                              value={item.name}
                              onChange={(e) => updateItem(index, { name: e.target.value })}
                              placeholder={t('product_name')}
                              className="min-w-40"
                              disabled={!!invoice} // Disable if invoice is pre-selected
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          min="1"
                          value={item.originalQuantity}
                          onChange={(e) => updateItem(index, { originalQuantity: parseInt(e.target.value) || 1 })}
                          className="w-20"
                          disabled={!!invoice} // Disable if invoice is pre-selected
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (item.returnedQuantity > 1) {
                                updateItem(index, { returnedQuantity: item.returnedQuantity - 1 })
                              }
                            }}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <Input
                            type="number"
                            min="1"
                            max={item.originalQuantity}
                            value={item.returnedQuantity}
                            onChange={(e) => updateItem(index, { returnedQuantity: parseInt(e.target.value) || 1 })}
                            className="w-16 text-center"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (item.returnedQuantity < item.originalQuantity) {
                                updateItem(index, { returnedQuantity: item.returnedQuantity + 1 })
                              }
                            }}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Input
                          type="number"
                          step="1"
                          min="0"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(index, { unitPrice: parseFloat(e.target.value) || 0 })}
                          className="w-24"
                          disabled={!!invoice} // Disable if invoice is pre-selected
                        />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm font-medium">
                          Rs{(item.returnedQuantity * item.unitPrice).toFixed(2)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={item.reason} 
                          onValueChange={(value) => updateItem(index, { reason: value as any })}
                        >
                          <SelectTrigger className="w-32">
                            <SelectValue placeholder={t('select_reason')}>
                              {item.reason && (
                                item.reason === 'defective' ? t('reason_defective') :
                                item.reason === 'wrong_item' ? t('wrong_item') :
                                item.reason === 'customer_request' ? t('customer_request') :
                                item.reason === 'damaged' ? t('reason_damaged') :
                                item.reason === 'expired' ? t('reason_expired') :
                                item.reason === 'other' ? t('reason_other') : item.reason
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="defective">{t('reason_defective')}</SelectItem>
                            <SelectItem value="wrong_item">{t('wrong_item')}</SelectItem>
                            <SelectItem value="customer_request">{t('customer_request')}</SelectItem>
                            <SelectItem value="damaged">{t('reason_damaged')}</SelectItem>
                            <SelectItem value="expired">{t('reason_expired')}</SelectItem>
                            <SelectItem value="other">{t('reason_other')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={item.condition} 
                          onValueChange={(value) => updateItem(index, { condition: value as any })}
                        >
                          <SelectTrigger className="w-24">
                            <SelectValue placeholder={t('select_condition')}>
                              {item.condition && (
                                item.condition === 'new' ? t('condition_new') :
                                item.condition === 'used' ? t('condition_used') :
                                item.condition === 'damaged' ? t('condition_damaged') :
                                item.condition === 'defective' ? t('condition_defective') : item.condition
                              )}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">{t('condition_new')}</SelectItem>
                            <SelectItem value="used">{t('condition_used')}</SelectItem>
                            <SelectItem value="damaged">{t('condition_damaged')}</SelectItem>
                            <SelectItem value="defective">{t('condition_defective')}</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>
                        <Checkbox
                          checked={item.restockable}
                          onCheckedChange={(checked) => updateItem(index, { restockable: !!checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => removeItem(index)}
                          className="text-red-600 hover:text-red-700"
                          disabled={!invoice} // Disable if invoice is pre-selected
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {formData.items.length === 0 && (
              <div className="text-center py-8">
                <ShoppingCart className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-muted-foreground mb-4">{t('no_items_selected_for_return')}</p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addManualItem}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  {t('add_your_first_item')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Fees and Summary */}
        <Card>
          <CardHeader>
            <CardTitle>{t('fees_and_summary')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t('restocking_fee')} (Rs)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.restockingFee}
                  onChange={(e) => updateFormData({ restockingFee: parseFloat(e.target.value) || 0 })}
                  className='mt-2'
                />
              </div>

              <div>
                <Label>{t('processing_fee')} (Rs)</Label>
                <Input
                  type="number"
                  step="1"
                  min="0"
                  value={formData.processingFee}
                  onChange={(e) => updateFormData({ processingFee: parseFloat(e.target.value) || 0 })}
                  className='mt-2'
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>{t('return_amount')}:</span>
                  <span>Rs{totalReturnAmount.toFixed(2)}</span>
                </div>
                {formData.restockingFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>{t('restocking_fee')}:</span>
                    <span>-Rs{formData.restockingFee.toFixed(2)}</span>
                  </div>
                )}
                {formData.processingFee > 0 && (
                  <div className="flex justify-between text-sm text-red-600">
                    <span>{t('processing_fee')}:</span>
                    <span>-Rs{formData.processingFee.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between text-lg font-bold border-t pt-2">
                  <span>{t('final_refund_amount')}:</span>
                  <span className="text-green-600">Rs{finalRefundAmount.toFixed(2)}</span>
                </div>
              </div>
            </div>

            {finalRefundAmount < 0 && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700">
                  {t('warning')}: {t('fees_exceed_return_amount')}. {t('customer_may_owe_money')}.
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex justify-end gap-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button 
            type="submit" 
            disabled={buttonDisabled}
            onClick={() => console.log('Create Return button clicked!')}
          >
            {isLoading ? t('creating_return') + '...' : t('create_return')}
          </Button>
        </div>
      </form>
    )
}

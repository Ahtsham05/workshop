import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Minus, Plus, Trash2, Save, Calculator, DollarSign, Search, Check, User, Package } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useLanguage } from '@/context/language-context'
import { Invoice } from '../index'
import { toast } from 'sonner'
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
  products: any[]
}

export function InvoicePanel({
  invoice,
  setInvoice,
  updateQuantity,
  removeFromInvoice,
  updateInvoiceType,
  updateDiscount,
  taxRate,
  setTaxRate,
  customers,
  products
}: InvoicePanelProps) {
  const { t, isRTL } = useLanguage()
  const [discountInput, setDiscountInput] = useState('0')
  const [paidAmountInput, setPaidAmountInput] = useState('')
  const [showProfitDetails, setShowProfitDetails] = useState(false)
  const [customerSelectOpen, setCustomerSelectOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')

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
    const newItems = invoice.items.map(item => 
      item.id === itemId 
        ? { 
            ...item, 
            productId: product._id,
            name: product.name,
            image: product.image,
            unitPrice: product.price,
            cost: product.cost,
            subtotal: product.price * item.quantity,
            profit: item.quantity * (product.price - product.cost),
            isManualEntry: false
          }
        : item
    )
    setInvoice(prev => ({
      ...prev,
      items: newItems
    }))
    setProductSelectOpen('')
    setProductSearchQuery('')
  }, [invoice.items, setInvoice])

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

  const handleSaveInvoice = useCallback(() => {
    if (invoice.items.length === 0) {
      toast.error('Please add items to the invoice')
      return
    }

    if (invoice.type === 'credit' && !invoice.dueDate) {
      toast.error('Please set a due date for credit invoice')
      return
    }

    // Here you would typically call an API to save the invoice
    console.log('Saving invoice:', invoice)
    toast.success('Invoice saved successfully!')
  }, [invoice])

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'cash': return 'bg-green-100 text-green-800'
      case 'credit': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  return (
    <div className='space-y-4 h-full flex flex-col'>
      {/* Customer and Type Selection */}
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <DollarSign className='h-5 w-5' />
            {t('invoice_details')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid grid-cols-2 gap-4'>
            <div>
              <Label htmlFor="customer" className='mb-2'>{t('customer')}</Label>
              <Popover open={customerSelectOpen} onOpenChange={setCustomerSelectOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerSelectOpen}
                    className="w-full justify-between min-h-[2.5rem] h-auto py-0"
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <Search className="w-4 h-4 flex-shrink-0" />
                      {invoice.customerId ? (
                        <div className="flex items-center gap-2 flex-1">
                          {invoice.customerId === 'walk-in' ? (
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span className="text-xs">{t('walk_in_customer')}</span>
                            </Badge>
                          ) : (
                            (() => {
                              const selectedCustomer = customers.find(c => (c._id || c.id) === invoice.customerId)
                              return selectedCustomer ? (
                                <Badge variant="secondary" className="flex items-center gap-1">
                                  <div className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] font-medium text-white">
                                      {selectedCustomer.name?.charAt(0).toUpperCase() || 'C'}
                                    </span>
                                  </div>
                                  <span className="text-xs">{selectedCustomer.name}</span>
                                </Badge>
                              ) : null
                            })()
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{t('select_customer')}</span>
                      )}
                    </div>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align={isRTL ? "end" : "start"}>
                  <Command shouldFilter={false}>
                    <CommandInput 
                      placeholder={t('search_customers_by_name_or_phone')} 
                      value={customerSearchQuery}
                      onValueChange={setCustomerSearchQuery}
                    />
                    <CommandEmpty>{t('no_customers_found')}</CommandEmpty>
                    <CommandList>
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
                                setInvoice(prev => ({ ...prev, customerId }))
                                setCustomerSelectOpen(false)
                                setCustomerSearchQuery('')
                              }}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                  <span className="text-sm font-medium text-white">
                                    {customer.name?.charAt(0).toUpperCase() || 'C'}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span>{customer.name}</span>
                                  {customer.phone && (
                                    <span className="text-xs text-muted-foreground">{customer.phone}</span>
                                  )}
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-4 h-4 rounded-sm flex items-center justify-center">
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
                  <SelectItem value="credit">{t('credit')}</SelectItem>
                  <SelectItem value="pending">{t('pending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {invoice.type === 'credit' && (
            <div>
              <Label htmlFor="dueDate">{t('due_date')}</Label>
              <Input
                type="date"
                value={invoice.dueDate || new Date().toISOString().split('T')[0]}
                onChange={(e) => setInvoice(prev => ({ ...prev, dueDate: e.target.value }))}
              />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Items */}
      <Card className='flex-1 flex flex-col'>
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
        <CardContent className='flex-1 overflow-hidden'>
          <div className='space-y-2 h-full overflow-y-auto'>
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
                  <div className='flex-1 min-w-0'>
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
                              className="w-full justify-between h-8 text-xs"
                            >
                              <div className="flex items-center gap-2 flex-1">
                                <Search className="w-3 h-3 flex-shrink-0" />
                                <span className="text-muted-foreground truncate">
                                  {item.name || t('select_product')}
                                </span>
                              </div>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-[300px] p-0" align="start">
                            <Command shouldFilter={false}>
                              <CommandInput 
                                placeholder={t('search_products')} 
                                value={productSearchQuery}
                                onValueChange={setProductSearchQuery}
                              />
                              <CommandEmpty>{t('no_products_found')}</CommandEmpty>
                              <CommandList>
                                <CommandGroup>
                                  {filteredProducts.map((product) => (
                                    <CommandItem
                                      key={product._id}
                                      onSelect={() => handleProductSelect(item.id, product)}
                                      className="flex items-center gap-2 cursor-pointer"
                                    >
                                      <div className="flex items-center gap-2 flex-1">
                                        {product.image?.url ? (
                                          <img 
                                            src={product.image.url} 
                                            alt={product.name}
                                            className="w-6 h-6 object-cover rounded"
                                          />
                                        ) : (
                                          <div className="w-6 h-6 rounded bg-muted flex items-center justify-center">
                                            <Package className="w-3 h-3 text-muted-foreground" />
                                          </div>
                                        )}
                                        <div className="flex flex-col flex-1">
                                          <span className="text-sm">{product.name}</span>
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
                      </div>
                    ) : (
                      <div>
                        <p className='font-medium truncate'>{item.name}</p>
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
                        setInvoice(prev => ({
                          ...prev,
                          items: newItems
                        }))
                      }}
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
          <div className='grid grid-cols-2 gap-4'>
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
          </div>

          <Separator />

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

                <div className='space-y-2'>
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

          {/* Save Button */}
          <Button 
            onClick={handleSaveInvoice}
            className='w-full'
            size="lg"
            disabled={invoice.items.length === 0}
          >
            <Save className='h-4 w-4 mr-2' />
            {t('save_invoice')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

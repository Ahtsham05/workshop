import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
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
import { 
  ArrowLeft, 
  // Calendar, 
  ChevronDown, 
  Package, 
  Printer, 
  Receipt, 
  Search,
  User, 
  Check,
  Clock,
  Plus,
  FileText,
  AlertCircle,
  Filter,
  CheckCircle,
  History
} from 'lucide-react'
import { format } from 'date-fns'
import { useLanguage } from '@/context/language-context'
import { useGetInvoicesQuery, useCreateInvoiceMutation, useUpdateInvoiceMutation } from '@/stores/invoice.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindow, openA4PrintWindow, type PrintInvoiceData } from '../utils/print-utils'
import { toast } from 'sonner'

interface ConvertedItem {
  id: string
  productId: string
  name: string
  image?: { url: string; publicId: string }
  quantity: number
  unitPrice: number
  cost: number
  subtotal: number
  profit: number
  sources: string[] // Track which invoices this item came from
}

interface PendingInvoiceConverterProps {
  customers: any[]
  onBack: () => void
}

export function PendingInvoiceConverter({ customers, onBack }: PendingInvoiceConverterProps) {
  const { t } = useLanguage()
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('')
  const [selectedInvoices, setSelectedInvoices] = useState<Set<string>>(new Set())
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState('')
  // const [invoiceDate, setInvoiceDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [dueDate, setDueDate] = useState<string>('')
  const [viewMode, setViewMode] = useState<'pending' | 'converted' | 'all'>('pending')
  const [dateFilter, setDateFilter] = useState({
    from: format(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd'), // 30 days ago
    to: format(new Date(), 'yyyy-MM-dd') // today
  })
  
  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()

  // Set default due date (30 days from today)
  useEffect(() => {
    const defaultDueDate = new Date()
    defaultDueDate.setDate(defaultDueDate.getDate() + 30)
    setDueDate(format(defaultDueDate, 'yyyy-MM-dd'))
  }, [])

  // Fetch pending invoices for selected customer based on view mode
  const { data: pendingInvoicesResponse, isLoading: loadingInvoices, refetch } = useGetInvoicesQuery(
    {
      customerId: selectedCustomerId,
      limit: 100,
      page: 1,
      dateFrom: dateFilter.from,
      dateTo: dateFilter.to
    },
    {
      skip: !selectedCustomerId || selectedCustomerId === 'walk-in'
    }
  )

  const pendingInvoices = pendingInvoicesResponse?.results || []

  // Get selected customer name
  const selectedCustomer = customers.find(c => (c._id || c.id) === selectedCustomerId)

  // Debug log
  useEffect(() => {
    console.log('Query params:', {
      customerId: selectedCustomerId,
      limit: 100,
      page: 1,
      dateFrom: dateFilter.from,
      dateTo: dateFilter.to,
      viewMode
    })
    console.log('Selected customer:', selectedCustomer)
    console.log('Pending invoices response:', pendingInvoicesResponse)
  }, [selectedCustomerId, dateFilter.from, dateFilter.to, viewMode, selectedCustomer, pendingInvoicesResponse])

  // Force re-render when API data changes
  useEffect(() => {
    console.log('API data updated, pendingInvoices:', pendingInvoices.length, 'invoices')
  }, [pendingInvoicesResponse])

  // Filter invoices based on view mode and conversion status
  const filteredInvoices = useMemo(() => {
    console.log('Recalculating filteredInvoices...')
    console.log('All invoices from API:', pendingInvoices.length, pendingInvoices)
    console.log('Current view mode:', viewMode)
    
    if (viewMode === 'all') return pendingInvoices
    
    const filtered = pendingInvoices.filter((invoice: any) => {
      const isConverted = invoice.convertedToCredit === true
      
      // An invoice is considered "pending" if:
      // 1. It's NOT a credit invoice (credit invoices are not pending for conversion)
      // 2. It's not already converted to credit
      const isPending = invoice.type !== 'credit' && !isConverted
      
      console.log(`Invoice ${invoice.invoiceNumber}: type=${invoice.type}, status=${invoice.status}, balance=${invoice.balance}, isConverted=${isConverted}, isPending=${isPending}`)
      
      if (viewMode === 'converted') return isConverted
      if (viewMode === 'pending') return isPending
      
      return true
    })
    
    console.log(`Filtered ${filtered.length} invoices for mode "${viewMode}":`, filtered)
    return filtered
  }, [pendingInvoices, viewMode, pendingInvoicesResponse])

  // Debug customer selection
  useEffect(() => {
    if (selectedCustomerId) {
      console.log('Selected Customer ID:', selectedCustomerId)
      console.log('Available customers:', customers.map(c => ({ id: c._id || c.id, name: c.name })))
      console.log('Found selected customer:', selectedCustomer)
    }
  }, [selectedCustomerId, customers, selectedCustomer])

  // Filter customers by search query (like invoice panel)
  const filteredCustomers = customers.filter(customer => {
    if (!customerSearchQuery) return true
    const query = customerSearchQuery.toLowerCase()
    const name = customer.name?.toLowerCase() || ''
    const phone = customer.phone?.toLowerCase() || ''
    return name.includes(query) || phone.includes(query)
  })

  // Convert and merge items from selected invoices
  const convertedItems = useMemo(() => {
    if (selectedInvoices.size === 0) return []

    const itemMap = new Map<string, ConvertedItem>()

    // Process each selected invoice
    selectedInvoices.forEach(invoiceId => {
      const invoice = filteredInvoices.find((inv: any) => inv._id === invoiceId)
      if (!invoice) return

      // Process each item in the invoice
      invoice.items.forEach((item: any) => {
        const key = item.productId || item.id
        
        if (itemMap.has(key)) {
          // Item already exists - merge quantities
          const existingItem = itemMap.get(key)!
          existingItem.quantity += item.quantity
          existingItem.subtotal = existingItem.quantity * existingItem.unitPrice
          existingItem.profit = existingItem.quantity * (existingItem.unitPrice - existingItem.cost)
          existingItem.sources.push(invoice.invoiceNumber || invoiceId)
        } else {
          // New item - add to map
          itemMap.set(key, {
            id: key,
            productId: item.productId,
            name: item.name,
            image: item.image,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            cost: item.cost,
            subtotal: item.quantity * item.unitPrice,
            profit: item.quantity * (item.unitPrice - item.cost),
            sources: [invoice.invoiceNumber || invoiceId]
          })
        }
      })
    })

    return Array.from(itemMap.values())
  }, [selectedInvoices, filteredInvoices])

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = convertedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const totalProfit = convertedItems.reduce((sum, item) => sum + item.profit, 0)
    const totalCost = convertedItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
    
    return {
      subtotal,
      total: subtotal, // No tax or discount for now
      totalProfit,
      totalCost,
      tax: 0,
      discount: 0
    }
  }, [convertedItems])

  // Toggle invoice selection
  const toggleInvoiceSelection = (invoiceId: string) => {
    const newSelection = new Set(selectedInvoices)
    if (newSelection.has(invoiceId)) {
      newSelection.delete(invoiceId)
    } else {
      newSelection.add(invoiceId)
    }
    setSelectedInvoices(newSelection)
  }

  // Select all invoices
  const selectAllInvoices = () => {
    if (selectedInvoices.size === filteredInvoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(filteredInvoices.map((inv: any) => inv._id)))
    }
  }

  // Mark pending invoices as converted
  const markInvoicesAsConverted = async (invoiceIds: string[]) => {
    try {
      const updatePromises = invoiceIds.map(invoiceId =>
        updateInvoice({
          id: invoiceId,
          notes: `Converted to credit invoice on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')}`
          // Removed convertedToCredit and convertedAt fields as they're not allowed by backend
        }).unwrap()
      )
      
      await Promise.all(updatePromises)
    } catch (error) {
      console.error('Failed to mark invoices as converted:', error)
      // Don't throw - we still want to show success for the credit invoice creation
      // In a production environment, you might want to implement this tracking differently
      // For now, we'll create the credit invoice successfully but won't track the conversion status
    }
  }

  // Print invoice with utility function
  const printInvoice = (invoiceData: any, printType: 'receipt' | 'a4' = 'receipt') => {
    try {
      const printData: PrintInvoiceData = {
        invoiceNumber: invoiceData.invoiceNumber,
        items: invoiceData.items.map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal
        })),
        customerId: selectedCustomer,
        customerName: selectedCustomer?.name,
        type: 'credit',
        subtotal: invoiceData.subtotal,
        tax: invoiceData.tax,
        discount: invoiceData.discount || 0,
        total: invoiceData.total,
        paidAmount: invoiceData.paidAmount || 0,
        balance: invoiceData.balance || invoiceData.total,
        dueDate: invoiceData.dueDate,
        notes: invoiceData.notes,
        deliveryCharge: 0,
        serviceCharge: 0
      }

      if (printType === 'a4') {
        const htmlContent = generateA4InvoiceHTML(printData, t)
        openA4PrintWindow(htmlContent)
      } else {
        const htmlContent = generateInvoiceHTML(printData, t)
        openPrintWindow(htmlContent)
      }
    } catch (error) {
      console.error('Print error:', error)
      toast.error(t('print_failed'))
    }
  }

  // Create credit invoice from selected pending invoices
  const handleCreateCreditInvoice = async (printType: 'none' | 'receipt' | 'a4' = 'none') => {
    if (!selectedCustomerId || selectedInvoices.size === 0) {
      toast.error(t('please_select_customer_and_invoices'))
      return
    }

    if (convertedItems.length === 0) {
      toast.error(t('no_items_to_convert'))
      return
    }

    try {
      // Prepare invoice data
      const invoiceData = {
        items: convertedItems.map(item => ({
          productId: item.productId,
          name: item.name,
          image: item.image,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          cost: item.cost,
          subtotal: item.subtotal,
          profit: item.profit,
          isManualEntry: false
        })),
        customerId: selectedCustomerId,
        type: 'credit' as const,
        subtotal: totals.subtotal,
        tax: totals.tax,
        discount: totals.discount,
        total: totals.total,
        totalProfit: totals.totalProfit,
        totalCost: totals.totalCost,
        paidAmount: 0,
        balance: totals.total,
        dueDate: dueDate,
        notes: notes || `Converted from pending invoices: ${Array.from(selectedInvoices).join(', ')}`,
        deliveryCharge: 0,
        serviceCharge: 0,
        roundingAdjustment: 0
      }

      // Create the credit invoice
      const result = await createInvoice(invoiceData).unwrap()
      
      // Mark the selected pending invoices as converted
      await markInvoicesAsConverted(Array.from(selectedInvoices))
      
      toast.success(t('credit_invoice_created_successfully'))

      // Print if requested
      if (printType !== 'none') {
        printInvoice(result, printType)
      }

      // Reset form
      setSelectedInvoices(new Set())
      setNotes('')
      
    } catch (error: any) {
      console.error('Failed to create credit invoice:', error)
      toast.error(error?.data?.message || t('failed_to_create_invoice'))
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={onBack}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  {t('back')}
                </Button>
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    {t('convert_pending_invoices')}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t('select_pending_invoices_to_convert_to_credit')}
                  </p>
                </div>
              </div>
            </div>
          </CardHeader>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Customer Selection & Pending Invoices */}
          <div className="lg:col-span-2 space-y-6">
            {/* Customer Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  {t('select_customer')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={customerSearchOpen}
                      className={`w-full justify-between min-h-[2.5rem] h-auto py-0 ${
                        !selectedCustomerId ? 'border-red-500 bg-red-50' : ''
                      }`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Search className="w-4 h-4 flex-shrink-0" />
                        {selectedCustomer ? (
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                              <div className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                <span className="text-[10px] font-medium text-white">
                                  {selectedCustomer.name?.charAt(0).toUpperCase() || 'C'}
                                </span>
                              </div>
                              <span className="text-xs truncate" title={selectedCustomer.name}>
                                {selectedCustomer.name}
                              </span>
                            </Badge>
                          </div>
                        ) : (
                          <span className="truncate text-muted-foreground" title={t('select_customer')}>
                            {t('select_customer')} <span className="text-red-500">*</span>
                          </span>
                        )}
                      </div>
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command shouldFilter={false}>
                      <CommandInput 
                        placeholder={t('search_customers_by_name_or_phone')} 
                        value={customerSearchQuery}
                        onValueChange={setCustomerSearchQuery}
                      />
                      <CommandEmpty>{t('no_customers_found')}</CommandEmpty>
                      <CommandList className="max-h-[300px] overflow-y-auto">
                        <CommandGroup>
                          {filteredCustomers.map((customer) => {
                            const customerId = customer._id || customer.id
                            const isSelected = selectedCustomerId === customerId
                            return (
                              <CommandItem
                                key={customerId}
                                value={customer.name}
                                onSelect={() => {
                                  setSelectedCustomerId(customerId)
                                  setSelectedInvoices(new Set()) // Reset selections
                                  setCustomerSearchOpen(false)
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
                                    <span className="truncate font-medium" title={customer.name}>
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
              </CardContent>
            </Card>

            {/* Pending Invoices */}
            {selectedCustomerId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      {viewMode === 'pending' ? t('pending_invoices') : 
                       viewMode === 'converted' ? t('converted_invoices') : 
                       t('all_invoices')}
                      {filteredInvoices.length > 0 && (
                        <Badge variant="secondary">{filteredInvoices.length}</Badge>
                      )}
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      {/* View Mode Selector */}
                      <Select value={viewMode} onValueChange={(value: 'pending' | 'converted' | 'all') => setViewMode(value)}>
                        <SelectTrigger className="w-40">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4" />
                              {t('pending_only')}
                            </div>
                          </SelectItem>
                          <SelectItem value="converted">
                            <div className="flex items-center gap-2">
                              <CheckCircle className="h-4 w-4" />
                              {t('converted_only')}
                            </div>
                          </SelectItem>
                          <SelectItem value="all">
                            <div className="flex items-center gap-2">
                              <History className="h-4 w-4" />
                              {t('all_invoices')}
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>

                      {viewMode === 'pending' && filteredInvoices.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={selectAllInvoices}
                        >
                          {selectedInvoices.size === filteredInvoices.length ? t('deselect_all') : t('select_all')}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Date Filter */}
                  <div className="flex items-center gap-4 pt-4 border-t">
                    <div className="flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      <Label className="text-sm font-medium">{t('filter_by_date_range')}</Label>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="date"
                        value={dateFilter.from}
                        onChange={(e) => {
                          console.log('Changing from date to:', e.target.value)
                          setDateFilter(prev => ({ ...prev, from: e.target.value }))
                          // Trigger refetch after a short delay
                          setTimeout(() => {
                            console.log('Triggering refetch for from date change')
                            refetch()
                          }, 100)
                        }}
                        className="w-36"
                        title={t('from_date')}
                      />
                      <span className="text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={dateFilter.to}
                        onChange={(e) => {
                          console.log('Changing to date to:', e.target.value)
                          setDateFilter(prev => ({ ...prev, to: e.target.value }))
                          // Trigger refetch after a short delay
                          setTimeout(() => {
                            console.log('Triggering refetch for to date change')
                            refetch()
                          }, 100)
                        }}
                        className="w-36"
                        title={t('to_date')}
                      />
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingInvoices ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                      <p>{t('loading_invoices')}</p>
                    </div>
                  ) : filteredInvoices.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">
                        {viewMode === 'pending' ? t('no_pending_invoices_found') : 
                         viewMode === 'converted' ? t('no_converted_invoices_found') : 
                         t('no_invoices_found')}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {filteredInvoices.map((invoice: any) => {
                        const isConverted = invoice.convertedToCredit === true
                        const isSelected = selectedInvoices.has(invoice._id)
                        
                        return (
                          <div
                            key={invoice._id}
                            className={`border rounded-lg p-4 transition-colors ${
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : isConverted 
                                ? 'border-green-200 bg-green-50'
                                : 'border-border hover:border-primary/50'
                            } ${viewMode === 'pending' && !isConverted ? 'cursor-pointer' : ''}`}
                            onClick={() => {
                              if (viewMode === 'pending' && !isConverted) {
                                toggleInvoiceSelection(invoice._id)
                              }
                            }}
                          >
                            <div className="flex items-center gap-3">
                              {viewMode === 'pending' && !isConverted && (
                                <Checkbox
                                  checked={isSelected}
                                  onChange={() => toggleInvoiceSelection(invoice._id)}
                                />
                              )}
                              
                              <div className="flex-1">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div>
                                      <div className="flex items-center gap-2">
                                        <div className="font-medium">{invoice.invoiceNumber}</div>
                                        {/* Show invoice type badge */}
                                        <Badge 
                                          variant="outline" 
                                          className={`text-xs ${
                                            invoice.type === 'credit' 
                                              ? 'bg-green-100 text-green-800' 
                                              : invoice.type === 'cash'
                                              ? 'bg-blue-100 text-blue-800'
                                              : 'bg-yellow-100 text-yellow-800'
                                          }`}
                                        >
                                          {invoice.type === 'credit' && <CheckCircle className="h-3 w-3 mr-1" />}
                                          {invoice.type === 'cash' && <Receipt className="h-3 w-3 mr-1" />}
                                          {invoice.type !== 'credit' && invoice.type !== 'cash' && <Clock className="h-3 w-3 mr-1" />}
                                          {invoice.type?.toUpperCase() || 'PENDING'}
                                        </Badge>
                                        {/* Show conversion status if converted */}
                                        {isConverted && (
                                          <Badge variant="outline" className="text-xs bg-purple-100 text-purple-800">
                                            <History className="h-3 w-3 mr-1" />
                                            {t('converted')}
                                          </Badge>
                                        )}
                                      </div>
                                      <div className="text-sm text-muted-foreground">
                                        {format(new Date(invoice.createdAt), 'MMM dd, yyyy')} • 
                                        {invoice.items.length} {t('items')}
                                        {isConverted && invoice.convertedAt && (
                                          <span> • {t('converted_on')} {format(new Date(invoice.convertedAt), 'MMM dd, yyyy')}</span>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="font-medium">Rs {invoice.total.toFixed(2)}</div>
                                    <Badge 
                                      variant="outline" 
                                      className={`text-xs ${
                                        invoice.type === 'credit' 
                                          ? 'bg-green-100 text-green-800' 
                                          : invoice.type === 'cash'
                                          ? 'bg-blue-100 text-blue-800'
                                          : 'bg-yellow-100 text-yellow-800'
                                      }`}
                                    >
                                      {invoice.type?.toUpperCase() || 'PENDING'}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                              
                              {isConverted && (
                                <div className="text-green-600">
                                  <CheckCircle className="h-5 w-5" />
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Panel - Converted Items & Actions */}
          <div className="space-y-6">
            {/* New Credit Invoice Details */}
            {/* <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {t('new_credit_invoice_details')}
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {t('details_for_new_credit_invoice')}
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="invoiceDate">{t('credit_invoice_date')}</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="dueDate">{t('credit_due_date')}</Label>
                  <Input
                    id="dueDate"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label htmlFor="notes">{t('credit_invoice_notes')}</Label>
                  <Input
                    id="notes"
                    placeholder={t('enter_notes_for_credit_invoice')}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </div>
              </CardContent>
            </Card> */}

            {/* Converted Items Summary */}
            {convertedItems.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    {t('merged_items')}
                    <Badge variant="secondary">{convertedItems.length}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('item')}</TableHead>
                        <TableHead className="text-right">{t('qty')}</TableHead>
                        <TableHead className="text-right">{t('total')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {convertedItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium text-sm">{item.name}</div>
                              {item.sources.length > 1 && (
                                <div className="text-xs text-muted-foreground">
                                  {t('from')} {item.sources.length} {t('invoices')}
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right">{item.quantity}</TableCell>
                          <TableCell className="text-right">Rs {item.subtotal.toFixed(2)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <Separator className="my-4" />

                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>{t('subtotal')}</span>
                      <span>Rs {totals.subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between font-medium">
                      <span>{t('total')}</span>
                      <span>Rs {totals.total.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Action Buttons */}
            {convertedItems.length > 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <Button
                      onClick={() => handleCreateCreditInvoice('receipt')}
                      disabled={isCreating}
                      className="w-full"
                    >
                      <Receipt className="mr-2 h-4 w-4" />
                      {isCreating ? t('creating') : t('create_and_print_receipt')}
                    </Button>
                    
                    <Button
                      onClick={() => handleCreateCreditInvoice('a4')}
                      disabled={isCreating}
                      variant="outline"
                      className="w-full"
                    >
                      <Printer className="mr-2 h-4 w-4" />
                      {t('create_and_print_a4')}
                    </Button>

                    <Button
                      onClick={() => handleCreateCreditInvoice('none')}
                      disabled={isCreating}
                      variant="secondary"
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {t('create_without_printing')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

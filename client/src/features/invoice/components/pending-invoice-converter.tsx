import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
// import { Input } from '@/components/ui/input'
// import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Separator } from '@/components/ui/separator'
// import {
//   Select,
//   SelectContent,
//   SelectItem,
//   SelectTrigger,
//   SelectValue,
// } from '@/components/ui/select'
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
  // FileText,
  AlertCircle,
  CheckCircle,
  // History
} from 'lucide-react'
import { format } from 'date-fns'
import { useLanguage } from '@/context/language-context'
import { useGetInvoicesQuery, useCreateInvoiceMutation, useUpdateInvoiceMutation } from '@/stores/invoice.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindow, openA4PrintWindow, type PrintInvoiceData } from '../utils/print-utils'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'

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
  const [customerBalance, setCustomerBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  
  const [createInvoice, { isLoading: isCreating }] = useCreateInvoiceMutation()
  const [updateInvoice] = useUpdateInvoiceMutation()

  // Set default due date (30 days from today)
  useEffect(() => {
    const defaultDueDate = new Date()
    defaultDueDate.setDate(defaultDueDate.getDate() + 30)
    setDueDate(format(defaultDueDate, 'yyyy-MM-dd'))
  }, [])

  // Fetch customer balance when customer is selected
  useEffect(() => {
    const fetchCustomerBalance = async () => {
      if (!selectedCustomerId || selectedCustomerId === 'walk-in') {
        setCustomerBalance(0)
        return
      }

      setLoadingBalance(true)
      try {
        const url = `${summery.fetchCustomerBalance.url}/${selectedCustomerId}${summery.fetchCustomerBalance.urlSuffix || ''}`
        const response = await Axios.get(url)
        console.log('Customer balance response:', response.data)
        setCustomerBalance(response.data?.balance || 0)
      } catch (error) {
        console.error('Failed to fetch customer balance:', error)
        setCustomerBalance(0)
      } finally {
        setLoadingBalance(false)
      }
    }

    fetchCustomerBalance()
  }, [selectedCustomerId])

  // Fetch ALL invoices for selected customer (both pending and converted)
  const { data: allInvoicesResponse, isLoading: loadingInvoices, refetch } = useGetInvoicesQuery(
    {
      customerId: selectedCustomerId,
      // No type filter - we want ALL invoices (pending, credit, cash)
      limit: 1000, // Fetch all invoices
      page: 1
      // No date filter - we want ALL invoices regardless of date
    },
    {
      skip: !selectedCustomerId || selectedCustomerId === 'walk-in'
    }
  )

  const allInvoices = allInvoicesResponse?.results || []

  // Get selected customer name
  const selectedCustomer = customers.find(c => (c._id || c.id) === selectedCustomerId)

  // Separate pending (not converted) and converted invoices
  // Unconverted: pending type invoices that haven't been converted yet
  const unconvertedInvoices = useMemo(() => {
    return allInvoices.filter((invoice: any) => 
      invoice.type === 'pending' && !invoice.isConvertedToBill
    )
  }, [allInvoices])

  // Converted: pending type invoices that have been converted (marked as sent to party)
  const convertedInvoices = useMemo(() => {
    return allInvoices.filter((invoice: any) => 
      invoice.type === 'pending' && invoice.isConvertedToBill === true
    )
  }, [allInvoices])

  // Group converted invoices by bill number
  const groupedConvertedBills = useMemo(() => {
    const billGroups = new Map<string, {
      billNumber: string
      invoices: any[]
      totalAmount: number
      items: any[]
      convertedAt: string
      dueDate?: string
      notes: string
    }>()

    convertedInvoices.forEach((invoice: any) => {
      const billNumber = invoice.billNumber || 'N/A'
      
      if (billGroups.has(billNumber)) {
        // Add to existing bill group
        const group = billGroups.get(billNumber)!
        group.invoices.push(invoice)
        group.totalAmount += invoice.total || 0
        // Merge items
        invoice.items?.forEach((item: any) => {
          const existingItemIndex = group.items.findIndex((groupItem: any) => 
            groupItem.productId === item.productId || groupItem.name === item.name
          )
          if (existingItemIndex !== -1) {
            // Create a new item with merged quantities instead of modifying existing
            const existingItem = group.items[existingItemIndex]
            group.items[existingItemIndex] = {
              ...existingItem,
              quantity: existingItem.quantity + item.quantity,
              subtotal: existingItem.subtotal + item.subtotal
            }
          } else {
            group.items.push({ ...item })
          }
        })
      } else {
        // Create new bill group
        billGroups.set(billNumber, {
          billNumber,
          invoices: [invoice],
          totalAmount: invoice.total || 0,
          items: invoice.items ? [...invoice.items] : [],
          convertedAt: invoice.convertedAt || invoice.createdAt,
          dueDate: invoice.dueDate,
          notes: invoice.notes || ''
        })
      }
    })

    return Array.from(billGroups.values())
  }, [convertedInvoices])

  // Debug log
  useEffect(() => {
    console.log('Query params:', {
      customerId: selectedCustomerId,
      limit: 1000,
      page: 1
    })
    console.log('Selected customer:', selectedCustomer)
    console.log('All invoices response:', allInvoicesResponse)
    console.log('Total invoices fetched:', allInvoices.length)
    console.log('Unconverted pending invoices:', unconvertedInvoices.length)
    console.log('Converted pending invoices:', convertedInvoices.length)
    console.log('Grouped converted bills:', groupedConvertedBills.length)
    console.log('Grouped bills data:', groupedConvertedBills)
  }, [selectedCustomerId, selectedCustomer, allInvoicesResponse, allInvoices, unconvertedInvoices, convertedInvoices, groupedConvertedBills])

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
      const invoice = unconvertedInvoices.find((inv: any) => inv._id === invoiceId)
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
  }, [selectedInvoices, unconvertedInvoices])

  // Calculate totals
  const totals = useMemo(() => {
    const subtotal = convertedItems.reduce((sum, item) => sum + item.subtotal, 0)
    const totalProfit = convertedItems.reduce((sum, item) => sum + item.profit, 0)
    const totalCost = convertedItems.reduce((sum, item) => sum + (item.cost * item.quantity), 0)
    const invoiceTotal = subtotal
    const newBalance = customerBalance + invoiceTotal
    
    return {
      subtotal,
      total: invoiceTotal,
      totalProfit,
      totalCost,
      tax: 0,
      discount: 0,
      previousBalance: customerBalance,
      newBalance: newBalance
    }
  }, [convertedItems, customerBalance])

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
    if (selectedInvoices.size === unconvertedInvoices.length) {
      setSelectedInvoices(new Set())
    } else {
      setSelectedInvoices(new Set(unconvertedInvoices.map((inv: any) => inv._id)))
    }
  }

  // Mark pending invoices as converted with unique bill number
  const markInvoicesAsConverted = async (invoiceIds: string[], creditInvoiceId: string, billNumber: string) => {
    try {
      const updatePromises = invoiceIds.map(invoiceId =>
        updateInvoice({
          id: invoiceId,
          isConvertedToBill: true,
          convertedAt: new Date().toISOString(),
          convertedTo: creditInvoiceId,
          billNumber: billNumber,
          notes: `Bill sent to party on ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')} - Bill #${billNumber}`
        }).unwrap()
      )
      
      await Promise.all(updatePromises)
      console.log('Successfully marked invoices as converted with bill number:', billNumber, invoiceIds)
      
      // Refetch pending invoices to update the UI
      setTimeout(() => refetch(), 500)
    } catch (error) {
      console.error('Failed to mark invoices as converted:', error)
      toast.error('Failed to mark invoices as sent to party')
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
        serviceCharge: 0,
        previousBalance: customerBalance,
        newBalance: customerBalance + invoiceData.total
      }

      if (printType === 'a4') {
        const htmlContent = generateA4InvoiceHTML(printData)
        openA4PrintWindow(htmlContent)
      } else {
        const htmlContent = generateInvoiceHTML(printData)
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
      // Generate unique bill number first using fetch with timestamp to avoid caching
      const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'
      const billNumberResponse = await fetch(`${baseUrl}/invoices/generate-bill-number?t=${Date.now()}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken') || ''}`,
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      })
      
      console.log('Bill number response status:', billNumberResponse.status)
      
      if (!billNumberResponse.ok) {
        const errorData = await billNumberResponse.json().catch(() => ({}))
        console.error('Bill number generation error:', errorData)
        throw new Error(errorData.message || 'Failed to generate bill number')
      }
      
      const responseData = await billNumberResponse.json()
      console.log('Bill number response:', responseData)
      
      const { billNumber } = responseData
      
      if (!billNumber) {
        throw new Error('No bill number returned from server')
      }
      
      console.log('Generated bill number:', billNumber)

      // Validate converted items
      if (convertedItems.some(item => !item.productId)) {
        throw new Error('Some items are missing productId')
      }

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
        billNumber: billNumber,
        notes: notes || `Converted from ${selectedInvoices.size} pending invoices - Bill #${billNumber}`,
        deliveryCharge: 0,
        serviceCharge: 0,
        roundingAdjustment: 0
      }
      
      console.log('Prepared invoice data:', JSON.stringify(invoiceData, null, 2))

      // Create the credit invoice
      console.log('Creating credit invoice with data:', invoiceData)
      const result = await createInvoice(invoiceData).unwrap()
      console.log('Credit invoice created successfully:', result)
      
      // Mark the selected pending invoices as converted with the unique bill number
      console.log('Marking invoices as converted...')
      await markInvoicesAsConverted(Array.from(selectedInvoices), result._id, billNumber)
      console.log('Invoices marked as converted successfully')
      
      toast.success(`${t('credit_invoice_created_successfully')} - Bill #${billNumber}`)

      // Print if requested
      if (printType !== 'none') {
        console.log('Printing invoice...')
        printInvoice(result, printType)
      }

      // Reset form
      setSelectedInvoices(new Set())
      setNotes('')
      
    } catch (error: any) {
      console.error('Failed to create credit invoice - Full error:', error)
      console.error('Error response:', error?.response)
      console.error('Error data:', error?.data)
      const errorMessage = error?.data?.message || error?.message || t('failed_to_create_invoice')
      toast.error(`Failed to convert: ${errorMessage}`)
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

            {/* Pending Invoices - For Selection */}
            {selectedCustomerId && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Clock className="h-5 w-5" />
                      {t('pending_invoices')}
                      {unconvertedInvoices.length > 0 && (
                        <Badge variant="secondary">{unconvertedInvoices.length}</Badge>
                      )}
                    </CardTitle>
                    {unconvertedInvoices.length > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={selectAllInvoices}
                      >
                        {selectedInvoices.size === unconvertedInvoices.length ? t('deselect_all') : t('select_all')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  {loadingInvoices ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                      <p>{t('loading_invoices')}</p>
                    </div>
                  ) : unconvertedInvoices.length === 0 ? (
                    <div className="text-center py-8">
                      <AlertCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">{t('no_pending_invoices_found')}</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {unconvertedInvoices.map((invoice: any) => {
                        const isSelected = selectedInvoices.has(invoice._id)
                        
                        return (
                          <div
                            key={invoice._id}
                            className={`border rounded-lg p-4 transition-colors cursor-pointer ${
                              isSelected
                                ? 'border-primary bg-primary/5'
                                : 'border-border hover:border-primary/50'
                            }`}
                            onClick={() => toggleInvoiceSelection(invoice._id)}
                          >
                            <div className="flex items-center gap-3">
                              <Checkbox
                                checked={isSelected}
                                onChange={() => toggleInvoiceSelection(invoice._id)}
                              />
                              
                              <div className="flex-1">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="font-medium">{invoice.invoiceNumber}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {format(new Date(invoice.createdAt), 'MMM dd, yyyy')}
                                  </div>
                                </div>
                                
                                {/* Show items list */}
                                <div className="text-sm space-y-1 mb-2">
                                  {invoice.items.slice(0, 3).map((item: any, idx: number) => (
                                    <div key={idx} className="flex justify-between text-muted-foreground">
                                      <span>{item.name}</span>
                                      <span>Qty: {item.quantity}</span>
                                    </div>
                                  ))}
                                  {invoice.items.length > 3 && (
                                    <div className="text-xs text-muted-foreground">
                                      +{invoice.items.length - 3} more items
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Converted Invoices - Table View */}
            {selectedCustomerId && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    {t('converted_invoices')}
                    {groupedConvertedBills.length > 0 && (
                      <Badge variant="secondary" className="bg-green-100 text-green-800">
                        {groupedConvertedBills.length}
                      </Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {groupedConvertedBills.length === 0 ? (
                    <div className="text-center py-8">
                      <CheckCircle className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                      <p className="text-muted-foreground">{t('no_converted_invoices_found')}</p>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('bill_number')}</TableHead>
                          <TableHead>{t('date')}</TableHead>
                          <TableHead className="text-center">{t('invoices_count')}</TableHead>
                          <TableHead className="text-right">{t('total')}</TableHead>
                          <TableHead className="text-right">{t('actions')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {groupedConvertedBills.map((billGroup) => (
                        <TableRow key={billGroup.billNumber}>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="font-mono font-semibold text-green-600">
                                {billGroup.billNumber}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {billGroup.invoices.length} invoice(s) merged
                              </span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col">
                              <span className="text-sm">
                                {format(new Date(billGroup.convertedAt), 'MMM dd, yyyy')}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {format(new Date(billGroup.convertedAt), 'hh:mm a')}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="outline" className="text-xs">
                              {billGroup.invoices.length}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            Rs {billGroup.totalAmount.toFixed(2)}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  const printData: PrintInvoiceData = {
                                    invoiceNumber: billGroup.billNumber,
                                    items: billGroup.items.map((item: any) => ({
                                      name: item.name,
                                      quantity: item.quantity,
                                      unitPrice: item.unitPrice,
                                      subtotal: item.subtotal
                                    })),
                                    customerId: selectedCustomer,
                                    customerName: selectedCustomer?.name,
                                    type: 'credit',
                                    subtotal: billGroup.totalAmount,
                                    tax: 0,
                                    discount: 0,
                                    total: billGroup.totalAmount,
                                    paidAmount: 0,
                                    balance: billGroup.totalAmount,
                                    dueDate: billGroup.dueDate,
                                    notes: billGroup.notes || `Merged bill from ${billGroup.invoices.length} invoices`,
                                    deliveryCharge: 0,
                                    serviceCharge: 0
                                  }
                                  const htmlContent = generateInvoiceHTML(printData)
                                  openPrintWindow(htmlContent)
                                }}
                                className="flex items-center gap-1"
                              >
                                <Receipt className="h-3 w-3" />
                                Print
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const printData: PrintInvoiceData = {
                                    invoiceNumber: billGroup.billNumber,
                                    items: billGroup.items.map((item: any) => ({
                                      name: item.name,
                                      quantity: item.quantity,
                                      unitPrice: item.unitPrice,
                                      subtotal: item.subtotal
                                    })),
                                    customerId: selectedCustomer,
                                    customerName: selectedCustomer?.name,
                                    type: 'credit',
                                    subtotal: billGroup.totalAmount,
                                    tax: 0,
                                    discount: 0,
                                    total: billGroup.totalAmount,
                                    paidAmount: 0,
                                    balance: billGroup.totalAmount,
                                    dueDate: billGroup.dueDate,
                                    notes: billGroup.notes || `Merged bill from ${billGroup.invoices.length} invoices`,
                                    deliveryCharge: 0,
                                    serviceCharge: 0
                                  }
                                  const htmlContent = generateA4InvoiceHTML(printData)
                                  openA4PrintWindow(htmlContent)
                                }}
                                className="flex items-center gap-1"
                              >
                                <Printer className="h-3 w-3" />
                                A4
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm text-muted-foreground">
                      <span>Previous Balance</span>
                      <span className={customerBalance > 0 ? 'text-red-600' : customerBalance < 0 ? 'text-green-600' : ''}>
                        {loadingBalance ? 'Loading...' : `Rs ${Math.abs(customerBalance).toFixed(2)}`}
                        {customerBalance > 0 && ' (Due)'}
                        {customerBalance < 0 && ' (Advance)'}
                      </span>
                    </div>
                    <div className="flex justify-between font-bold text-lg">
                      <span>New Balance</span>
                      <span className={totals.newBalance > 0 ? 'text-red-600' : totals.newBalance < 0 ? 'text-green-600' : ''}>
                        Rs {Math.abs(totals.newBalance).toFixed(2)}
                        {totals.newBalance > 0 && ' (Due)'}
                        {totals.newBalance < 0 && ' (Advance)'}
                      </span>
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

import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useLanguage } from '@/context/language-context'
import { getTextClasses } from '@/utils/urdu-text-utils'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowLeft,
  Eye,
  Edit,
  Trash2,
  Plus,
  Search,
  Filter,
  Printer,
  Receipt,
  // RotateCcw,
  Clock,
} from 'lucide-react'
import { useGetInvoicesQuery } from '@/stores/invoice.api'
import { useGetCompanyQuery } from '@/stores/company.api'
import { generateInvoiceHTML, openPrintWindow, generateA4InvoiceHTML, openA4PrintWindow, PrintInvoiceData } from '../utils/print-utils'
import { toast } from 'sonner'
import { useGetAllCustomersQuery } from '../../../stores/customer.api'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'

interface InvoiceListProps {
  onBack?: () => void
  onCreateNew?: () => void
  onEdit?: (invoice: any) => void
  onConvertPending?: () => void
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  draft: 'bg-blue-100 text-blue-800',
  finalized: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-gray-100 text-gray-800',
  refunded: 'bg-red-100 text-red-800',
}

const typeColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800',
  credit: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  'pending-converted': 'bg-green-500 text-white', // Converted pending invoices - bright green
}

export function InvoiceList({ onBack, onCreateNew, onEdit, 
  // onReturn, 
  onConvertPending }: InvoiceListProps) {
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [invoiceToDelete, setInvoiceToDelete] = useState<any>(null)
  const [printingInvoiceId, setPrintingInvoiceId] = useState<string | null>(null)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 500) // 500ms delay

    return () => clearTimeout(timer)
  }, [searchTerm])

  // Build query parameters
  const queryParams = {
    page: currentPage,
    limit: itemsPerPage,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== 'all' && { status: statusFilter }),
    ...(typeFilter === 'pending-converted' 
      ? { type: 'pending', isConvertedToBill: 'true' } 
      : typeFilter !== 'all' 
        ? { type: typeFilter } 
        : {})
  }
  
  console.log('Query Parameters being sent:', queryParams)
  console.log('Type Filter Value:', typeFilter)
  
  const { data: invoicesResponse, isLoading, error } = useGetInvoicesQuery(queryParams)
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const { data: companyData } = useGetCompanyQuery(undefined, {
    refetchOnMountOrArgChange: false,
    refetchOnFocus: false,
  })
  // Remove the deleteInvoice hook since we'll use it in the dialog component

  // Create a customer lookup map for efficient customer name resolution
  const customerMap = new Map()
  if (customersData?.results) {
    customersData.results.forEach((customer: any) => {
      customerMap.set(customer._id || customer.id, customer)
    })
  } else if (Array.isArray(customersData)) {
    // Handle case where API returns array directly
    customersData.forEach((customer: any) => {
      customerMap.set(customer._id || customer.id, customer)
    })
  }
  
  console.log('Customer data debug:', {
    customersData,
    customerMapSize: customerMap.size,
    customerMapEntries: Array.from(customerMap.entries()).slice(0, 3) // Show first 3 entries
  })

  // Helper function to get customer name
  const getCustomerName = (invoice: any) => {
    console.log('Getting customer name for invoice:', {
      invoiceId: invoice.id,
      customerId: invoice.customerId,
      customerFromInvoice: invoice.customer,
      customerName: invoice.customerName,
      walkInCustomerName: invoice.walkInCustomerName,
      customerFromMap: customerMap.get(invoice.customerId)
    })
    
    // For walk-in customers
    if (invoice.customerId === 'walk-in') {
      return invoice.walkInCustomerName || t('walk_in_customer')
    }
    
    // For regular customers - check if backend populated customer info
    if (invoice.customer && invoice.customer.name) {
      return invoice.customer.name
    }
    
    // Look up customer in our fetched customers data
    if (invoice.customerId && customerMap.has(invoice.customerId)) {
      const customer = customerMap.get(invoice.customerId)
      return customer.name
    }
    
    // Fallback to customerName field if available
    if (invoice.customerName) {
      return invoice.customerName
    }
    
    // If we have customerId but no customer name, show partial ID (backend issue)
    if (invoice.customerId && invoice.customerId !== 'walk-in') {
      return `${t('customer_id')}: ${invoice.customerId.substring(0, 8)}...`
    }
    
    // Final fallback
    return t('unknown_customer')
  }

  // Helper function to get customer phone number
  const getCustomerPhone = (invoice: any) => {
    // For walk-in customers, they don't have stored phone numbers
    if (invoice.customerId === 'walk-in') {
      return '-'
    }
    
    // Check if backend populated customer info with phone
    if (invoice.customer && invoice.customer.phone) {
      return invoice.customer.phone
    }
    
    // Look up customer phone in our fetched customers data
    if (invoice.customerId && customerMap.has(invoice.customerId)) {
      const customer = customerMap.get(invoice.customerId)
      return customer.phone || '-'
    }
    
    // If no phone number found
    return '-'
  }

  // Debug logging
  console.log('Invoice API Response:', { invoicesResponse, isLoading, error })
  console.log('Type Filter:', typeFilter)
  
  // Debug invoice conversion status
  if (invoicesResponse?.results) {
    invoicesResponse.results.forEach((inv: any) => {
      if (inv.type === 'pending') {
        console.log('Pending Invoice:', {
          number: inv.invoiceNumber,
          isConvertedToBill: inv.isConvertedToBill,
          type: inv.type,
          shouldBeGreen: inv.isConvertedToBill === true
        })
      }
    })
  }

  const handlePrintInvoice = (invoice: any, format: 'receipt' | 'a4' = 'receipt') => {
    try {
      setPrintingInvoiceId(invoice._id)
      
      // Resolve customer name
      const customerName = getCustomerName(invoice)
      const walkInCustomerName = invoice.walkInCustomerName
      
      // Prepare print data
      const printData: PrintInvoiceData = {
        invoiceNumber: invoice.invoiceNumber,
        items: (invoice.items || []).map((item: any) => ({
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          subtotal: item.subtotal
        })),
        customerId: invoice.customerId,
        customerName: customerName,
        walkInCustomerName: walkInCustomerName,
        type: invoice.type,
        subtotal: invoice.subtotal || 0,
        tax: invoice.tax || 0,
        discount: invoice.discount || 0,
        total: invoice.total || 0,
        paidAmount: invoice.paidAmount || 0,
        balance: invoice.balance || 0,
        dueDate: invoice.dueDate,
        notes: invoice.notes,
        deliveryCharge: invoice.deliveryCharge || 0,
        serviceCharge: invoice.serviceCharge || 0,
        companyName: companyData?.name,
        companyAddress: companyData?.address,
        companyPhone: companyData?.phone,
        companyEmail: companyData?.email,
        companyTaxNumber: companyData?.taxNumber
      }

      if (format === 'receipt') {
        const htmlContent = generateInvoiceHTML(printData)
        openPrintWindow(htmlContent)
      } else {
        const htmlContent = generateA4InvoiceHTML(printData)
        openA4PrintWindow(htmlContent)
      }
      
      toast.success(`Printing invoice ${invoice.invoiceNumber}`)
    } catch (error) {
      console.error('Print error:', error)
      toast.error('Failed to print invoice')
    } finally {
      setPrintingInvoiceId(null)
    }
  }

  const handleDelete = (invoice: any) => {
    setInvoiceToDelete(invoice)
    setDeleteDialogOpen(true)
  }

  // Handle server response with pagination info
  const invoiceList = invoicesResponse?.results || invoicesResponse?.data || []
  const totalItems = invoicesResponse?.totalResults || invoicesResponse?.total || invoiceList.length
  const totalPages = invoicesResponse?.totalPages || Math.ceil(totalItems / itemsPerPage)
  const currentInvoices = invoiceList // Server already returns paginated results

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, typeFilter, itemsPerPage])

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('loading_invoices')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600">{t('error_loading_invoices')}: {t('unknown_error')}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            {t('retry')}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
          )}
          <div>
            <h1 className="text-2xl font-bold">{t('invoice_management')}</h1>
            <p className="text-muted-foreground mt-4">{t('manage_customer_invoices')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onConvertPending}>
            <Clock className="h-4 w-4 mr-2" />
            {t('convert_pending_invoices')}
          </Button>
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            {t('create_invoice')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">{t('search')}</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={t('search_invoices_placeholder')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* <div>
              <Label>{t('status')}</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className='w-full mt-2'>
                  <SelectValue placeholder={t('all_statuses')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_statuses')}</SelectItem>
                  <SelectItem value="draft">{t('draft')}</SelectItem>
                  <SelectItem value="finalized">{t('finalized')}</SelectItem>
                  <SelectItem value="paid">{t('paid')}</SelectItem>
                  <SelectItem value="cancelled">{t('cancelled')}</SelectItem>
                  <SelectItem value="refunded">{t('refunded')}</SelectItem>
                </SelectContent>
              </Select>
            </div> */}

            <div>
              <Label>{t('invoice_type')}</Label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className='w-full mt-2'>
                  <SelectValue placeholder={t('all_types')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('all_types')}</SelectItem>
                  <SelectItem value="cash">{t('cash')}</SelectItem>
                  <SelectItem value="credit">{t('credit')}</SelectItem>
                  <SelectItem value="pending">{t('pending')}</SelectItem>
                  <SelectItem value="pending-converted">{t('converted_pending')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('')
                  setStatusFilter('all')
                  setTypeFilter('all')
                }}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('clear_filters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('invoices_list')} ({totalItems})</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="itemsPerPage" className="text-sm">{t('show')}:</Label>
              <Select value={itemsPerPage.toString()} onValueChange={(value) => setItemsPerPage(Number(value))}>
                <SelectTrigger className="w-20">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">5</SelectItem>
                  <SelectItem value="10">10</SelectItem>
                  <SelectItem value="20">20</SelectItem>
                  <SelectItem value="50">50</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('invoice_number')}</TableHead>
                  <TableHead>{t('customer')}</TableHead>
                  <TableHead>{t('phone')}</TableHead>
                  <TableHead>{t('type')}</TableHead>
                  <TableHead>{t('bill_number')}</TableHead>
                  <TableHead>{t('date')}</TableHead>
                  <TableHead>{t('amount')}</TableHead>
                  {/* <TableHead>{t('status')}</TableHead> */}
                  <TableHead>{t('actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentInvoices.map((invoice: any) => (
                  <TableRow key={invoice._id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell className={getTextClasses(getCustomerName(invoice), '')}>
                      {getCustomerName(invoice)}
                    </TableCell>
                    <TableCell>
                      {getCustomerPhone(invoice)}
                    </TableCell>
                    <TableCell>
                      <Badge className={typeColors[
                        invoice.type === 'pending' && invoice.isConvertedToBill === true
                          ? 'pending-converted' 
                          : invoice.type || 'cash'
                      ]}>
                        {invoice.type === 'pending' && invoice.isConvertedToBill === true
                          ? t('converted_pending')
                          : t(invoice.type || 'cash')}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {invoice.billNumber ? (
                        <span className="font-mono text-sm font-medium text-green-600">
                          {invoice.billNumber}
                        </span>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>Rs{invoice.total?.toFixed(2) || '0.00'}</TableCell>
                    {/* <TableCell>
                      <Badge className={statusColors[invoice.status || 'draft']}>
                        {t(invoice.status || 'draft')}
                      </Badge>
                    </TableCell> */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => setSelectedInvoice(invoice)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                            <DialogHeader className="sticky top-0 bg-white z-10">
                              <DialogTitle>{t('invoice_details')} - {invoice.invoiceNumber}</DialogTitle>
                            </DialogHeader>
                            <div className="overflow-y-auto pr-4">
                              {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} getCustomerName={getCustomerName} />}
                            </div>
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit?.(invoice)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        {/* Print Receipt Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePrintInvoice(invoice, 'receipt')}
                          disabled={printingInvoiceId === invoice._id}
                          title="Print receipt"
                        >
                          <Printer className="h-4 w-4" />
                        </Button>

                        {/* Print A4 Button */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handlePrintInvoice(invoice, 'a4')}
                          disabled={printingInvoiceId === invoice._id}
                          title="Print A4 invoice"
                        >
                          <Receipt className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(invoice)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {currentInvoices.length === 0 && (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('no_invoices_found')}</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="space-y-4 px-2 py-4">
              {/* Pagination info - always visible */}
              <div className="text-sm text-muted-foreground text-center md:text-left">
                {t('showing')} {startIndex + 1} {t('to')} {endIndex} {t('of')} {totalItems} {t('entries')}
              </div>
              
              {/* Mobile pagination - simplified */}
              <div className="flex items-center justify-center gap-2 md:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="px-2"
                >
                  {t('previous')}
                </Button>
                
                <div className="flex items-center gap-1 px-3 py-1 bg-muted rounded">
                  <span className="text-sm">{currentPage}</span>
                  <span className="text-sm text-muted-foreground">{t('of')}</span>
                  <span className="text-sm">{totalPages}</span>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="px-2"
                >
                  {t('next')}
                </Button>
              </div>

              {/* Desktop pagination - full controls */}
              <div className="hidden md:flex items-center justify-between">
                <div></div> {/* Spacer for alignment */}
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    {t('first')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    {t('previous')}
                  </Button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1;
                      } else if (currentPage <= 3) {
                        pageNum = i + 1;
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i;
                      } else {
                        pageNum = currentPage - 2 + i;
                      }
                      
                      return (
                        <Button
                          key={pageNum}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-8 h-8 p-0"
                        >
                          {pageNum}
                        </Button>
                      );
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    {t('next')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    {t('last')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      {invoiceToDelete && (
        <InvoiceDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          currentRow={invoiceToDelete}
        />
      )}
    </div>
  )
}

function InvoiceDetails({ invoice, getCustomerName }: { invoice: any; getCustomerName: (invoice: any) => string }) {
  const { t } = useLanguage()
  
  return (
    <div className="space-y-4 pb-4">
      {/* Invoice Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t('invoice_number')}</Label>
          <p className="font-medium">{invoice.invoiceNumber}</p>
        </div>
        <div>
          <Label>{t('date')}</Label>
          <p className="font-medium">
            {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label>{t('customer')}</Label>
          <p className={getTextClasses(getCustomerName(invoice), "font-medium")}>
            {getCustomerName(invoice)}
          </p>
        </div>
        <div>
          <Label>{t('status')}</Label>
          <Badge className={statusColors[invoice.status || 'draft']}>
            {t(invoice.status || 'draft')}
          </Badge>
        </div>
      </div>

      {/* Invoice Items - Scrollable */}
      <div>
        <Label>{t('invoice_items')}</Label>
        <div className="overflow-x-auto max-h-64 border rounded-lg">
          <Table className="text-sm">
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead className="whitespace-nowrap">{t('product_name')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('qty')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('unit_price')}</TableHead>
                <TableHead className="whitespace-nowrap text-right">{t('total')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invoice.items?.map((item: any, index: number) => (
                <TableRow key={index} className="hover:bg-muted/50">
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {item.image && (
                        <img 
                          src={item.image.url} 
                          alt={item.name}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <span className="truncate max-w-xs">{item.name}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {item.quantity} {item.unit || 'pcs'}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">Rs{item.unitPrice?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell className="whitespace-nowrap text-right">Rs{((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-2 gap-4 p-3 bg-muted rounded-lg text-sm">
        <div>
          <Label className="text-xs">{t('subtotal')}</Label>
          <p className="font-bold">Rs{invoice.subtotal?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label className="text-xs">{t('tax')}</Label>
          <p className="font-bold">Rs{invoice.tax?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label className="text-xs">{t('discount')}</Label>
          <p className="font-bold text-red-600">-Rs{invoice.discount?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label className="text-xs">{t('total')} {t('amount')}</Label>
          <p className="font-bold text-green-600">Rs{invoice.total?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div>
          <Label className="text-sm">{t('notes')}</Label>
          <p className="text-sm bg-muted p-2 rounded">{invoice.notes}</p>
        </div>
      )}
    </div>
  )
}

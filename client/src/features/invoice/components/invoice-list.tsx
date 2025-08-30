import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
  Download,
  Receipt,
} from 'lucide-react'
import { useGetInvoicesQuery, useDeleteInvoiceMutation } from '@/stores/invoice.api'
import { useGetAllCustomersQuery } from '../../../stores/customer.api'

interface InvoiceListProps {
  onBack?: () => void
  onCreateNew?: () => void
  onEdit?: (invoice: any) => void
}

const statusColors: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-800',
  draft: 'bg-blue-100 text-blue-800',
  finalized: 'bg-purple-100 text-purple-800',
}

export function InvoiceList({ onBack, onCreateNew, onEdit }: InvoiceListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 500) // 500ms delay

    return () => clearTimeout(timer)
  }, [searchTerm])

  const { data: invoicesResponse, isLoading, error } = useGetInvoicesQuery({
    page: currentPage,
    limit: itemsPerPage,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== 'all' && { status: statusFilter })
  })
  const { data: customersData } = useGetAllCustomersQuery(undefined)
  const [deleteInvoice] = useDeleteInvoiceMutation()

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
      return invoice.walkInCustomerName || 'Walk-in Customer'
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
      return `Customer ID: ${invoice.customerId.substring(0, 8)}...`
    }
    
    // Final fallback
    return 'Unknown Customer'
  }

  // Debug logging
  console.log('Invoice API Response:', { invoicesResponse, isLoading, error })

  const handleDelete = async (invoiceId: string) => {
    if (window.confirm('Are you sure you want to delete this invoice?')) {
      try {
        await deleteInvoice(invoiceId).unwrap()
      } catch (error) {
        console.error('Failed to delete invoice:', error)
      }
    }
  }

  // Handle server response with pagination info
  const invoiceList = invoicesResponse?.results || invoicesResponse?.data || []
  const totalItems = invoicesResponse?.totalResults || invoicesResponse?.total || invoiceList.length
  const totalPages = invoicesResponse?.totalPages || Math.ceil(totalItems / itemsPerPage)
  const currentInvoices = invoiceList // Server already returns paginated results

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, statusFilter, itemsPerPage])

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading invoices...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600">Error loading invoices: {'Unknown error'}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            Retry
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
            <h1 className="text-2xl font-bold">Invoice Management</h1>
            <p className="text-muted-foreground">Manage customer invoices and payments</p>
          </div>
        </div>
        <Button onClick={onCreateNew}>
          <Plus className="h-4 w-4 mr-2" />
          Create Invoice
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Invoice #, Customer..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div>
              <Label>Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className='w-full'>
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="paid">Paid</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="overdue">Overdue</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="finalized">Finalized</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('')
                  setStatusFilter('all')
                }}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Invoices Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Invoices List ({totalItems})</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="itemsPerPage" className="text-sm">Show:</Label>
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
                  <TableHead>Invoice #</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentInvoices.map((invoice: any) => (
                  <TableRow key={invoice._id}>
                    <TableCell className="font-medium">
                      {invoice.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      {getCustomerName(invoice)}
                    </TableCell>
                    <TableCell>
                      {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>${invoice.total?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>
                      <Badge className={statusColors[invoice.status || 'pending']}>
                        {(invoice.status || 'pending').toUpperCase()}
                      </Badge>
                    </TableCell>
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
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>Invoice Details - {invoice.invoiceNumber}</DialogTitle>
                            </DialogHeader>
                            {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} getCustomerName={getCustomerName} />}
                          </DialogContent>
                        </Dialog>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onEdit?.(invoice)}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            // TODO: Implement print/download functionality
                            console.log('Download invoice:', invoice.invoiceNumber)
                          }}
                        >
                          <Download className="h-4 w-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(invoice._id)}
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
              <p className="text-muted-foreground">No invoices found</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2 py-4">
              <div className="text-sm text-muted-foreground">
                Showing {startIndex + 1} to {endIndex} of {totalItems} entries
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1}
                >
                  First
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  Previous
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
                  Next
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages}
                >
                  Last
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function InvoiceDetails({ invoice, getCustomerName }: { invoice: any; getCustomerName: (invoice: any) => string }) {
  return (
    <div className="space-y-6">
      {/* Invoice Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>Invoice Number</Label>
          <p className="font-medium">{invoice.invoiceNumber}</p>
        </div>
        <div>
          <Label>Date</Label>
          <p className="font-medium">
            {format(new Date(invoice.invoiceDate || invoice.createdAt), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label>Customer</Label>
          <p className="font-medium">
            {getCustomerName(invoice)}
          </p>
        </div>
        <div>
          <Label>Status</Label>
          <Badge className={statusColors[invoice.status || 'pending']}>
            {(invoice.status || 'pending').toUpperCase()}
          </Badge>
        </div>
      </div>

      {/* Invoice Items */}
      <div>
        <Label>Invoice Items</Label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Quantity</TableHead>
              <TableHead>Unit Price</TableHead>
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoice.items?.map((item: any, index: number) => (
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
                    {item.name}
                  </div>
                </TableCell>
                <TableCell>{item.quantity}</TableCell>
                <TableCell>${item.unitPrice?.toFixed(2) || '0.00'}</TableCell>
                <TableCell>${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Invoice Summary */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
        <div>
          <Label>Subtotal</Label>
          <p className="text-lg font-bold">${invoice.subtotal?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label>Tax</Label>
          <p className="text-lg font-bold">${invoice.tax?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label>Discount</Label>
          <p className="text-lg font-bold text-red-600">-${invoice.discount?.toFixed(2) || '0.00'}</p>
        </div>
        <div>
          <Label>Total Amount</Label>
          <p className="text-lg font-bold text-green-600">${invoice.total?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div>
          <Label>Notes</Label>
          <p className="text-sm">{invoice.notes}</p>
        </div>
      )}
    </div>
  )
}

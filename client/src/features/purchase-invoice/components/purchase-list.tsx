import { useState, useEffect } from 'react'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { ArrowLeft, Eye, Edit, Trash2, Plus, Search, Filter, Receipt } from 'lucide-react'
import { useGetPurchasesQuery } from '@/stores/purchase.api'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'
import { format } from 'date-fns'

interface PurchaseListProps {
  onBack?: () => void
  onCreateNew?: () => void
  onEdit?: (purchase: any) => void
}

export default function PurchaseList({ onBack, onCreateNew, onEdit }: PurchaseListProps) {
  const { t } = useLanguage()
  const [searchTerm, setSearchTerm] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [itemsPerPage, setItemsPerPage] = useState(10)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [purchaseToDelete, setPurchaseToDelete] = useState<any>(null)

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm)
    }, 500)
    return () => clearTimeout(timer)
  }, [searchTerm])

  // Build query parameters
  const queryParams = {
    page: currentPage,
    limit: itemsPerPage,
    ...(debouncedSearch && { search: debouncedSearch }),
  }

  const { data: purchasesResponse, isLoading, error } = useGetPurchasesQuery(queryParams)

  const handleDelete = (purchase: any) => {
    setPurchaseToDelete(purchase)
    setDeleteDialogOpen(true)
  }

  // Handle server response with pagination info
  const purchaseList = purchasesResponse?.results || purchasesResponse?.data || []
  const totalItems = purchasesResponse?.totalResults || purchasesResponse?.total || purchaseList.length
  const totalPages = purchasesResponse?.totalPages || Math.ceil(totalItems / itemsPerPage)
  const currentPurchases = purchaseList // Server already returns paginated results

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, itemsPerPage])

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">{t('Loading purchases...')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-600">{t('Error loading purchases')}: {t('Unknown error')}</p>
          <Button onClick={() => window.location.reload()} className="mt-4">
            {t('Retry')}
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
            <h1 className="text-2xl font-bold">{t('Purchase Management')}</h1>
            <p className="text-muted-foreground mt-4">{t('Manage supplier purchases')}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button onClick={onCreateNew}>
            <Plus className="h-4 w-4 mr-2" />
            {t('Create Purchase')}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <Label htmlFor="search">{t('Search')}</Label>
              <div className="relative mt-2">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={t('Search by invoice number...')}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex items-end">
              <Button
                variant="outline"
                onClick={() => {
                  setSearchTerm('')
                }}
                className="w-full"
              >
                <Filter className="h-4 w-4 mr-2" />
                {t('Clear Filters')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Purchases Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Purchases List')} ({totalItems})</CardTitle>
            <div className="flex items-center gap-2">
              <Label htmlFor="itemsPerPage" className="text-sm">{t('Show')}:</Label>
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
                  <TableHead>{t('Invoice Number')}</TableHead>
                  <TableHead>{t('Supplier')}</TableHead>
                  {/* <TableHead>{t('Phone')}</TableHead> */}
                  <TableHead>{t('Items')}</TableHead>
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Amount')}</TableHead>
                  {/* <TableHead>{t('Status')}</TableHead> */}
                  <TableHead>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentPurchases.map((purchase: any) => (
                  <TableRow key={purchase._id || purchase.id}>
                    <TableCell className="font-medium">
                      {purchase.invoiceNumber}
                    </TableCell>
                    <TableCell>
                      {purchase.supplier?.name || 'N/A'}
                    </TableCell>
                    {/* <TableCell>
                      {purchase.supplier?.phone || '-'}
                    </TableCell> */}
                    <TableCell>
                      <Badge variant="outline">
                        {purchase.items?.length || 0} items
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {format(new Date(purchase.purchaseDate || purchase.createdAt), 'MMM dd, yyyy')}
                    </TableCell>
                    <TableCell>Rs{purchase.totalAmount?.toFixed(2) || '0.00'}</TableCell>
                    {/* <TableCell>
                      <Badge variant={purchase.status ? 'default' : 'secondary'}>
                        {purchase.status ? t('Completed') : t('Pending')}
                      </Badge>
                    </TableCell> */}
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setSelectedPurchase(purchase)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-4xl">
                            <DialogHeader>
                              <DialogTitle>{t('Purchase Details')} - {purchase.invoiceNumber}</DialogTitle>
                              <DialogDescription>
                                {t('View detailed information about this purchase invoice including items, supplier details, and total amount.')}
                              </DialogDescription>
                            </DialogHeader>
                            {selectedPurchase && <PurchaseDetails purchase={selectedPurchase} />}
                          </DialogContent>
                        </Dialog>

                        {onEdit && (
                          <Button variant="ghost" size="sm" onClick={() => onEdit(purchase)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(purchase)}
                          className="text-destructive hover:text-destructive"
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

          {currentPurchases.length === 0 && (
            <div className="text-center py-8">
              <Receipt className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">{t('No purchases found')}</p>
            </div>
          )}

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="space-y-4 px-2 py-4">
              {/* Pagination info - always visible */}
              <div className="text-sm text-muted-foreground text-center md:text-left">
                {t('Showing')} {startIndex + 1} {t('to')} {endIndex} {t('of')} {totalItems} {t('entries')}
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
                  {t('Previous')}
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
                  {t('Next')}
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
                    {t('First')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    {t('Previous')}
                  </Button>
                  
                  {/* Page numbers */}
                  <div className="flex items-center gap-1">
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum;
                      if (totalPages <= 5) {
                        pageNum = i + 1
                      } else if (currentPage <= 3) {
                        pageNum = i + 1
                      } else if (currentPage >= totalPages - 2) {
                        pageNum = totalPages - 4 + i
                      } else {
                        pageNum = currentPage - 2 + i
                      }

                      return (
                        <Button
                          key={i}
                          variant={currentPage === pageNum ? "default" : "outline"}
                          size="sm"
                          onClick={() => setCurrentPage(pageNum)}
                          className="w-10"
                        >
                          {pageNum}
                        </Button>
                      )
                    })}
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    {t('Next')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    {t('Last')}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Delete Dialog */}
      {purchaseToDelete && (
        <InvoiceDeleteDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          currentRow={{
            ...purchaseToDelete,
            invoiceNumber: purchaseToDelete.invoiceNumber,
          }}
        />
      )}
    </div>
  )
}

function PurchaseDetails({ purchase }: { purchase: any }) {
  const { t } = useLanguage()
  
  // Debug log to see the actual data structure
  console.log('Purchase data:', purchase)
  console.log('Purchase items:', purchase.items)
  if (purchase.items && purchase.items.length > 0) {
    console.log('First item structure:', purchase.items[0])
  }
  
  return (
    <div className="space-y-6">
      {/* Purchase Info */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label>{t('Invoice Number')}</Label>
          <p className="font-medium">{purchase.invoiceNumber}</p>
        </div>
        <div>
          <Label>{t('Purchase Date')}</Label>
          <p className="font-medium">
            {format(new Date(purchase.purchaseDate || purchase.createdAt), 'MMM dd, yyyy HH:mm')}
          </p>
        </div>
        <div>
          <Label>{t('Supplier')}</Label>
          <p className="font-medium">{purchase.supplier?.name || 'N/A'}</p>
        </div>
        <div>
          <Label>{t('Status')}</Label>
          <Badge variant={purchase.status ? 'default' : 'secondary'}>
            {purchase.status ? t('Completed') : t('Pending')}
          </Badge>
        </div>
      </div>

      {/* Purchase Items */}
      <div>
        <Label>{t('Purchase Items')}</Label>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('Product')}</TableHead>
              <TableHead>{t('Quantity')}</TableHead>
              <TableHead>{t('Unit Price')}</TableHead>
              <TableHead>{t('Total')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {purchase.items?.map((item: any, index: number) => {
              // Debug each item
              console.log(`Item ${index}:`, item)
              console.log(`Item ${index} product:`, item.product)
              console.log(`Item ${index} product type:`, typeof item.product)
              
              // Extract product name with multiple fallbacks
              let productName = 'Unknown Product'
              
              if (typeof item.product === 'string') {
                // If product is just an ID string, try to use other fields
                productName = item.productName || item.name || `Product ID: ${item.product.substring(0, 8)}...`
              } else if (item.product && typeof item.product === 'object') {
                // If product is an object, try to get name from it
                productName = item.product.name || item.product.title || item.product.productName || 'Product Object Found'
              } else {
                // Try direct fields on item
                productName = item.name || item.productName || item.title || 'Unknown Product'
              }
              
              return (
                <TableRow key={index}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {(item.product?.image || item.image) && (
                        <img 
                          src={(item.product?.image?.url || item.image?.url || item.product?.image || item.image)} 
                          alt={productName}
                          className="w-8 h-8 rounded object-cover"
                        />
                      )}
                      <div>
                        <div className="font-medium">
                          {productName}
                        </div>
                        {(item.product?.barcode || item.barcode) && (
                          <div className="text-xs text-muted-foreground">
                            {item.product?.barcode || item.barcode}
                          </div>
                        )}
                        {/* Show product ID for debugging */}
                        <div className="text-xs text-muted-foreground">
                          ID: {typeof item.product === 'string' ? item.product : item.product?.id || item.product?._id || 'No ID'}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>{item.quantity}</TableCell>
                  <TableCell>Rs{item.priceAtPurchase?.toFixed(2) || '0.00'}</TableCell>
                  <TableCell>Rs{item.total?.toFixed(2) || '0.00'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Purchase Summary */}
      <div className="grid grid-cols-2 gap-4 p-4 bg-muted rounded-lg">
        <div>
          <Label>{t('Total Items')}</Label>
          <p className="text-lg font-bold">{purchase.items?.length || 0}</p>
        </div>
        <div>
          <Label>{t('Total Amount')}</Label>
          <p className="text-lg font-bold text-green-600">Rs{purchase.totalAmount?.toFixed(2) || '0.00'}</p>
        </div>
      </div>

      {/* Notes */}
      {purchase.notes && (
        <div>
          <Label>{t('Notes')}</Label>
          <p className="text-sm">{purchase.notes}</p>
        </div>
      )}
    </div>
  )
}

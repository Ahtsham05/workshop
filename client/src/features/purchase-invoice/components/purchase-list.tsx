import { useState, useEffect } from 'react'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ArrowLeft, Eye, Edit, Trash2, Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { useGetPurchasesQuery } from '@/stores/purchase.api'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'

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
  const [itemsPerPage] = useState(10)
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
    sortBy: 'createdAt:desc',
    ...(debouncedSearch && {
      search: debouncedSearch,
      fieldName: 'invoiceNumber',
    }),
  }

  const { data: purchasesResponse, isLoading, error } = useGetPurchasesQuery(queryParams)

  const handleDelete = (purchase: any) => {
    setPurchaseToDelete(purchase)
    setDeleteDialogOpen(true)
  }

  // Handle server response with pagination info
  const purchaseList = purchasesResponse?.results || []
  const totalItems = purchasesResponse?.totalResults || purchasesResponse?.total || 0
  const totalPages = purchasesResponse?.totalPages || Math.ceil(totalItems / itemsPerPage)

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [debouncedSearch, itemsPerPage])

  // Calculate display indices for pagination info
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = Math.min(startIndex + itemsPerPage, totalItems)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">{t('Loading purchases...')}</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center text-destructive">
          <p>{t('Error loading purchases')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col p-4">
      <Card className="flex-1 flex flex-col">
        <CardHeader>
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <CardTitle className="flex items-center gap-2">
              {onBack && (
                <Button variant="ghost" size="icon" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              {t('Purchase Invoices')}
              <Badge variant="secondary">{totalItems}</Badge>
            </CardTitle>
            {onCreateNew && (
              <Button onClick={onCreateNew}>
                <Plus className="mr-2 h-4 w-4" />
                {t('New Purchase')}
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 flex flex-col space-y-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="text"
              placeholder={t('Search by invoice number...')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Purchase List */}
          {purchaseList.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-center text-muted-foreground">
              <div>
                <p className="text-lg font-medium">{t('No purchases found')}</p>
                <p className="text-sm mt-2">{t('Create your first purchase invoice')}</p>
              </div>
            </div>
          ) : (
            <>
              <div className="flex-1 overflow-auto space-y-2">
                {purchaseList.map((purchase: any) => (
                  <Card key={purchase._id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-medium">{purchase.invoiceNumber}</span>
                            <Badge variant="outline" className="text-xs">
                              {new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString()}
                            </Badge>
                          </div>
                          <div className="text-sm text-muted-foreground space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Supplier:</span>
                              <span>{purchase.supplier?.name || 'N/A'}</span>
                            </div>
                            {purchase.supplier?.phone && (
                              <div className="text-xs">{purchase.supplier.phone}</div>
                            )}
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Items:</span>
                              <span>{purchase.items?.length || 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">Total:</span>
                              <span className="font-bold text-foreground">
                                {purchase.totalAmount?.toLocaleString() || '0'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedPurchase(purchase)}
                          >
                            <Eye className="h-4 w-4 mr-2" />
                            {t('View')}
                          </Button>
                          {onEdit && (
                            <Button variant="ghost" size="sm" onClick={() => onEdit(purchase)}>
                              <Edit className="h-4 w-4 mr-2" />
                              {t('Edit')}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(purchase)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            {t('Delete')}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    {t('Showing')} {startIndex + 1} {t('to')} {endIndex} {t('of')} {totalItems}{' '}
                    {t('purchases')}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="flex items-center gap-2 px-3">
                      <span className="text-sm">
                        {currentPage} / {totalPages}
                      </span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Purchase Details Dialog */}
      {selectedPurchase && (
        <PurchaseDetails
          purchase={selectedPurchase}
          onClose={() => setSelectedPurchase(null)}
        />
      )}

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

function PurchaseDetails({ purchase, onClose }: { purchase: any; onClose: () => void }) {
  const { t } = useLanguage()

  return (
    <div className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-auto">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('Purchase Details')}</CardTitle>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm text-muted-foreground">{t('Invoice Number')}</div>
            <div className="font-medium">{purchase.invoiceNumber}</div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('Supplier')}</div>
            <div className="font-medium">{purchase.supplier?.name || 'N/A'}</div>
            {purchase.supplier?.phone && (
              <div className="text-sm text-muted-foreground">{purchase.supplier.phone}</div>
            )}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{t('Date')}</div>
            <div className="font-medium">
              {new Date(purchase.purchaseDate || purchase.createdAt).toLocaleDateString()}
            </div>
          </div>
          <div>
            <div className="text-sm text-muted-foreground mb-2">{t('Items')}</div>
            <div className="space-y-2">
              {purchase.items?.map((item: any, index: number) => (
                <Card key={index}>
                  <CardContent className="p-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{item.product?.name || 'Unknown'}</div>
                        <div className="text-sm text-muted-foreground">
                          {item.quantity} × {item.priceAtPurchase?.toFixed(2) || '0.00'}
                        </div>
                      </div>
                      <div className="font-semibold">{item.total?.toFixed(2) || '0.00'}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
          {purchase.notes && (
            <div>
              <div className="text-sm text-muted-foreground">{t('Notes')}</div>
              <div className="text-sm">{purchase.notes}</div>
            </div>
          )}
          <div className="border-t pt-4">
            <div className="flex justify-between items-center text-lg font-bold">
              <span>{t('Total Amount')}</span>
              <span>{purchase.totalAmount?.toFixed(2) || '0.00'}</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

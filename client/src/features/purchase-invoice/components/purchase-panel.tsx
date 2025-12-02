import { useCallback, useState, useEffect } from 'react'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
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
import { Trash2, Package, Printer, Save, ArrowLeft, Search, ChevronDown, Check, Minus, Plus, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useCreatePurchaseMutation, useUpdatePurchaseMutation } from '@/stores/purchase.api'
import { toast } from 'sonner'
import type { Purchase, PurchaseItem, Supplier } from '../index'

interface PurchasePanelProps {
  purchase: Purchase
  setPurchase: React.Dispatch<React.SetStateAction<Purchase>>
  updateQuantity: (productId: string, newQuantity: number) => void
  removeFromPurchase: (productId: string) => void
  updatePurchasePrice: (productId: string, price: number) => void
  calculateTotals: () => { subtotal: number; total: number }
  onBackToList?: () => void
  onSaveSuccess?: () => void
  isEditing?: boolean
  editingPurchase?: any
}

export default function PurchasePanel({
  purchase,
  setPurchase,
  updateQuantity,
  removeFromPurchase,
  updatePurchasePrice,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingPurchase,
}: PurchasePanelProps) {
  const { t } = useLanguage()
  const [savingType, setSavingType] = useState<'none' | 'receipt' | 'a4' | null>(null)
  const [supplierSelectOpen, setSupplierSelectOpen] = useState(false)

  // Redux state
  const suppliersData = useSelector((state: RootState) => state.supplier.data)
  const suppliers: Supplier[] = suppliersData?.results || []

  // RTK Query mutations
  const [createPurchase] = useCreatePurchaseMutation()
  const [updatePurchase] = useUpdatePurchaseMutation()

  // Initialize form when editing
  useEffect(() => {
    if (isEditing && editingPurchase) {
      setPurchase({
        ...editingPurchase,
        items: editingPurchase.items || [],
      })
    }
  }, [isEditing, editingPurchase, setPurchase])

  // Print functionality
  const printPurchase = useCallback(
    (purchaseData: any, printType: 'receipt' | 'a4') => {
      try {
        import('@/utils/purchasePrintUtils').then((module) => {
          const supplierName = purchase.supplier?.name || 'Unknown'
          const html =
            printType === 'receipt'
              ? module.generatePurchaseInvoiceHTML(purchaseData, supplierName, t)
              : module.generatePurchaseInvoiceA4HTML(purchaseData, supplierName, t)

          const printWindow = window.open('', '_blank')
          if (printWindow) {
            printWindow.document.write(html)
            printWindow.document.close()
            printWindow.print()
          }
        })
      } catch (error) {
        console.error('Print error:', error)
        toast.error(t('Failed to print'))
      }
    },
    [purchase.supplier, t]
  )

  // Handle save purchase
  const handleSavePurchase = useCallback(
    async (printType: 'none' | 'receipt' | 'a4' = 'none') => {
      // Validation
      if (!purchase.supplier?._id) {
        toast.error(t('Please select a supplier'))
        return
      }

      if (purchase.items.length === 0) {
        toast.error(t('Please add at least one item to the purchase'))
        return
      }

      setSavingType(printType)

      const totals = calculateTotals()

      // Map to backend format
      const purchaseData = {
        supplier: purchase.supplier._id,
        items: purchase.items.map((item) => ({
          product: item.product._id,
          quantity: item.quantity,
          priceAtPurchase: item.purchasePrice,
          total: item.quantity * item.purchasePrice,
        })),
        totalAmount: totals.total,
        purchaseDate: purchase.date || new Date().toISOString(),
        notes: purchase.notes?.trim() || undefined,
      }

      try {
        let result
        if (isEditing && editingPurchase?._id) {
          result = await updatePurchase({
            id: editingPurchase._id,
            data: purchaseData,
          }).unwrap()
          toast.success(t('Purchase updated successfully'))
        } else {
          result = await createPurchase(purchaseData).unwrap()
          toast.success(t('Purchase created successfully'))
        }

        // Print if requested
        if (printType !== 'none' && result) {
          const purchaseForPrint = {
            ...result,
            supplier: purchase.supplier,
            items: purchase.items,
          }
          printPurchase(purchaseForPrint, printType)
        }

        // Reset form and go back to list
        if (onSaveSuccess) {
          onSaveSuccess()
        }
      } catch (error: any) {
        console.error('Save error:', error)
        toast.error(error?.data?.message || t('Failed to save purchase'))
      } finally {
        setSavingType(null)
      }
    },
    [
      purchase,
      calculateTotals,
      isEditing,
      editingPurchase,
      createPurchase,
      updatePurchase,
      printPurchase,
      onSaveSuccess,
      t,
    ]
  )

  const totals = calculateTotals()
  const isLoading = savingType !== null

  return (
    <div className="space-y-4">
      {/* Supplier Selection Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {onBackToList && (
              <Button variant="ghost" size="sm" onClick={onBackToList}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            <Package className="h-5 w-5" />
            {t('Purchase Details')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Show invoice number in edit mode */}
          {isEditing && editingPurchase?.invoiceNumber && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 min-w-0">
                <Label className="font-medium text-blue-800 flex-shrink-0">Purchase Number:</Label>
                <span 
                  className="font-bold text-blue-900 truncate" 
                  title={editingPurchase.invoiceNumber}
                >
                  {editingPurchase.invoiceNumber}
                </span>
              </div>
            </div>
          )}
          
          <div>
          {/* Supplier Selection */}
            <Label className="mb-2">
              {t('Supplier')} <span className="text-red-500">*</span>
            </Label>
            <Popover open={supplierSelectOpen} onOpenChange={setSupplierSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={supplierSelectOpen}
                  className={`w-full justify-between min-h-[2.5rem] h-auto py-2 ${
                    !purchase.supplier?._id ? 'border-red-500 bg-red-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Search className="w-4 h-4 flex-shrink-0" />
                    {purchase.supplier?._id ? (
                      <Badge variant="secondary" className="flex items-center gap-1 max-w-full">
                        <div className="w-3 h-3 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-medium text-white">
                            {purchase.supplier.name?.charAt(0).toUpperCase() || 'S'}
                          </span>
                        </div>
                        <span className="text-xs truncate" title={purchase.supplier.name}>
                          {purchase.supplier.name}
                        </span>
                      </Badge>
                    ) : (
                      <span className="truncate text-red-500" title={t('Select supplier')}>
                        {t('Select supplier')} *
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput placeholder={t('Search suppliers...')} />
                  <CommandList>
                    <CommandEmpty>{t('No supplier found')}</CommandEmpty>
                    <CommandGroup>
                      {suppliers
                        .filter((supplier) => {
                          const searchInput = document.querySelector('[cmdk-input]') as HTMLInputElement
                          const searchValue = searchInput?.value?.toLowerCase() || ''
                          if (!searchValue) return true
                          return (
                            supplier.name?.toLowerCase().includes(searchValue) ||
                            supplier.phone?.toLowerCase().includes(searchValue)
                          )
                        })
                        .map((supplier) => {
                          const isSelected = purchase.supplier?._id === supplier._id
                          return (
                            <CommandItem
                              key={supplier._id}
                              value={supplier._id}
                              onSelect={(selectedValue) => {
                                console.log('Selected supplier:', supplier)
                                const selected = suppliers.find((s) => s._id === selectedValue)
                                if (selected) {
                                  setPurchase((prev) => ({
                                    ...prev,
                                    supplier: selected,
                                  }))
                                }
                                setSupplierSelectOpen(false)
                              }}
                              className={isSelected ? 'bg-accent' : ''}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${
                                  isSelected ? 'opacity-100' : 'opacity-0'
                                }`}
                              />
                              <div className="flex-1">
                                <div className="font-medium">{supplier.name}</div>
                                {supplier.phone && (
                                  <div className="text-xs text-muted-foreground">{supplier.phone}</div>
                                )}
                              </div>
                            </CommandItem>
                          )
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>

      {/* Items List Card */}
      <Card>
        <CardHeader>
          <CardTitle>{t('Purchase Items')} ({purchase.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {purchase.items.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t('No items added yet')}
              </div>
            ) : (
              purchase.items.map((item: PurchaseItem, index: number) => (
                <div key={`${item.product._id}-${index}`} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
                  {/* Product Image */}
                  {item.product.image?.url ? (
                    <img 
                      src={item.product.image.url} 
                      alt={item.product.name}
                      className="w-12 h-12 object-cover rounded"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <Package className="h-6 w-6 text-gray-400" />
                    </div>
                  )}
                  
                  {/* Product Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{item.product.name}</div>
                    {item.product.barcode && (
                      <div className="text-xs text-muted-foreground">{item.product.barcode}</div>
                    )}
                  </div>
                  
                  {/* Quantity Controls */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-center">{t('Qty')}</Label>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 w-6 p-0"
                        onClick={() => updateQuantity(item.product._id, Math.max(1, item.quantity - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(item.product._id, parseInt(e.target.value) || 1)}
                        className="h-6 w-12 text-center text-xs p-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 w-6 p-0"
                        onClick={() => updateQuantity(item.product._id, item.quantity + 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>

                  {/* Price Controls */}
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-center">{t('Price')}</Label>
                    <Input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={item.purchasePrice}
                      onChange={(e) => updatePurchasePrice(item.product._id, parseFloat(e.target.value) || 0)}
                      className="h-6 w-16 text-center text-xs p-1"
                    />
                  </div>

                  {/* Total and Actions */}
                  <div className="flex flex-col items-end gap-1">
                    <Label className="text-xs">{t('Total')}</Label>
                    <div className="font-semibold text-sm">
                      Rs{(item.quantity * item.purchasePrice).toFixed(2)}
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                      onClick={() => removeFromPurchase(item.product._id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Totals and Actions Card */}
      <Card>
        <CardContent className="p-4 space-y-4">
          {/* Notes */}
          <div>
            <Label htmlFor="notes">{t('Notes')}</Label>
            <Textarea
              id="notes"
              value={purchase.notes || ''}
              onChange={(e) =>
                setPurchase((prev) => ({
                  ...prev,
                  notes: e.target.value,
                }))
              }
              placeholder={t('Add any notes about this purchase...')}
              rows={2}
            />
          </div>

          {/* Totals Display */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <span>{t('Subtotal')}:</span>
              <span>Rs{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-bold text-lg border-t pt-2">
              <span>{t('Total')}:</span>
              <span>Rs{totals.total.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('Total Items')}:</span>
              <span>{purchase.items.length}</span>
            </div>
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>{t('Total Quantity')}:</span>
              <span>{purchase.items.reduce((sum, item) => sum + item.quantity, 0)}</span>
            </div>
          </div>

          {/* Save Buttons */}
          <div className="grid grid-cols-1 gap-3">
            {/* Save Only Button */}
            <Button 
              onClick={() => handleSavePurchase('none')}
              className="w-full"
              size="lg"
              disabled={!purchase.supplier?._id || purchase.items.length === 0 || isLoading}
              variant="outline"
            >
              {isLoading && savingType === 'none' ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('Saving...')}
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {isEditing ? t('Update Purchase') : t('Save Purchase')}
                </>
              )}
            </Button>
            
            {/* Print Buttons Row */}
            <div className="grid grid-cols-2 gap-3">
              {/* Save & Print Receipt Button */}
              <Button 
                onClick={() => handleSavePurchase('receipt')}
                className="w-full"
                size="lg"
                disabled={!purchase.supplier?._id || purchase.items.length === 0 || isLoading}
                variant="default"
              >
                {isLoading && savingType === 'receipt' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('Saving...')}
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    {t('Save & Print Receipt')}
                  </>
                )}
              </Button>
              
              {/* Save & Print A4 Button */}
              <Button 
                onClick={() => handleSavePurchase('a4')}
                className="w-full"
                size="lg"
                disabled={!purchase.supplier?._id || purchase.items.length === 0 || isLoading}
                variant="default"
              >
                {isLoading && savingType === 'a4' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('Saving...')}
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    {t('Save & Print A4')}
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

import { useCallback, useState, useEffect } from 'react'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Trash2, Package, Printer, Save, ArrowLeft, Minus, Plus, Loader2, Search, ChevronDown, Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useCreatePurchaseMutation, useUpdatePurchaseMutation } from '@/stores/purchase.api'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
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
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [supplierBalance, setSupplierBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)

  // Redux state
  const suppliersData = useSelector((state: RootState) => state.supplier.data)
  const suppliers: Supplier[] = suppliersData?.results || []

  // Filter suppliers by search query
  const filteredSuppliers = suppliers.filter(supplier => {
    if (!supplierSearchQuery) return true
    const query = supplierSearchQuery.toLowerCase()
    const name = supplier.name?.toLowerCase() || ''
    const phone = supplier.phone?.toLowerCase() || ''
    return name.includes(query) || phone.includes(query)
  })

  // RTK Query mutations
  const [createPurchase] = useCreatePurchaseMutation()
  const [updatePurchase] = useUpdatePurchaseMutation()

  // Initialize form when editing - removed because parent component already handles transformation
  // useEffect(() => {
  //   if (isEditing && editingPurchase) {
  //     setPurchase({
  //       ...editingPurchase,
  //       items: editingPurchase.items || [],
  //     })
  //   }
  // }, [isEditing, editingPurchase, setPurchase])

  // Fetch supplier balance when supplier is selected
  useEffect(() => {
    const fetchSupplierBalance = async () => {
      const supplierId = purchase.supplier?._id || (purchase.supplier as any)?.id
      if (supplierId) {
        setLoadingBalance(true)
        try {
          const url = `${summery.fetchSupplierBalance.url}/${supplierId}${summery.fetchSupplierBalance.urlSuffix || ''}`
          const response = await Axios.get(url)
          setSupplierBalance(response.data.balance || 0)
        } catch (error) {
          console.error('Failed to fetch supplier balance:', error)
          setSupplierBalance(0)
        } finally {
          setLoadingBalance(false)
        }
      } else {
        setSupplierBalance(0)
      }
    }
    
    fetchSupplierBalance()
  }, [purchase.supplier])

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
      const supplierId = purchase.supplier?._id || (purchase.supplier as any)?.id
      if (!supplierId) {
        toast.error(t('Please select a supplier'))
        return
      }

      if (purchase.items.length === 0) {
        toast.error(t('Please add at least one item to the purchase'))
        return
      }

      setSavingType(printType)

      const totals = calculateTotals()

      console.log('Saving purchase with data:', purchase)
      console.log('Supplier ID:', supplierId)
      console.log('Totals:', totals)

      // Validate and normalize paymentType
      const validPaymentTypes = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'];
      let paymentType = purchase.paymentType || 'Cash';
      if (!validPaymentTypes.includes(paymentType)) {
        console.warn(`Invalid paymentType: ${paymentType}, defaulting to 'Cash'`);
        paymentType = 'Cash';
      }

      // Map to backend format
      const purchaseData = {
        supplier: supplierId,
        items: purchase.items.map((item) => {
          // Backend uses 'id' property (transformed from _id by toJSON plugin)
          const productId = item.product.id || (item.product as any)._id;
          
          if (!productId) {
            console.error(`Product has no valid ID!`, item.product);
            toast.error(`Product "${item.product.name}" has no valid ID. Please refresh the product list and try again.`);
            throw new Error(`Product "${item.product.name}" has no valid ID`);
          }
          
          return {
            product: productId,
            quantity: item.quantity,
            priceAtPurchase: item.purchasePrice,
            total: item.quantity * item.purchasePrice,
          };
        }),
        totalAmount: totals.total,
        paidAmount: purchase.paidAmount || 0,
        balance: totals.total - (purchase.paidAmount || 0),
        paymentType: paymentType,
        purchaseDate: purchase.date || new Date().toISOString(),
        notes: purchase.notes?.trim() || undefined,
      }

      console.log('Purchase data being sent to backend:', purchaseData)

      try {
        let result
        const purchaseId = editingPurchase?._id || editingPurchase?.id
        if (isEditing && purchaseId) {
          result = await updatePurchase({
            id: purchaseId,
            data: purchaseData,
          }).unwrap()
          toast.success(t('Purchase updated successfully'))
        } else {
          result = await createPurchase(purchaseData).unwrap()
          toast.success(t('Purchase created successfully'))
        }

        // Refresh supplier balance after successful save
        const supplierId = purchase.supplier?._id || (purchase.supplier as any)?.id
        if (supplierId) {
          try {
            const url = `${summery.fetchSupplierBalance.url}/${supplierId}${summery.fetchSupplierBalance.urlSuffix || ''}`
            const response = await Axios.get(url)
            setSupplierBalance(response.data.balance || 0)
          } catch (error) {
            console.error('Failed to refresh supplier balance:', error)
          }
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
          
           <Label className="mb-2">
              {t('Supplier')} <span className="text-red-500">*</span>
            </Label>
            <Popover open={supplierSelectOpen} onOpenChange={setSupplierSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={supplierSelectOpen}
                  className={`w-full justify-between min-h-[2.5rem] h-auto py-0 ${
                    !(purchase.supplier?._id || (purchase.supplier as any)?.id) ? 'border-red-500 bg-red-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Search className="w-4 h-4 flex-shrink-0" />
                    {(purchase.supplier?._id || (purchase.supplier as any)?.id) ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
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
                      </div>
                    ) : (
                      <span className={`truncate ${
                        !(purchase.supplier?._id || (purchase.supplier as any)?.id) ? 'text-red-500' : 'text-muted-foreground'
                      }`} title={t('Select supplier')}>
                        {t('Select supplier')} {!(purchase.supplier?._id || (purchase.supplier as any)?.id) && '*'}
                      </span>
                    )}
                  </div>
                  <ChevronDown className="h-4 w-4 opacity-50 flex-shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <div className="p-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t('Search suppliers...')}
                      value={supplierSearchQuery}
                      onChange={(e) => setSupplierSearchQuery(e.target.value)}
                      className="pl-8"
                    />
                  </div>
                </div>
                <div className="max-h-[300px] overflow-y-auto">
                  {filteredSuppliers.length === 0 ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      {t('No suppliers found')}
                    </div>
                  ) : (
                    <div className="space-y-1 p-1">
                      {filteredSuppliers.map((supplier, index) => {
                        const supplierId = supplier._id || (supplier as any).id || `supplier-${index}`
                        const currentSupplierId = purchase.supplier?._id || (purchase.supplier as any)?.id
                        const isSelected = currentSupplierId === supplierId
                        return (
                          <div
                            key={supplierId}
                            onClick={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              console.log('Selecting supplier:', supplier)
                              const selectedSupplier = {
                                _id: supplier._id || (supplier as any).id,
                                name: supplier.name,
                                phone: supplier.phone,
                                email: supplier.email,
                                address: supplier.address,
                                balance: supplier.balance
                              }
                              console.log('Setting supplier to:', selectedSupplier)
                              setPurchase(prev => ({
                                ...prev,
                                supplier: selectedSupplier
                              }))
                              setTimeout(() => {
                                setSupplierSelectOpen(false)
                                setSupplierSearchQuery('')
                              }, 100)
                            }}
                            className={`flex items-center gap-3 cursor-pointer p-3 rounded-lg hover:bg-accent/50 transition-colors ${
                              isSelected ? 'bg-accent' : ''
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center flex-shrink-0">
                                <span className="text-sm font-medium text-white">
                                  {supplier.name?.charAt(0).toUpperCase() || 'S'}
                                </span>
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="truncate font-medium" title={supplier.name}>
                                  {supplier.name}
                                </span>
                                {supplier.phone && (
                                  <span className="text-xs text-muted-foreground truncate" title={supplier.phone}>
                                    {supplier.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0">
                                <Check className="w-3 h-3 text-primary" />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>

            {/* Purchase Date */}
            <div>
              <Label htmlFor="purchase-date">
                {t('Purchase Date')} <span className="text-red-500">*</span>
              </Label>
              <Input
                id="purchase-date"
                type="date"
                value={purchase.date ? new Date(purchase.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                onChange={(e) =>
                  setPurchase((prev) => ({
                    ...prev,
                    date: new Date(e.target.value).toISOString(),
                  }))
                }
                className="w-full"
              />
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
              purchase.items.map((item: PurchaseItem, index: number) => {
                const productId = item.product.id || (item.product as any)._id;
                return (
                <div key={`${productId}-${index}`} className="flex items-center gap-2 p-2 bg-muted/30 rounded-lg">
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
                        onClick={() => updateQuantity(productId, Math.max(1, item.quantity - 1))}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateQuantity(productId, parseInt(e.target.value) || 1)}
                        className="h-6 w-12 text-center text-xs p-1"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 w-6 p-0"
                        onClick={() => updateQuantity(productId, item.quantity + 1)}
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
                      value={item.purchasePrice || 0}
                      onChange={(e) => updatePurchasePrice(productId, parseFloat(e.target.value) || 0)}
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
                      onClick={() => removeFromPurchase(productId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
              })
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

            {/* Paid Amount Input */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="paid-amount" className="whitespace-nowrap">
                  {t('Paid Amount')}:
                </Label>
                <Input
                  id="paid-amount"
                  type="number"
                  min="0"
                  max={totals.total}
                  value={purchase.paidAmount || 0}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0
                    const currentTotal = calculateTotals().total
                    setPurchase((prev) => ({
                      ...prev,
                      paidAmount: value,
                      balance: currentTotal - value,
                    }))
                  }}
                  placeholder="0.00"
                  className="flex-1"
                />
              </div>
              {/* {purchase.paidAmount !== undefined && purchase.paidAmount < totals.total && (
                <div className="flex justify-between text-sm font-medium text-orange-600">
                  <span>{t('Balance Due')}:</span>
                  <span>Rs{(totals.total - (purchase.paidAmount || 0)).toFixed(2)}</span>
                </div>
              )} */}x1
            </div>

            {/* Supplier Balance After Payment - Only show in create mode */}
            {!isEditing && (purchase.supplier?._id || (purchase.supplier as any)?.id) && (
              <div className="border-t pt-3 space-y-2 bg-orange-50 dark:bg-orange-950 rounded-lg p-3 mt-2">
                <div className='flex justify-between items-center text-sm'>
                  <span className="font-medium">{t('Previous Balance')}:</span>
                  <span className={`font-bold ${supplierBalance > 0 ? 'text-red-600' : supplierBalance < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {loadingBalance ? (
                      <span className="text-xs">Loading...</span>
                    ) : (
                      `Rs${Math.abs(supplierBalance).toFixed(2)} ${supplierBalance > 0 ? '(Cr)' : supplierBalance < 0 ? '(Dr)' : ''}`
                    )}
                  </span>
                </div>
                <div className='flex justify-between items-center text-sm'>
                  <span className="font-medium">{t('Current Purchase')}:</span>
                  <span className="font-bold text-red-600">Rs{totals.total.toFixed(2)} (Cr)</span>
                </div>
                {purchase.paidAmount > 0 && (
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Paid Now')}:</span>
                    <span className="font-bold text-green-600">-Rs{purchase.paidAmount.toFixed(2)} (Dr)</span>
                  </div>
                )}
                <Separator />
                <div className='flex justify-between items-center'>
                  <span className="font-bold">{t('Net Balance')}:</span>
                  <span className={`font-bold text-lg ${(supplierBalance + totals.total - (purchase.paidAmount || 0)) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    Rs{Math.abs(supplierBalance + totals.total - (purchase.paidAmount || 0)).toFixed(2)} {(supplierBalance + totals.total - (purchase.paidAmount || 0)) > 0 ? '(Payable)' : '(Receivable)'}
                  </span>
                </div>
              </div>
            )}

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
              disabled={!(purchase.supplier?._id || (purchase.supplier as any)?.id) || purchase.items.length === 0 || isLoading}
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
                disabled={!(purchase.supplier?._id || (purchase.supplier as any)?.id) || purchase.items.length === 0 || isLoading}
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
                disabled={!(purchase.supplier?._id || (purchase.supplier as any)?.id) || purchase.items.length === 0 || isLoading}
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

import { useCallback, useState, useEffect, useRef } from 'react'
import { useLanguage } from '@/context/language-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Trash2, Package, Printer, Save, ArrowLeft, Minus, Plus, Loader2, Search, ChevronDown, Check, Sparkles, X } from 'lucide-react'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { PurchaseAiScanDialog, type PurchaseScanApplyPayload } from './purchase-ai-scan-dialog'
import { resolvePurchaseInvoiceBalance } from '@/features/purchase-invoice/utils/purchase-balance'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '@/stores/store'
import { useCreatePurchaseMutation, useUpdatePurchaseMutation, purchaseApi } from '@/stores/purchase.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { createEmptyPurchaseManualItem, type Purchase, type PurchaseItem, type Supplier } from '../index'
import { getProductUnitOptions, getUnitAdjustedPrice, resolveUnitConversion } from '@/lib/inventory-unit-conversions'
import { isMobileShopBusiness, isWholesaleRetailBusiness } from '@/lib/business-types'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import { getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { normalizeSuppliersList } from '../utils/catalog-helpers'
import { getSupplierId } from '../utils/scan-matching'
import { focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { fetchSuppliers } from '@/stores/supplier.slice'
import { fetchAllProducts } from '@/stores/product.slice'
import { useSync } from '@/lib/sync/use-sync'
import { buildOfflinePurchasePayload } from '@/lib/sync/offline-purchase'
import { getElectronAPI } from '@/lib/sync/electron'
import { isApiUnreachable } from '@/lib/auth-cache'
import { getTimeoutErrorMessage, isRequestTimeoutError } from '@/lib/api-timeout'
import { usePermissions } from '@/context/permission-context'
import {
  EntityCreateEmptyPrompt,
  EntityCreateShortcutButton,
  EntityQuickCreateDialogs,
  type QuickCreateState,
} from '@/components/entity-create-shortcut'

interface PurchasePanelProps {
  purchase: Purchase
  setPurchase: React.Dispatch<React.SetStateAction<Purchase>>
  updateQuantity: (productId: string, newQuantity: number) => void
  removeFromPurchase: (productId: string) => void
  updatePurchasePrice: (productId: string, price: number) => void
  updateSellingPrice: (productId: string, price: number) => void
  calculateTotals: () => { subtotal: number; total: number }
  onBackToList?: () => void
  onSaveSuccess?: (mode: 'create' | 'update') => void
  isEditing?: boolean
  editingPurchase?: any
  products: any[]
  productsLoading?: boolean
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>
}

export default function PurchasePanel({
  purchase,
  setPurchase,
  updateQuantity,
  removeFromPurchase,
  updatePurchasePrice,
  updateSellingPrice,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingPurchase,
  products,
  productsLoading = false,
  setProducts,
}: PurchasePanelProps) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const { isElectron, online } = useSync()
  const canCreateSupplier = hasPermission('createSuppliers' as never)
  const canCreateProduct = hasPermission('createProducts' as never)
  const [savingType, setSavingType] = useState<'none' | 'receipt' | 'a4' | null>(null)
  const [supplierSelectOpen, setSupplierSelectOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [supplierBalance, setSupplierBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [aiScanOpen, setAiScanOpen] = useState(false)
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [quickCreateProductIndex, setQuickCreateProductIndex] = useState<number | null>(null)
  const [imeiDraftByProduct, setImeiDraftByProduct] = useState<Record<string, string>>({})

  const addImeiToItem = useCallback((index: number, value: string) => {
    const cleaned = value.trim()
    if (!cleaned) return
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        const existing = item.imeis || []
        if (existing.includes(cleaned)) return item
        return { ...item, imeis: [...existing, cleaned] }
      }),
    }))
  }, [setPurchase])

  const removeImeiFromItem = useCallback((index: number, value: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, imeis: (item.imeis || []).filter((n) => n !== value) } : item,
      ),
    }))
  }, [setPurchase])

  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const purchasePriceInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const paymentTypeTriggerRef = useRef<HTMLButtonElement>(null)
  const purchaseDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  const [paymentTypeSelectOpen, setPaymentTypeSelectOpen] = useState(false)

  // Auto-scroll items list when items change
  useEffect(() => {
    if (itemsScrollRef.current) {
      itemsScrollRef.current.scrollTop = itemsScrollRef.current.scrollHeight
    }
  }, [purchase.items.length])

  // Redux state
  const suppliersData = useSelector((state: RootState) => state.supplier.data)
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const preferredLanguage = useSelector((state: RootState) => state.auth.data?.user?.preferredLanguage || 'en')
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const suppliers: Supplier[] = normalizeSuppliersList(suppliersData)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const isMobileShop = isMobileShopBusiness(orgData?.businessType || user?.businessType)
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !isMobileShop })
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  const showUnitConversions = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)

  // Filter suppliers by name, Urdu name, or phone
  const filteredSuppliers = suppliers.filter((supplier) =>
    matchesBilingualSearch(supplierSearchQuery, supplier.name, supplier.nameUrdu, supplier.phone),
  )

  const filteredPurchaseProducts = products.filter((product) =>
    matchesBilingualSearch(
      productSearchQuery,
      product.name,
      product.nameUrdu,
      product.barcode,
      typeof product.description === 'string' ? product.description : undefined,
    ),
  )

  // RTK Query mutations
  const [createPurchase] = useCreatePurchaseMutation()
  const [updatePurchase] = useUpdatePurchaseMutation()

  // Track suppliers loading state
  useEffect(() => {
    if (!suppliersData || suppliers.length === 0) {
      setSuppliersLoading(true)
    } else {
      setSuppliersLoading(false)
    }
  }, [suppliersData, suppliers.length])

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

  const purchaseAutoOpenDoneRef = useRef(false)

  useEffect(() => {
    if (isEditing) {
      purchaseAutoOpenDoneRef.current = false
      return
    }
    const first = purchase.items[0]
    const oneEmptyManual =
      purchase.items.length === 1 &&
      first?.isManualEntry &&
      !(first.product?.id || (first.product as { _id?: string })?._id)
    if (oneEmptyManual && !purchaseAutoOpenDoneRef.current) {
      purchaseAutoOpenDoneRef.current = true
      queueMicrotask(() => setProductSelectOpen('manual-0'))
    }
    if (!oneEmptyManual) {
      purchaseAutoOpenDoneRef.current = false
    }
  }, [isEditing, purchase.items])

  useEffect(() => {
    if (purchase.paymentType === 'Cash') {
      const currentTotal = calculateTotals().total
      if ((purchase.paidAmount || 0) !== currentTotal || (purchase.balance || 0) !== 0) {
        setPurchase((prev) => ({
          ...prev,
          paidAmount: currentTotal,
          balance: 0,
        }))
      }
    }
  }, [purchase.paymentType, purchase.paidAmount, purchase.balance, calculateTotals, setPurchase])

  // Print functionality
  const printPurchase = useCallback(
    (purchaseData: any, printType: 'receipt' | 'a4') => {
      try {
        import('@/utils/purchasePrintUtils').then((module) => {
          const supplierName = purchase.supplier?.name || 'Unknown'
          const branchDetails = {
            name: orgData?.name || branchData?.name,
            nameUrdu: branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim(),
            address: [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
              .filter(Boolean)
              .join(', '),
            phone: branchData?.phone,
            email: branchData?.email,
            logo: orgData?.logo?.url,
            isTrial: orgData?.subscription?.isTrial,
            invoiceNote: branchData?.invoiceNote,
          }
          const html =
            printType === 'receipt'
              ? module.generatePurchaseInvoiceHTML(purchaseData, supplierName, t, branchDetails, preferredLanguage, getInvoicePrintInUrdu())
              : module.generatePurchaseInvoiceA4HTML(purchaseData, supplierName, t, branchDetails, preferredLanguage, getInvoicePrintInUrdu())

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
    [branchData, purchase.supplier, t, preferredLanguage, orgData]
  )

  // Handle product selection for manual entries
  const handleProductSelect = useCallback(
    (itemIndex: number, product: any) => {
      setPurchase((prev) => {
        const newItems = [...prev.items]
        const unitOptions = getProductUnitOptions(product)
        newItems[itemIndex] = {
          product: product,
          quantity: newItems[itemIndex].quantity || 1,
          unit: unitOptions[0]?.value || product.unit || 'pcs',
          conversionFactor: unitOptions[0]?.factor || 1,
          stockQuantity: newItems[itemIndex].quantity || 1,
          purchasePrice: product.cost || 0,
          sellingPrice: product.price || 0,
          isManualEntry: false
        }
        return { ...prev, items: newItems }
      })
      setProductSelectOpen('')
      setProductSearchQuery('')
      // Focus the quantity input of the just-selected product
      const productId = product.id || product._id
      setTimeout(() => {
        const qtyInput = qtyInputRefs.current[productId]
        if (qtyInput) {
          qtyInput.focus()
          qtyInput.select()
        }
      }, 100)
    },
    [setPurchase]
  )

  const addNewPurchaseRowAndOpenProduct = useCallback(() => {
    const nextEmptyIdx = purchase.items.findIndex((item) => {
      const pid = item.product.id || (item.product as any)._id
      return item.isManualEntry && !pid
    })
    if (nextEmptyIdx !== -1) {
      setProductSelectOpen(`manual-${nextEmptyIdx}`)
      return
    }
    setPurchase((prev) => {
      const nextIndex = prev.items.length
      setTimeout(() => setProductSelectOpen(`manual-${nextIndex}`), 150)
      return {
        ...prev,
        items: [...prev.items, createEmptyPurchaseManualItem()],
      }
    })
  }, [setPurchase])

  const openPurchaseProductSelector = useCallback(() => {
    const emptyIdx = purchase.items.findIndex((item) => {
      const pid = item.product.id || (item.product as any)._id
      return item.isManualEntry && !pid
    })
    if (emptyIdx !== -1) {
      setProductSelectOpen(`manual-${emptyIdx}`)
      return
    }
    addNewPurchaseRowAndOpenProduct()
  }, [purchase.items, addNewPurchaseRowAndOpenProduct])

  const handlePurchaseQuantityKeyDown = useCallback(
    (e: React.KeyboardEvent, productId: string) => {
      onEnterAdvance(e, () => focusField(purchasePriceInputRefs.current[productId]))
    },
    [],
  )

  const handlePurchasePriceKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      onEnterAdvance(e, addNewPurchaseRowAndOpenProduct)
    },
    [addNewPurchaseRowAndOpenProduct],
  )

  const focusPaymentType = useCallback(() => focusField(paymentTypeTriggerRef.current), [])
  const focusPurchaseDate = useCallback(() => focusField(purchaseDateRef.current), [])

  const selectSupplier = useCallback(
    (supplier: (typeof suppliers)[number]) => {
      const sid = supplier._id || (supplier as { id?: string }).id
      if (!sid) return
      setPurchase((prev) => ({
        ...prev,
        supplier: {
          _id: sid,
          name: supplier.name,
          nameUrdu: supplier.nameUrdu,
          phone: supplier.phone,
          whatsapp: (supplier as { whatsapp?: string }).whatsapp,
          email: supplier.email,
          address: supplier.address,
          balance: supplier.balance,
          picture: supplier.picture,
        },
      }))
      setSupplierSelectOpen(false)
      setSupplierSearchQuery('')
      focusPaymentType()
    },
    [focusPaymentType, setPurchase],
  )

  const openQuickCreate = useCallback(
    (type: 'supplier' | 'product', defaultName?: string, productIndex?: number) => {
      setQuickCreate({ type, defaultName: defaultName?.trim() || undefined })
      if (productIndex != null) setQuickCreateProductIndex(productIndex)
      if (type === 'supplier') setSupplierSelectOpen(false)
      if (type === 'product') {
        setProductSelectOpen('')
        setProductSearchQuery('')
      }
    },
    [],
  )

  const handleQuickCreated = useCallback(
    async (type: 'customer' | 'supplier' | 'product', entity: any) => {
      if (type === 'supplier') {
        await dispatch(fetchSuppliers({ page: 1, limit: 1000 }))
        selectSupplier({
          ...entity,
          _id: entity._id || entity.id,
        })
        return
      }

      if (type === 'product') {
        const data = await dispatch(fetchAllProducts({})).unwrap()
        const list = data?.results || (Array.isArray(data) ? data : [])
        setProducts?.(list)
        const created =
          list.find((p: any) => (p._id || p.id) === (entity._id || entity.id)) || entity
        if (quickCreateProductIndex != null) {
          handleProductSelect(quickCreateProductIndex, created)
        }
        setQuickCreateProductIndex(null)
      }
    },
    [dispatch, handleProductSelect, quickCreateProductIndex, selectSupplier, setProducts],
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

      // Filter out empty manual entries (auto-added rows with no product selected)
      const validItems = purchase.items.filter((item) => {
        const pid = item.product.id || (item.product as any)?._id
        return pid && item.product.name
      })

      if (validItems.length === 0) {
        toast.error(t('Please add at least one item to the purchase'))
        return
      }

      // IMEI-tracked products must have exactly one IMEI per unit purchased
      for (const item of validItems) {
        if (!item.product.trackImei) continue
        const imeiCount = (item.imeis || []).filter((n) => n.trim()).length
        if (imeiCount !== item.quantity) {
          toast.error(
            `${item.product.name}: enter ${item.quantity} IMEI number(s) — ${imeiCount} entered`,
          )
          return
        }
      }

      setSavingType(printType)

      const totals = calculateTotals()

      console.log('Saving purchase with data:', purchase)
      console.log('Supplier ID:', supplierId)
      console.log('Totals:', totals)

      // Validate and normalize paymentType
      const validPaymentTypes = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit', 'Wallet'];
      let paymentType = purchase.paymentType || 'Cash';
      if (!validPaymentTypes.includes(paymentType)) {
        console.warn(`Invalid paymentType: ${paymentType}, defaulting to 'Cash'`);
        paymentType = 'Cash';
      }
      if (paymentType === 'Wallet' && !purchase.walletType) {
        toast.error(t('Please select a wallet for wallet payment'))
        return
      }

      // Map to backend format
      const purchaseData = {
        supplier: supplierId,
        items: validItems.map((item) => {
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
            unit: item.unit || item.product.unit || 'pcs',
            conversionFactor: item.conversionFactor,
            stockQuantity: item.stockQuantity,
            priceAtPurchase: item.purchasePrice,
            sellingPriceAtPurchase: item.sellingPrice || 0,
            total: item.quantity * item.purchasePrice,
            imeis: item.product.trackImei ? (item.imeis || []) : undefined,
          };
        }),
        totalAmount: totals.total,
        paidAmount: purchase.paidAmount || 0,
        balance: resolvePurchaseInvoiceBalance(totals.total, purchase.paidAmount || 0),
        paymentType: paymentType,
        walletType: paymentType === 'Wallet' ? purchase.walletType : undefined,
        purchaseDate: purchase.date || new Date().toISOString(),
        notes: purchase.notes?.trim() || undefined,
      }

      console.log('Purchase data being sent to backend:', purchaseData)

      const canQueueOffline = isElectron && !isEditing

      const saveOffline = async () => {
        const electron = getElectronAPI()
        const syncStatus = await electron?.sync.status()
        const deviceId = syncStatus?.deviceId || 'local-device'
        const { clientId, localPurchaseNumber, operation } = buildOfflinePurchasePayload(purchaseData, deviceId)
        await electron?.sync.queue(operation)
        toast.success(`Purchase ${localPurchaseNumber} saved offline. It will sync when you are back online.`)
        return {
          ...purchaseData,
          id: clientId,
          invoiceNumber: localPurchaseNumber,
          _offline: true,
        }
      }

      try {
        let result
        const purchaseId = editingPurchase?._id || editingPurchase?.id
        if (canQueueOffline && !online && !isEditing) {
          result = await saveOffline()
        } else if (isEditing && purchaseId) {
          result = await updatePurchase({
            id: purchaseId,
            data: purchaseData,
          }).unwrap()
          toast.success(t('Purchase updated successfully'))
        } else {
          try {
            result = await createPurchase(purchaseData).unwrap()
            toast.success(t('Purchase created successfully'))
          } catch (error) {
            if (canQueueOffline && isApiUnreachable(error)) {
              result = await saveOffline()
            } else {
              throw error
            }
          }
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

        if (onSaveSuccess) {
          onSaveSuccess(isEditing ? 'update' : 'create')
        }
      } catch (error: any) {
        console.error('Save error:', error)
        if (isRequestTimeoutError(error)) {
          dispatch(purchaseApi.util.invalidateTags(['Purchase']))
          toast.warning(getTimeoutErrorMessage('save purchase'))
          return
        }
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
      isElectron,
      online,
      dispatch,
    ]
  )

  const totals = calculateTotals()
  const isLoading = savingType !== null

  useInvoiceSaveShortcuts(
    () => handleSavePurchase('none'),
    () => handleSavePurchase('receipt'),
    () => handleSavePurchase('a4'),
    isLoading,
  )

  const handleApplyAiScan = useCallback(
    (payload: PurchaseScanApplyPayload) => {
      setPurchase((prev) => ({
        ...prev,
        supplier: payload.supplier,
        items: payload.items.length > 0 ? payload.items : prev.items,
        date: payload.date || prev.date,
        notes: payload.notes ?? prev.notes,
        paymentType: payload.paymentType || prev.paymentType,
      }))
    },
    [setPurchase],
  )

  return (
    <div className="space-y-4">
      {/* Supplier Selection Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              {onBackToList && (
                <Button variant="ghost" size="sm" onClick={onBackToList}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Package className="h-5 w-5" />
              {t('Purchase Details')}
            </CardTitle>
            {!isEditing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5 shrink-0"
                onClick={() => setAiScanOpen(true)}
              >
                <Sparkles className="h-4 w-4 text-violet-600" />
                {t('ai_scan_invoice')}
              </Button>
            )}
          </div>
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
            <div className="flex gap-2">
            <Popover open={supplierSelectOpen} onOpenChange={setSupplierSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={supplierSelectOpen}
                  onKeyDown={(e) => {
                    const supplierId = purchase.supplier?._id || (purchase.supplier as any)?.id
                    if (!supplierSelectOpen && supplierId) {
                      onEnterAdvance(e, focusPaymentType)
                    }
                  }}
                  className={`flex-1 justify-between min-h-[2.5rem] h-auto py-0 ${
                    !(purchase.supplier?._id || (purchase.supplier as any)?.id) ? 'border-red-500 bg-red-50' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Search className="w-4 h-4 flex-shrink-0" />
                    {(purchase.supplier?._id || (purchase.supplier as any)?.id) ? (
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <Badge variant="secondary" className="flex items-center gap-1.5 max-w-full pl-1">
                          <ContactPhotoCell
                            picture={purchase.supplier.picture}
                            name={purchase.supplier.name || ''}
                            className="h-5 w-5 shrink-0 rounded-full"
                          />
                          <span className="flex min-w-0 flex-row flex-wrap items-center gap-x-1.5 gap-y-0">
                            <span className="text-xs truncate shrink-0" title={purchase.supplier.name}>
                              {purchase.supplier.name}
                            </span>
                            {purchase.supplier.nameUrdu?.trim() ? (
                              <span
                                dir="rtl"
                                className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(purchase.supplier.nameUrdu))}
                              >
                                {purchase.supplier.nameUrdu.trim()}
                              </span>
                            ) : null}
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
                <Command shouldFilter={false}>
                  <div className="relative">
                    <CommandInput
                      placeholder={t('Search suppliers...')}
                      value={supplierSearchQuery}
                      onValueChange={setSupplierSearchQuery}
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2">
                      <VoiceInputButton
                        onTranscript={(text) => setSupplierSearchQuery(text)}
                        size="sm"
                      />
                    </div>
                  </div>
                  {suppliersLoading ? (
                    <div className="py-6 text-center text-sm text-muted-foreground">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
                      {t('Loading suppliers...')}
                    </div>
                  ) : filteredSuppliers.length === 0 ? (
                    canCreateSupplier ? (
                      <EntityCreateEmptyPrompt
                        message={t('No suppliers found')}
                        actionLabel={t('add_supplier')}
                        onCreate={() => openQuickCreate('supplier', supplierSearchQuery)}
                      />
                    ) : (
                      <CommandEmpty>{t('No suppliers found')}</CommandEmpty>
                    )
                  ) : null}
                  {!suppliersLoading && filteredSuppliers.length > 0 ? (
                  <CommandList className="max-h-[300px] overflow-y-auto">
                    <CommandGroup>
                      {filteredSuppliers.map((supplier, index) => {
                        const supplierId = supplier._id || (supplier as { id?: string }).id || `supplier-${index}`
                        const currentSupplierId = purchase.supplier?._id || (purchase.supplier as { id?: string }).id
                        const isSelected = currentSupplierId === supplierId
                        return (
                          <CommandItem
                            key={supplierId}
                            value={`${supplier.name} ${supplier.phone || ''} ${supplier.nameUrdu || ''}`}
                            onSelect={() => selectSupplier(supplier)}
                            className="flex items-center gap-3 cursor-pointer p-3"
                          >
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <ContactPhotoCell
                                picture={supplier.picture}
                                name={supplier.name || ''}
                                className="h-8 w-8 shrink-0"
                              />
                              <div className="flex flex-col flex-1 min-w-0 gap-0.5">
                                <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                  <span className="truncate font-medium shrink-0" title={supplier.name}>
                                    {supplier.name}
                                  </span>
                                  {supplier.nameUrdu?.trim() ? (
                                    <span
                                      dir="rtl"
                                      className={cn('min-w-0 truncate text-sm', getUrduSecondaryNameClasses(supplier.nameUrdu))}
                                      title={supplier.nameUrdu.trim()}
                                    >
                                      {supplier.nameUrdu.trim()}
                                    </span>
                                  ) : null}
                                </div>
                                {supplier.phone && (
                                  <span className="text-xs text-muted-foreground truncate" title={supplier.phone}>
                                    {supplier.phone}
                                  </span>
                                )}
                              </div>
                            </div>
                            {isSelected ? (
                              <div className="w-4 h-4 rounded-sm flex items-center justify-center flex-shrink-0">
                                <Check className="w-3 h-3 text-primary" />
                              </div>
                            ) : null}
                          </CommandItem>
                        )
                      })}
                      {canCreateSupplier ? (
                        <CommandItem
                          onSelect={() => openQuickCreate('supplier', supplierSearchQuery)}
                          className="flex cursor-pointer items-center gap-2 border-t p-3 text-primary"
                        >
                          <Plus className="h-4 w-4" />
                          <span>{t('add_supplier')}</span>
                        </CommandItem>
                      ) : null}
                    </CommandGroup>
                  </CommandList>
                  ) : null}
                </Command>
              </PopoverContent>
            </Popover>
            {canCreateSupplier ? (
              <EntityCreateShortcutButton
                label={t('add_supplier')}
                onClick={() => openQuickCreate('supplier', supplierSearchQuery)}
              />
            ) : null}
            </div>

            <div>
              <Label htmlFor="payment-type" className="mb-2">{t('Payment Type')}</Label>
              <Select
                value={purchase.paymentType || 'Cash'}
                onOpenChange={setPaymentTypeSelectOpen}
                onValueChange={(value: 'Cash' | 'Card' | 'Bank Transfer' | 'Cheque' | 'Credit' | 'Wallet') => {
                  const currentTotal = calculateTotals().total
                  setPurchase((prev) => {
                    const switchingCashToCredit = prev.paymentType === 'Cash' && value === 'Credit'
                    const switchingCashToWallet = prev.paymentType === 'Cash' && value === 'Wallet'
                    const nextPaid = value === 'Cash'
                      ? currentTotal
                      : (switchingCashToCredit || switchingCashToWallet)
                        ? 0
                        : (prev.paidAmount || 0)
                    return {
                      ...prev,
                      paymentType: value,
                      walletType: value === 'Wallet' ? prev.walletType : undefined,
                      paidAmount: nextPaid,
                      balance: resolvePurchaseInvoiceBalance(currentTotal, nextPaid),
                    }
                  })
                }}
              >
                <SelectTrigger
                  ref={paymentTypeTriggerRef}
                  className='w-full'
                  onKeyDown={(e) => {
                    if (!paymentTypeSelectOpen) {
                      onEnterAdvance(e, focusPurchaseDate)
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='Cash'>{t('cash')}</SelectItem>
                  <SelectItem value='Credit'>{t('credit')}</SelectItem>
                  {isMobileShop && <SelectItem value='Wallet'>{t('wallet') || 'Wallet'}</SelectItem>}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="purchase-date">
                {t('Purchase Date')} <span className="text-red-500">*</span>
              </Label>
              <Input
                ref={purchaseDateRef}
                id="purchase-date"
                type="date"
                value={purchase.date ? new Date(purchase.date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]}
                onChange={(e) =>
                  setPurchase((prev) => ({
                    ...prev,
                    date: new Date(e.target.value).toISOString(),
                  }))
                }
                onKeyDown={(e) => onEnterAdvance(e, openPurchaseProductSelector)}
                className="w-full"
              />
            </div>

            {isMobileShop && purchase.paymentType === 'Wallet' && (
              <div>
                <Label className="mb-2 block">{t('Select Wallet') || 'Select Wallet'}</Label>
                {wallets.length > 0 ? (
                  <Select
                    value={purchase.walletType || ''}
                    onValueChange={(value) => {
                      setPurchase((prev) => ({ ...prev, walletType: value }))
                    }}
                  >
                    <SelectTrigger className='w-full'>
                      <SelectValue placeholder={t('Select wallet') || 'Select wallet...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {wallets.map((wallet) => (
                        <SelectItem key={wallet.id} value={wallet.type}>
                          {wallet.type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <p className='text-xs text-muted-foreground'>
                    {t('No wallets configured. Add wallets in Mobile Shop -> Wallet.') || 'No wallets configured. Add wallets in Mobile Shop -> Wallet.'}
                  </p>
                )}
              </div>
            )}
        </CardContent>
      </Card>

      {/* Items List Card */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle>{t('Purchase Items')} ({purchase.items.length})</CardTitle>
            <div className="flex items-center gap-2">
              {canCreateProduct ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openQuickCreate('product', productSearchQuery)}
                  className="flex items-center gap-1"
                >
                  <Plus className="h-4 w-4" />
                  {t('add_product')}
                </Button>
              ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPurchase((prev) => ({
                  ...prev,
                  items: [...prev.items, createEmptyPurchaseManualItem()],
                }))
              }}
              className='flex items-center gap-1'
            >
              <Plus className='h-4 w-4' />
              {t('Add Item')}
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div ref={itemsScrollRef} className="space-y-2">
            {purchase.items.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t('No items added yet')}
              </div>
            ) : (
              purchase.items.map((item: PurchaseItem, index: number) => {
                const productId = item.product.id || (item.product as any)._id;
                
                // Show product selector for manual entries
                if (item.isManualEntry && !productId) {
                  return (
                    <div key={`manual-${index}`} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                      <div className='flex items-center gap-3 p-3'>
                        <div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0'>
                          <Package className='h-5 w-5 text-muted-foreground/50' />
                        </div>
                        <div className='flex-1 min-w-0'>
                          <Popover
                            open={productSelectOpen === `manual-${index}`}
                            onOpenChange={(open) => {
                              setProductSelectOpen(open ? `manual-${index}` : '')
                              setProductSearchQuery('')
                            }}
                          >
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start h-8 text-xs border-dashed">
                                <Search className="h-3 w-3 mr-2 flex-shrink-0" />
                                {t('Select Product')} *
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[400px] p-0" align="start">
                              <Command shouldFilter={false}>
                                <div className="relative">
                                  <CommandInput
                                    placeholder={t('Search products...')}
                                    value={productSearchQuery}
                                    onValueChange={setProductSearchQuery}
                                  />
                                  <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                    <VoiceInputButton
                                      onTranscript={(text) => setProductSearchQuery(text)}
                                      size="sm"
                                    />
                                  </div>
                                </div>
                                <CommandList className="max-h-64 overflow-y-auto">
                                  {productsLoading && products.length === 0 ? (
                                    <div className="flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground">
                                      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
                                      {t('loading_products')}
                                    </div>
                                  ) : filteredPurchaseProducts.length === 0 ? (
                                    canCreateProduct ? (
                                      <EntityCreateEmptyPrompt
                                        message={t('No products found')}
                                        actionLabel={t('add_product')}
                                        onCreate={() => openQuickCreate('product', productSearchQuery, index)}
                                      />
                                    ) : (
                                      <div className="py-6 text-center text-sm text-muted-foreground">
                                        {t('No products found')}
                                      </div>
                                    )
                                  ) : (
                                    <CommandGroup>
                                      {filteredPurchaseProducts.map((product: any) => {
                                          const pid = product.id || product._id
                                          return (
                                        <CommandItem
                                          key={String(pid)}
                                          value={`${String(pid)}-${String(product.name ?? '')}`}
                                          onSelect={() => handleProductSelect(index, product)}
                                          className="flex items-center gap-3 cursor-pointer p-3"
                                        >
                                          {product.image?.url ? (
                                            <img
                                              src={product.image.url}
                                              alt={product.name}
                                              className="w-8 h-8 object-cover rounded-lg flex-shrink-0"
                                            />
                                          ) : (
                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                              <Package className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                              <div className="font-medium text-sm truncate shrink-0">{product.name}</div>
                                              {product.nameUrdu?.trim() ? (
                                                <span
                                                  dir="rtl"
                                                  className={cn(
                                                    'min-w-0 truncate text-xs',
                                                    getUrduSecondaryNameClasses(product.nameUrdu),
                                                  )}
                                                >
                                                  {product.nameUrdu.trim()}
                                                </span>
                                              ) : null}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                              {product.barcode && <span>{product.barcode}</span>}
                                              <span className="text-amber-600">Purchase Price: Rs{product.cost?.toFixed(2) || '0.00'}</span>
                                              <span className={product.stockQuantity <= 5 ? 'text-red-500 font-medium' : 'text-green-600'}>
                                                Stock: {product.stockQuantity}
                                              </span>
                                            </div>
                                          </div>
                                        </CommandItem>
                                          )
                                        })}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                          onClick={() => setPurchase(prev => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }))}
                        >
                          <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                        </Button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div key={`${productId}-${index}`} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                    {/* Row 1: Image + Info + Delete */}
                    <div className='flex items-start gap-3 p-3'>
                      {item.product.image?.url ? (
                        <img
                          src={item.product.image.url}
                          alt={item.product.name}
                          className='w-10 h-10 object-cover rounded-lg flex-shrink-0 mt-0.5'
                        />
                      ) : (
                        <div className='w-10 h-10 rounded-lg bg-muted flex items-center justify-center flex-shrink-0 mt-0.5'>
                          <Package className='h-5 w-5 text-muted-foreground/50' />
                        </div>
                      )}

                      <div className='flex-1 min-w-0'>
                        <p className='font-semibold text-sm truncate'>{item.product.name}</p>
                        <div className='flex items-center gap-2 mt-0.5 flex-wrap'>
                          {item.product.barcode && (
                            <span className='text-xs text-muted-foreground'>{item.product.barcode}</span>
                          )}
                          <span className='text-xs text-muted-foreground'>Rs{item.purchasePrice} · {item.unit || item.product.unit || 'pcs'}</span>
                          {item.product.stockQuantity !== undefined && (
                            <span className={`inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                              item.product.stockQuantity <= 0 ? 'bg-red-100 text-red-700' :
                              item.product.stockQuantity <= 5 ? 'bg-red-50 text-red-500' :
                              item.product.stockQuantity <= 20 ? 'bg-amber-50 text-amber-600' :
                              'bg-green-50 text-green-700'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                item.product.stockQuantity <= 0 ? 'bg-red-500' :
                                item.product.stockQuantity <= 5 ? 'bg-red-400' :
                                item.product.stockQuantity <= 20 ? 'bg-amber-400' :
                                'bg-green-500'
                              }`} />
                              {item.product.stockQuantity <= 0 ? 'Out of stock' : `${item.product.stockQuantity} in stock`}
                            </span>
                          )}
                        </div>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                        onClick={() => removeFromPurchase(productId)}
                      >
                        <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                      </Button>
                    </div>

                    {/* Row 2: Controls */}
                    <div className='flex items-center gap-3 flex-wrap border-t bg-muted/20 px-3 py-2.5'>
                      {/* Quantity Stepper */}
                      <div className='flex items-center gap-1.5'>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <Button
                            size="sm"
                            variant="ghost"
                            className='h-7 w-7 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            onClick={() => updateQuantity(productId, Math.max(1, item.quantity - 1))}
                          >
                            <Minus className='h-3.5 w-3.5' />
                          </Button>
                          <Input
                            ref={(el) => { qtyInputRefs.current[productId] = el }}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(productId, parseInt(e.target.value) || 1)}
                            onKeyDown={(e) => handlePurchaseQuantityKeyDown(e, productId)}
                            onFocus={(e) => e.target.select()}
                            className='h-7 w-20 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className='h-7 w-7 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            onClick={() => updateQuantity(productId, item.quantity + 1)}
                          >
                            <Plus className='h-3.5 w-3.5' />
                          </Button>
                        </div>
                        <span className='text-xs text-muted-foreground'>{item.unit || item.product.unit || 'pcs'}</span>
                      </div>

                      {showUnitConversions && (
                        <div className='flex flex-col gap-1 min-w-[80px]'>
                          <Label className='text-[10px] text-muted-foreground'>{t('unit')}</Label>
                          <Select
                            value={item.unit || item.product.unit || 'pcs'}
                            onValueChange={(value) => {
                              const resolved = resolveUnitConversion({
                                product: item.product,
                                quantity: item.quantity,
                                unit: value,
                              })
                              const adjustedPurchasePrice = getUnitAdjustedPrice({
                                product: item.product,
                                unit: value,
                                basePrice: item.product.cost || item.product.price || item.purchasePrice || 0,
                                conversionFactor: resolved?.conversionFactor,
                              })
                              if (!resolved || adjustedPurchasePrice === null) {
                                toast.error(`Missing conversion for ${item.product.name}`)
                                return
                              }
                              setPurchase((prev) => ({
                                ...prev,
                                items: prev.items.map((purchaseItem, purchaseIndex) =>
                                  purchaseIndex === index
                                    ? {
                                        ...purchaseItem,
                                        unit: resolved.lineUnit,
                                        conversionFactor: resolved.conversionFactor,
                                        stockQuantity: resolved.stockQuantity,
                                        purchasePrice: adjustedPurchasePrice,
                                      }
                                    : purchaseItem
                                ),
                              }))
                            }}
                          >
                            <SelectTrigger className='h-6 text-xs px-2'>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {getProductUnitOptions(item.product).map((unitOption) => (
                                <SelectItem key={unitOption.value} value={unitOption.value}>
                                  {unitOption.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* × separator */}
                      <span className='text-muted-foreground/60 text-sm select-none'>×</span>

                      {/* Purchase Price Input */}
                      <div className='flex flex-col gap-0.5'>
                        <span className='text-[10px] text-muted-foreground leading-none'>Purchase Price</span>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <span className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-r font-medium select-none'>Rs</span>
                          <Input
                            ref={(el) => { purchasePriceInputRefs.current[productId] = el }}
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={item.purchasePrice > 0 ? item.purchasePrice : ''}
                            onChange={(e) => updatePurchasePrice(productId, parseFloat(e.target.value) || 0)}
                            onKeyDown={handlePurchasePriceKeyDown}
                            onFocus={(e) => e.target.select()}
                            className='h-7 w-16 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>
                      </div>

                      {/* → separator */}
                      <span className='text-muted-foreground/60 text-sm select-none'>→</span>

                      {/* Sale Price Input */}
                      <div className='flex flex-col gap-0.5'>
                        <span className='text-[10px] text-blue-500 leading-none font-medium'>Sale Price</span>
                        <div className='flex items-center rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 overflow-hidden'>
                          <span className='px-2 h-7 flex items-center text-xs text-blue-500 bg-blue-100/60 dark:bg-blue-900/30 border-r border-blue-200 dark:border-blue-800 font-medium select-none'>Rs</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={(item.sellingPrice ?? 0) > 0 ? item.sellingPrice : ''}
                            onChange={(e) => updateSellingPrice(productId, parseFloat(e.target.value) || 0)}
                            onFocus={(e) => e.target.select()}
                            placeholder='0'
                            className='h-7 w-16 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-blue-700 dark:text-blue-300 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>
                      </div>

                      {/* = subtotal */}
                      <div className='flex items-center gap-1.5 ml-auto'>
                        <span className='text-muted-foreground/60 text-sm select-none'>=</span>
                        <p className='font-bold text-sm'>Rs{(item.quantity * item.purchasePrice).toFixed(2)}</p>
                      </div>
                    </div>

                    {/* Row 3: IMEI numbers (only for products that require IMEI tracking) */}
                    {item.product.trackImei && (
                      <div className='border-t bg-amber-50/40 dark:bg-amber-950/10 px-3 py-2.5 space-y-2'>
                        <div className='flex items-center justify-between'>
                          <span className='text-xs font-medium text-amber-700'>
                            IMEI Numbers ({(item.imeis || []).length}/{item.quantity})
                          </span>
                        </div>
                        <div className='flex items-center gap-2'>
                          <Input
                            placeholder='Scan or type IMEI, press Enter'
                            value={imeiDraftByProduct[productId] || ''}
                            showVoiceInput={false}
                            onChange={(e) =>
                              setImeiDraftByProduct((prev) => ({ ...prev, [productId]: e.target.value }))
                            }
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ',') {
                                e.preventDefault()
                                addImeiToItem(index, imeiDraftByProduct[productId] || '')
                                setImeiDraftByProduct((prev) => ({ ...prev, [productId]: '' }))
                              }
                            }}
                            className='h-8 text-sm flex-1'
                          />
                          <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-8'
                            onClick={() => {
                              addImeiToItem(index, imeiDraftByProduct[productId] || '')
                              setImeiDraftByProduct((prev) => ({ ...prev, [productId]: '' }))
                            }}
                          >
                            <Plus className='h-3.5 w-3.5' />
                          </Button>
                        </div>
                        {(item.imeis || []).length > 0 && (
                          <div className='flex flex-wrap gap-1.5'>
                            {(item.imeis || []).map((num) => (
                              <Badge key={num} variant='secondary' className='gap-1 pr-1'>
                                {num}
                                <button
                                  type='button'
                                  onClick={() => removeImeiFromItem(index, num)}
                                  className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'
                                >
                                  <X className='h-3 w-3' />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
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
            <div className="flex justify-between gap-6">
              <span className="text-muted-foreground">{t('Subtotal')}:</span>
              <span className="tabular-nums font-medium">Rs{totals.subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between gap-6 border-t pt-2 font-bold text-lg">
              <span>{t('Total')}:</span>
              <span className="tabular-nums">Rs{totals.total.toFixed(2)}</span>
            </div>

            {/* Paid Amount Input */}
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2">
                <Label htmlFor="paid-amount" className="whitespace-nowrap">
                  {t('Paid Amount')}:
                </Label>
                <Input
                  id="paid-amount"
                  type="text"
                  inputMode="decimal"
                  value={purchase.paidAmount || ''}
                  disabled={purchase.paymentType === 'Cash'}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value) || 0
                    const currentTotal = calculateTotals().total
                    setPurchase((prev) => ({
                      ...prev,
                      paidAmount: value,
                      balance: resolvePurchaseInvoiceBalance(currentTotal, value),
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
              )} */}
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
                {(purchase.paidAmount || 0) > 0 && (
                  <div className='flex justify-between items-center text-sm'>
                    <span className="font-medium">{t('Paid Now')}:</span>
                    <span className="font-bold text-green-600">-Rs{(purchase.paidAmount || 0).toFixed(2)} (Dr)</span>
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
                  {isEditing ? t('Update Purchase') : t('Save Purchase')} (Ctrl+D)
                </>
              )}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={() => handleSavePurchase('receipt')}
                className="w-full"
                size="lg"
                disabled={!getSupplierId(purchase.supplier as Supplier) || purchase.items.length === 0 || isLoading}
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
                    {t('Save & Print Receipt')} (Ctrl+Enter)
                  </>
                )}
              </Button>

              <Button 
                onClick={() => handleSavePurchase('a4')}
                className="w-full"
                size="lg"
                disabled={!getSupplierId(purchase.supplier as Supplier) || purchase.items.length === 0 || isLoading}
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
                    {t('Save & Print A4')} (Ctrl+F)
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <PurchaseAiScanDialog
        open={aiScanOpen}
        onOpenChange={setAiScanOpen}
        suppliers={suppliers}
        products={products}
        onApply={handleApplyAiScan}
      />

      <EntityQuickCreateDialogs
        state={quickCreate}
        onClose={() => {
          setQuickCreate(null)
          setQuickCreateProductIndex(null)
        }}
        onCreated={handleQuickCreated}
      />
    </div>
  )
}

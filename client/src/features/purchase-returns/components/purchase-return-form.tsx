import { useState, useEffect, useCallback, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowLeft, Minus, Plus, Trash2, PackageSearch, ShoppingCart, PenLine, Search, ChevronDown, Package, Check } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
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
} from '@/components/ui/command'
import { useGetPurchasesQuery } from '@/stores/purchase.api'
import {
  useCreatePurchaseReturnMutation,
  useGetSalesReturnsQuery,
  type SalesReturn,
} from '@/stores/returns.api'
import { fetchAllProducts } from '@/stores/product.slice'
import { fetchAllSuppliers } from '@/stores/supplier.slice'
import type { AppDispatch, RootState } from '@/stores/store'

type FormMode = 'fromSalesReturn' | 'fromPurchase' | 'freeForm'

interface ReturnItem {
  productId: string
  name: string
  quantity: number
  maxQuantity: number
  costPrice: number
  total: number
}

interface PurchaseReturnFormProps {
  onBack: () => void
  onSuccess: () => void
  prefillSalesReturn?: SalesReturn | null
}

// ── Reusable Supplier Popover (Popover + Command, same as purchase-panel) ──
function SupplierPopover({
  suppliers,
  selectedId,
  selectedName,
  open,
  searchQuery,
  onOpenChange,
  onSearchChange,
  onSelect,
}: {
  suppliers: any[]
  selectedId: string
  selectedName: string
  open: boolean
  searchQuery: string
  onOpenChange: (v: boolean) => void
  onSearchChange: (v: string) => void
  onSelect: (s: any) => void
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={`w-full justify-between ${!selectedId ? 'border-destructive/50' : ''}`}
        >
          <div className='flex items-center gap-2 flex-1 min-w-0'>
            <Search className='h-4 w-4 text-muted-foreground flex-shrink-0' />
            {selectedId ? (
              <Badge variant='secondary' className='flex items-center gap-1'>
                <div className='flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground'>
                  {selectedName?.charAt(0).toUpperCase()}
                </div>
                <span className='truncate text-xs'>{selectedName}</span>
              </Badge>
            ) : (
              <span className='text-muted-foreground truncate'>Select supplier...</span>
            )}
          </div>
          <ChevronDown className='h-4 w-4 opacity-50 flex-shrink-0' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[400px] p-0' align='start'>
        <div className='p-2'>
          <div className='relative'>
            <Search className='absolute left-2 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              placeholder='Search suppliers...'
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className='pl-8'
            />
          </div>
        </div>
        <div className='max-h-72 overflow-y-auto'>
          {suppliers.length === 0 ? (
            <p className='py-6 text-center text-sm text-muted-foreground'>No suppliers found.</p>
          ) : (
            <div className='space-y-1 p-1'>
              {suppliers.map((s: any) => {
                const id = s._id || s.id
                return (
                  <div
                    key={id}
                    onClick={() => onSelect(s)}
                    className={`flex cursor-pointer items-center gap-3 rounded-lg p-3 transition-colors hover:bg-accent/50 ${selectedId === id ? 'bg-accent' : ''}`}
                  >
                    <div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground'>
                      {s.name?.charAt(0).toUpperCase()}
                    </div>
                    <div className='flex-1 min-w-0'>
                      <p className='truncate font-medium'>{s.name}</p>
                      {s.phone && <p className='truncate text-xs text-muted-foreground'>{s.phone}</p>}
                    </div>
                    {selectedId === id && <Check className='h-4 w-4 text-primary flex-shrink-0' />}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default function PurchaseReturnForm({
  onBack,
  onSuccess,
  prefillSalesReturn,
}: PurchaseReturnFormProps) {
  const dispatch = useDispatch<AppDispatch>()

  // ── Mode ─────────────────────────────────────────────────────────────────
  const [mode, setMode] = useState<FormMode>(
    prefillSalesReturn ? 'fromSalesReturn' : 'fromPurchase'
  )

  // ── Shared state ─────────────────────────────────────────────────────────
  const [returnItems, setReturnItems] = useState<ReturnItem[]>([])
  const [selectedSupplierId, setSelectedSupplierId] = useState('')
  const [refundMethod, setRefundMethod] = useState<'cash' | 'bank' | 'adjustment'>('cash')
  const [reason, setReason] = useState('')
  const [damageDescription, setDamageDescription] = useState('')
  const [linkedPurchaseId, setLinkedPurchaseId] = useState<string | null>(null)

  // ── Mode: fromSalesReturn ─────────────────────────────────────────────
  const [srSearch, setSrSearch] = useState('')
  const [debouncedSrSearch, setDebouncedSrSearch] = useState('')
  const [selectedSalesReturn, setSelectedSalesReturn] = useState<SalesReturn | null>(
    prefillSalesReturn ?? null
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSrSearch(srSearch), 400)
    return () => clearTimeout(t)
  }, [srSearch])

  const { data: salesReturnsData } = useGetSalesReturnsQuery(
    { status: 'approved', convertedToPurchaseReturn: false, search: debouncedSrSearch, limit: 10 },
    { skip: mode !== 'fromSalesReturn' }
  )

  const handleSelectSalesReturn = useCallback((sr: SalesReturn) => {
    setSelectedSalesReturn(sr)
    setSrSearch('')
    setReturnItems(
      sr.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        quantity: item.quantity,
        maxQuantity: item.quantity,
        costPrice: item.price ?? 0, // will be overwritten by useEffect below
        total: (item.price ?? 0) * item.quantity,
      }))
    )
    setSelectedSupplierId('')
  }, [])

  // Pre-fill when opened with a prefill prop
  useEffect(() => {
    if (prefillSalesReturn) {
      handleSelectSalesReturn(prefillSalesReturn)
    }
  }, [prefillSalesReturn, handleSelectSalesReturn])

  // ── Mode: fromPurchase ────────────────────────────────────────────────
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [debouncedPurchaseSearch, setDebouncedPurchaseSearch] = useState('')
  const [selectedPurchase, setSelectedPurchase] = useState<any>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedPurchaseSearch(purchaseSearch), 400)
    return () => clearTimeout(timer)
  }, [purchaseSearch])

  const { data: purchasesData } = useGetPurchasesQuery(
    { search: debouncedPurchaseSearch, limit: 10 },
    { skip: mode !== 'fromPurchase' || !debouncedPurchaseSearch }
  )

  const handleSelectPurchase = (purchase: any) => {
    setSelectedPurchase(purchase)
    setLinkedPurchaseId(purchase._id || purchase.id)
    setPurchaseSearch('')
    const suppId =
      purchase.supplierId ||
      purchase.supplier?._id ||
      purchase.supplier?.id ||
      ''
    setSelectedSupplierId(suppId)
    const items: ReturnItem[] = (purchase.items || []).map((item: any) => ({
      productId: item.productId || item.product?._id || item.product?.id,
      name: item.name || item.product?.name || 'Unknown',
      quantity: 1,
      maxQuantity: item.quantity,
      costPrice: item.costPrice ?? item.unitPrice ?? item.price ?? 0,
      total: item.costPrice ?? item.unitPrice ?? item.price ?? 0,
    }))
    setReturnItems(items)
  }

  // ── Redux data (for free-form supplier + product pickers) ───────────────
  const suppliersRedux = useSelector((state: RootState) => state.supplier.data)
  const productsRedux  = useSelector((state: RootState) => state.product.data)
  const allSuppliers: any[] = Array.isArray(suppliersRedux) ? suppliersRedux : []
  const allProducts: any[]  = Array.isArray(productsRedux) ? productsRedux : []

  // Once products load into Redux, patch cost prices for sales-return items
  // (Sales return items only carry the *sale* price; we need the product cost)
  useEffect(() => {
    if (!allProducts.length || mode !== 'fromSalesReturn') return
    setReturnItems((prev) =>
      prev.map((item) => {
        const product = allProducts.find(
          (p: any) => (p._id || p.id) === item.productId
        )
        if (!product) return item
        const costPrice = product.cost ?? item.costPrice
        return { ...item, costPrice, total: costPrice * item.quantity }
      })
    )
  }, [allProducts, mode])

  // Fetch once at mount if not already in Redux
  const dataFetched = useRef(false)
  useEffect(() => {
    if (dataFetched.current) return
    dataFetched.current = true
    if (!allSuppliers.length) dispatch(fetchAllSuppliers({}))
    if (!allProducts.length)  dispatch(fetchAllProducts({}))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Popover state for supplier / product pickers ─────────────────────────
  const [supplierPopoverOpen, setSupplierPopoverOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [selectedSupplierName, setSelectedSupplierName] = useState('')

  const [productPopoverOpen, setProductPopoverOpen] = useState(false)
  const [productSearchQuery, setProductSearchQuery] = useState('')

  const filteredSuppliers = allSuppliers.filter((s) => {
    if (!supplierSearchQuery) return true
    const q = supplierSearchQuery.toLowerCase()
    return s.name?.toLowerCase().includes(q) || s.phone?.toLowerCase().includes(q)
  })

  const filteredProducts = allProducts.filter((p) => {
    if (!productSearchQuery) return true
    const q = productSearchQuery.toLowerCase()
    return p.name?.toLowerCase().includes(q) || p.barcode?.toLowerCase().includes(q)
  })

  const handleAddProduct = (product: any) => {
    const existingIndex = returnItems.findIndex((i) => i.productId === (product._id || product.id))
    if (existingIndex >= 0) {
      setReturnItems((prev) =>
        prev.map((item, i) =>
          i === existingIndex
            ? { ...item, quantity: item.quantity + 1, total: (item.quantity + 1) * item.costPrice }
            : item
        )
      )
    } else {
      const cp = product.cost ?? product.costPrice ?? product.purchasePrice ?? 0
      setReturnItems((prev) => [
        ...prev,
        {
          productId: product._id || product.id,
          name: product.name,
          quantity: 1,
          maxQuantity: 99999,
          costPrice: cp,
          total: cp,
        },
      ])
    }
    setProductSearchQuery('')
    setProductPopoverOpen(false)
  }

  // ── Mode switch: reset ────────────────────────────────────────────────
  const switchMode = (m: FormMode) => {
    setMode(m)
    setReturnItems([])
    setSelectedSupplierId('')
    setSelectedPurchase(null)
    setSelectedSalesReturn(null)
    setLinkedPurchaseId(null)
    setSupplierSearchQuery('')
    setSelectedSupplierName('')
  }

  // ── Shared item controls ──────────────────────────────────────────────
  const updateQuantity = (index: number, delta: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item
        const newQty = Math.min(Math.max(1, item.quantity + delta), item.maxQuantity)
        return { ...item, quantity: newQty, total: newQty * item.costPrice }
      })
    )
  }

  const updateCostPrice = (index: number, value: number) => {
    setReturnItems((prev) =>
      prev.map((item, i) =>
        i === index ? { ...item, costPrice: value, total: item.quantity * value } : item
      )
    )
  }

  const removeItem = (index: number) => {
    setReturnItems((prev) => prev.filter((_, i) => i !== index))
  }

  const totalAmount = returnItems.reduce((sum, item) => sum + item.total, 0)

  // ── Submit ────────────────────────────────────────────────────────────
  const [createPurchaseReturn, { isLoading }] = useCreatePurchaseReturnMutation()

  const getEffectiveSupplierId = () => {
    if (mode === 'fromPurchase' && selectedPurchase) {
      return (
        selectedPurchase.supplierId ||
        selectedPurchase.supplier?._id ||
        selectedPurchase.supplier?.id ||
        selectedSupplierId
      )
    }
    return selectedSupplierId
  }

  const handleSubmit = async () => {
    const supplierId = getEffectiveSupplierId()
    if (!supplierId) {
      toast.error('Please select a supplier')
      return
    }
    if (returnItems.length === 0) {
      toast.error('No items to return')
      return
    }

    const payload = {
      ...(linkedPurchaseId ? { purchaseId: linkedPurchaseId } : {}),
      ...(selectedSalesReturn ? { salesReturnId: selectedSalesReturn._id || selectedSalesReturn.id } : {}),
      supplierId,
      items: returnItems.map(({ productId, name, quantity, costPrice, total }) => ({
        productId,
        name,
        quantity,
        costPrice,
        total,
      })),
      totalAmount,
      refundMethod,
      reason,
      damageDescription,
    }

    try {
      await createPurchaseReturn(payload).unwrap()
      toast.success('Purchase return created successfully')
      onSuccess()
    } catch (err: any) {
      toast.error(err?.data?.message || 'Failed to create return')
    }
  }

  const hasSource =
    (mode === 'fromSalesReturn' && selectedSalesReturn) ||
    (mode === 'fromPurchase' && selectedPurchase) ||
    mode === 'freeForm'

  // ── Render ────────────────────────────────────────────────────────────
  return (    <div className='space-y-6'>
      {/* Header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='icon' onClick={onBack}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <h2 className='text-2xl font-bold'>Create Purchase Return</h2>
      </div>

      {/* Mode Selector */}
      {!prefillSalesReturn && (
        <Card>
          <CardContent className='pt-4'>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
              <button
                onClick={() => switchMode('fromSalesReturn')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-colors ${
                  mode === 'fromSalesReturn'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <PackageSearch className='h-6 w-6' />
                <span className='font-medium'>From Customer Return</span>
                <span className='text-xs text-muted-foreground text-center'>
                  Convert approved sales returns to send back to supplier
                </span>
              </button>
              <button
                onClick={() => switchMode('fromPurchase')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-colors ${
                  mode === 'fromPurchase'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <ShoppingCart className='h-6 w-6' />
                <span className='font-medium'>From Purchase Invoice</span>
                <span className='text-xs text-muted-foreground text-center'>
                  Return items linked to a specific purchase invoice
                </span>
              </button>
              <button
                onClick={() => switchMode('freeForm')}
                className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 text-sm transition-colors ${
                  mode === 'freeForm'
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <PenLine className='h-6 w-6' />
                <span className='font-medium'>Free Form</span>
                <span className='text-xs text-muted-foreground text-center'>
                  Manually select supplier and products
                </span>
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Mode: From Sales Return ── */}
      {mode === 'fromSalesReturn' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Approved Customer Return</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3'>
            {!selectedSalesReturn ? (
              <div className='relative'>
                <Input
                  placeholder='Search customer returns by return number or customer...'
                  value={srSearch}
                  onChange={(e) => setSrSearch(e.target.value)}
                />
                {salesReturnsData?.results && salesReturnsData.results.length > 0 && (
                  <div className='absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg'>
                    {salesReturnsData.results.map((sr) => (
                      <button
                        key={sr._id || sr.id}
                        className='w-full px-4 py-3 text-left text-sm hover:bg-muted border-b last:border-0'
                        onClick={() => handleSelectSalesReturn(sr)}
                      >
                        <div className='flex items-center justify-between'>
                          <span className='font-medium'>{sr.returnNumber}</span>
                          <Badge className='bg-green-100 text-green-800 text-xs'>
                            {sr.status}
                          </Badge>
                        </div>
                        <div className='text-muted-foreground'>
                          {sr.customerName ||
                            (typeof sr.customerId === 'object'
                              ? (sr.customerId as any)?.name
                              : 'Unknown Customer')}
                          {' — '}
                          {sr.items.length} item(s) — PKR {sr.totalAmount.toLocaleString()}
                        </div>
                        <div className='text-xs text-muted-foreground'>
                          Reason: {sr.reason || '—'}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {salesReturnsData?.results?.length === 0 && srSearch && (
                  <p className='mt-2 text-sm text-muted-foreground'>No approved returns found</p>
                )}
              </div>
            ) : (
              <div className='rounded-md border p-3 space-y-1'>
                <div className='flex items-center justify-between'>
                  <span className='font-medium'>{selectedSalesReturn.returnNumber}</span>
                  <Button
                    variant='outline'
                    size='sm'
                    onClick={() => {
                      setSelectedSalesReturn(null)
                      setReturnItems([])
                    }}
                  >
                    Change
                  </Button>
                </div>
                <p className='text-sm text-muted-foreground'>
                  Customer:{' '}
                  {selectedSalesReturn.customerName ||
                    (typeof selectedSalesReturn.customerId === 'object'
                      ? (selectedSalesReturn.customerId as any)?.name
                      : 'Unknown')}
                </p>
                <p className='text-sm'>
                  {selectedSalesReturn.items.length} item(s) — PKR{' '}
                  {selectedSalesReturn.totalAmount.toLocaleString()}
                </p>
                {selectedSalesReturn.reason && (
                  <p className='text-sm text-muted-foreground'>
                    Reason: {selectedSalesReturn.reason}
                  </p>
                )}
              </div>
            )}

            {/* Supplier selector for sales-return mode */}
            {selectedSalesReturn && (
              <div className='space-y-2 mt-3'>
                <Label>Select Supplier to Return To</Label>
                <SupplierPopover
                  suppliers={filteredSuppliers}
                  selectedId={selectedSupplierId}
                  selectedName={selectedSupplierName}
                  open={supplierPopoverOpen}
                  searchQuery={supplierSearchQuery}
                  onOpenChange={setSupplierPopoverOpen}
                  onSearchChange={setSupplierSearchQuery}
                  onSelect={(s) => {
                    setSelectedSupplierId(s._id || s.id)
                    setSelectedSupplierName(s.name)
                    setSupplierPopoverOpen(false)
                    setSupplierSearchQuery('')
                  }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Mode: From Purchase Invoice ── */}
      {mode === 'fromPurchase' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Purchase Invoice</CardTitle>
          </CardHeader>
          <CardContent>
            {!selectedPurchase ? (
              <div className='relative'>
                <Input
                  placeholder='Search by purchase number, supplier...'
                  value={purchaseSearch}
                  onChange={(e) => setPurchaseSearch(e.target.value)}
                />
                {purchasesData?.results && purchasesData.results.length > 0 && purchaseSearch && (
                  <div className='absolute z-10 mt-1 w-full rounded-md border bg-background shadow-lg'>
                    {purchasesData.results.map((p: any) => (
                      <button
                        key={p._id || p.id}
                        className='w-full px-4 py-2 text-left text-sm hover:bg-muted'
                        onClick={() => handleSelectPurchase(p)}
                      >
                        <span className='font-medium'>{p.purchaseNumber || p.invoiceNumber}</span>
                        {' — '}
                        <span className='text-muted-foreground'>
                          {p.supplier?.name || p.supplierName || 'Unknown Supplier'}
                        </span>
                        {' — '}
                        <span>PKR {(p.totalAmount ?? p.total ?? 0).toLocaleString()}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className='flex items-center justify-between rounded-md border p-3'>
                <div>
                  <p className='font-medium'>
                    {selectedPurchase.purchaseNumber || selectedPurchase.invoiceNumber}
                  </p>
                  <p className='text-sm text-muted-foreground'>
                    {selectedPurchase.supplier?.name ||
                      selectedPurchase.supplierName ||
                      'Unknown Supplier'}
                  </p>
                  <p className='text-sm'>
                    Total: PKR{' '}
                    {(selectedPurchase.totalAmount ?? selectedPurchase.total ?? 0).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => {
                    setSelectedPurchase(null)
                    setLinkedPurchaseId(null)
                    setReturnItems([])
                    setSelectedSupplierId('')
                  }}
                >
                  Change
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Mode: Free Form ── */}
      {mode === 'freeForm' && (
        <Card>
          <CardHeader>
            <CardTitle>Select Supplier</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* Supplier picker */}
            <div className='space-y-2'>
              <Label>Supplier <span className='text-destructive'>*</span></Label>
              <SupplierPopover
                suppliers={filteredSuppliers}
                selectedId={selectedSupplierId}
                selectedName={selectedSupplierName}
                open={supplierPopoverOpen}
                searchQuery={supplierSearchQuery}
                onOpenChange={setSupplierPopoverOpen}
                onSearchChange={setSupplierSearchQuery}
                onSelect={(s) => {
                  setSelectedSupplierId(s._id || s.id)
                  setSelectedSupplierName(s.name)
                  setSupplierPopoverOpen(false)
                  setSupplierSearchQuery('')
                }}
              />
            </div>

            {/* Product picker — only shown after supplier is selected */}
            {selectedSupplierId && (
              <div className='space-y-2'>
                <Label>Add Product</Label>
                <Popover open={productPopoverOpen} onOpenChange={(o) => { setProductPopoverOpen(o); if (!o) setProductSearchQuery('') }}>
                  <PopoverTrigger asChild>
                    <Button variant='outline' className='w-full justify-between'>
                      <div className='flex items-center gap-2'>
                        <Search className='h-4 w-4 text-muted-foreground' />
                        <span className='text-muted-foreground'>Search product by name or barcode...</span>
                      </div>
                      <ChevronDown className='h-4 w-4 opacity-50' />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className='w-[480px] p-0' align='start'>
                    <Command>
                      <CommandInput
                        placeholder='Search products...'
                        value={productSearchQuery}
                        onValueChange={setProductSearchQuery}
                      />
                      <CommandEmpty>No products found.</CommandEmpty>
                      <CommandGroup className='max-h-72 overflow-auto'>
                        {filteredProducts.map((p: any) => (
                          <CommandItem
                            key={p._id || p.id}
                            onSelect={() => handleAddProduct(p)}
                            className='flex items-center gap-3 cursor-pointer'
                          >
                            {p.image?.url ? (
                              <img src={p.image.url} alt={p.name} className='h-9 w-9 rounded object-cover' />
                            ) : (
                              <div className='flex h-9 w-9 items-center justify-center rounded bg-muted'>
                                <Package className='h-4 w-4 text-muted-foreground' />
                              </div>
                            )}
                            <div className='flex-1 min-w-0'>
                              <p className='truncate font-medium'>{p.name}</p>
                              {p.barcode && <p className='text-xs text-muted-foreground'>{p.barcode}</p>}
                              <p className='text-xs text-muted-foreground'>
                                Stock: {p.stockQuantity ?? 0} · Cost: PKR {(p.cost ?? p.costPrice ?? 0).toLocaleString()}
                              </p>
                            </div>
                            <Check className='h-4 w-4 opacity-0 group-data-[selected]:opacity-100' />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Items Table ── */}
      {returnItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Return Items</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  {mode !== 'freeForm' && <TableHead>Max Qty</TableHead>}
                  <TableHead>Return Qty</TableHead>
                  <TableHead>Cost Price</TableHead>
                  <TableHead>Total</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returnItems.map((item, index) => (
                  <TableRow key={index}>
                    <TableCell>{item.name}</TableCell>
                    {mode !== 'freeForm' && (
                      <TableCell className='text-muted-foreground'>{item.maxQuantity}</TableCell>
                    )}
                    <TableCell>
                      <div className='flex items-center gap-2'>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => updateQuantity(index, -1)}
                        >
                          <Minus className='h-3 w-3' />
                        </Button>
                        <span className='w-8 text-center'>{item.quantity}</span>
                        <Button
                          variant='outline'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => updateQuantity(index, 1)}
                        >
                          <Plus className='h-3 w-3' />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {mode === 'freeForm' ? (
                        <Input
                          type='number'
                          min={0}
                          className='w-28 h-8'
                          value={item.costPrice}
                          onChange={(e) => updateCostPrice(index, Number(e.target.value))}
                        />
                      ) : (
                        <span>PKR {item.costPrice.toLocaleString()}</span>
                      )}
                    </TableCell>
                    <TableCell>PKR {item.total.toLocaleString()}</TableCell>
                    <TableCell>
                      <Button
                        variant='ghost'
                        size='icon'
                        className='h-7 w-7 text-destructive'
                        onClick={() => removeItem(index)}
                      >
                        <Trash2 className='h-3 w-3' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className='mt-4 text-right text-lg font-semibold'>
              Total Return: PKR {totalAmount.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Refund Details ── */}
      {hasSource && (
        <Card>
          <CardHeader>
            <CardTitle>Refund Details</CardTitle>
          </CardHeader>
          <CardContent className='space-y-4'>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-2'>
                <Label>Refund Method</Label>
                <Select
                  value={refundMethod}
                  onValueChange={(v) => setRefundMethod(v as typeof refundMethod)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='cash'>Cash</SelectItem>
                    <SelectItem value='bank'>Bank Transfer</SelectItem>
                    <SelectItem value='adjustment'>Balance Adjustment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-2'>
                <Label>Reason (optional)</Label>
                <Input
                  placeholder='e.g. Wrong product received'
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </div>
            <div className='space-y-2'>
              <Label>Damage Description (optional)</Label>
              <Textarea
                placeholder='Describe any damage or condition...'
                value={damageDescription}
                onChange={(e) => setDamageDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div className='flex justify-end gap-3'>
              <Button variant='outline' onClick={onBack}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={
                  isLoading ||
                  returnItems.length === 0 ||
                  !getEffectiveSupplierId()
                }
              >
                {isLoading ? 'Submitting...' : 'Submit Return'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}


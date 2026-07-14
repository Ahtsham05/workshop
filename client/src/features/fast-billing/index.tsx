import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import type { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { Layers, Package, Trash2, Zap } from 'lucide-react'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useCreateInvoiceMutation } from '@/stores/invoice.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetSize } from '@/features/invoice/utils/paper-format'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import {
  loadFastBillWorkspace,
  saveFastBillWorkspace,
  clearFastBillWorkspace,
  listFastBillHeld,
  pushFastBillHeld,
  removeFastBillHeld,
  newHoldId,
  type FastBillHeldRecord,
} from '@/lib/pos-hold-storage'
import { BarcodeScanInput, type BarcodeScanInputHandle } from './components/barcode-scan-input'
import { ProductQuickGrid } from './components/product-quick-grid'
import { CartPanel } from './components/cart-panel'
import { PaymentPanel } from './components/payment-panel'
import { HeldCartsSheet } from './components/held-carts-sheet'
import { AddToCartDialog } from './components/add-to-cart-dialog'
import { playBeep } from './utils/beep'
import { buildInvoicePayload, computeCartSubtotal, type FastBillCustomer } from './utils/build-invoice-payload'
import { buildReceiptData } from './utils/build-receipt-data'
import { catalogItemToCartLine, cartLineKey, type CartLine, type PaymentMethod } from './types'
import { parseQuantityPrefix } from './utils/quantity-prefix'

const MAX_RECENT_ITEMS = 10

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading, retriggering memo/effect recompute on
// every render (see the same fix in features/invoice/index.tsx and purchase-invoice/index.tsx).
const EMPTY_CATALOG: PurchaseCatalogItem[] = []

export default function FastBillingPage() {
  const { data: catalog = EMPTY_CATALOG } = useGetPurchasableCatalogQuery()
  const [createInvoice, { isLoading: charging }] = useCreateInvoiceMutation()
  const scanInputRef = useRef<BarcodeScanInputHandle>(null)

  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !activeBranchId })
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  const [cart, setCart] = useState<CartLine[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [customer, setCustomer] = useState<FastBillCustomer>(null)
  const [walkInCustomerName, setWalkInCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discount, setDiscount] = useState(0)
  const [paidAmount, setPaidAmount] = useState(0)
  const [heldOpen, setHeldOpen] = useState(false)
  const [held, setHeld] = useState<FastBillHeldRecord[]>([])
  const [lastAddedKey, setLastAddedKey] = useState<string | null>(null)
  const [recentItems, setRecentItems] = useState<PurchaseCatalogItem[]>([])
  const [dialogItem, setDialogItem] = useState<PurchaseCatalogItem | null>(null)

  const restoredRef = useRef(false)
  useEffect(() => {
    if (restoredRef.current) return
    restoredRef.current = true
    const ws = loadFastBillWorkspace()
    if (ws) {
      setCart((ws.cart as unknown as CartLine[]) || [])
      setCustomer(ws.customerId ? { id: ws.customerId, name: ws.customerName } : null)
      setPaymentMethod((ws.paymentMethod as PaymentMethod) || 'cash')
      setDiscount(ws.discount || 0)
      setPaidAmount(ws.paidAmount || 0)
    }
    setHeld(listFastBillHeld())
  }, [])

  useEffect(() => {
    saveFastBillWorkspace({
      cart: cart as unknown as Record<string, unknown>[],
      customerId: customer?.id ?? null,
      customerName: customer?.name ?? '',
      paymentMethod,
      discount,
      paidAmount,
    })
  }, [cart, customer, paymentMethod, discount, paidAmount])

  const subtotal = computeCartSubtotal(cart)
  const total = Math.max(0, subtotal - discount)

  useEffect(() => {
    if (paymentMethod !== 'credit') setPaidAmount(total)
  }, [total, paymentMethod])

  const barcodeIndex = useMemo(() => {
    const map = new Map<string, PurchaseCatalogItem>()
    for (const item of catalog) {
      if (item.barcode) map.set(item.barcode.trim().toLowerCase(), item)
    }
    return map
  }, [catalog])

  const addToCart = useCallback((item: PurchaseCatalogItem, quantity = 1, unitPrice?: number) => {
    if (item.stockQuantity <= 0) {
      toast.error(`${item.name} is out of stock`)
      playBeep('error')
      return
    }
    const key = cartLineKey(item)
    setCart((prev) => {
      const existing = prev.find((l) => l.key === key)
      if (existing) {
        return prev.map((l) =>
          l.key === key
            ? { ...l, quantity: l.quantity + quantity, unitPrice: unitPrice ?? l.unitPrice }
            : l,
        )
      }
      return [...prev, catalogItemToCartLine(item, quantity, unitPrice)]
    })
    setLastAddedKey(key)
    setRecentItems((prev) => [item, ...prev.filter((p) => cartLineKey(p) !== key)].slice(0, MAX_RECENT_ITEMS))
    playBeep('success')
  }, [])

  useEffect(() => {
    if (!lastAddedKey) return
    const t = setTimeout(() => setLastAddedKey(null), 900)
    return () => clearTimeout(t)
  }, [lastAddedKey])

  const openAddDialog = useCallback((item: PurchaseCatalogItem) => {
    setDialogItem(item)
  }, [])

  const closeAddDialog = useCallback(() => {
    setDialogItem(null)
    scanInputRef.current?.focus()
  }, [])

  const confirmAddDialog = useCallback(
    (item: PurchaseCatalogItem, quantity: number, unitPrice: number) => {
      addToCart(item, quantity, unitPrice)
      setDialogItem(null)
      scanInputRef.current?.focus()
    },
    [addToCart],
  )

  const handleScanSubmit = useCallback(
    (rawValue: string) => {
      const { quantity, rest } = parseQuantityPrefix(rawValue)
      const exact = barcodeIndex.get(rest.trim().toLowerCase())
      if (exact) {
        addToCart(exact, quantity)
        return
      }
      const q = rest.trim().toLowerCase()
      const nameMatches = catalog.filter(
        (p) => p.name?.toLowerCase().includes(q) || p.nameUrdu?.toLowerCase().includes(q),
      )
      if (nameMatches.length === 1) {
        addToCart(nameMatches[0], quantity)
        return
      }
      if (nameMatches.length > 1) {
        setSearchTerm(rest)
        toast.message(`${nameMatches.length} products match "${rest}" — pick one below`)
        return
      }
      playBeep('error')
      toast.error(`No product found for "${rest}"`)
    },
    [barcodeIndex, catalog, addToCart],
  )

  const updateQuantity = useCallback((key: string, quantity: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)))
  }, [])

  const updatePrice = useCallback((key: string, unitPrice: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, unitPrice } : l)))
  }, [])

  const removeLine = useCallback((key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }, [])

  const resetSale = useCallback(() => {
    setCart([])
    setCustomer(null)
    setWalkInCustomerName('')
    setPaymentMethod('cash')
    setDiscount(0)
    setPaidAmount(0)
    clearFastBillWorkspace()
    scanInputRef.current?.focus()
  }, [])

  const holdCurrentCart = useCallback(() => {
    if (cart.length === 0) {
      toast.error('Cart is empty — nothing to hold')
      return
    }
    pushFastBillHeld({
      id: newHoldId(),
      label: customer ? customer.name : walkInCustomerName || `Sale ${new Date().toLocaleTimeString()}`,
      savedAt: Date.now(),
      snapshot: {
        cart: cart as unknown as Record<string, unknown>[],
        customerId: customer?.id ?? null,
        customerName: customer?.name ?? '',
        paymentMethod,
        discount,
        paidAmount,
      },
    })
    setHeld(listFastBillHeld())
    resetSale()
    toast.success('Cart held')
  }, [cart, customer, walkInCustomerName, paymentMethod, discount, paidAmount, resetSale])

  const resumeHeld = useCallback((record: FastBillHeldRecord) => {
    setCart((record.snapshot.cart as unknown as CartLine[]) || [])
    setCustomer(record.snapshot.customerId ? { id: record.snapshot.customerId, name: record.snapshot.customerName } : null)
    setPaymentMethod((record.snapshot.paymentMethod as PaymentMethod) || 'cash')
    setDiscount(record.snapshot.discount || 0)
    setPaidAmount(record.snapshot.paidAmount || 0)
    removeFastBillHeld(record.id)
    setHeld(listFastBillHeld())
    setHeldOpen(false)
    toast.success('Cart resumed')
  }, [])

  const deleteHeld = useCallback((id: string) => {
    removeFastBillHeld(id)
    setHeld(listFastBillHeld())
  }, [])

  const handleCharge = useCallback(async () => {
    if (cart.length === 0) return
    try {
      const payload = buildInvoicePayload({ cart, customer, walkInCustomerName, paymentMethod, discount, paidAmount })
      const result = await createInvoice(payload).unwrap()
      playBeep('success')
      toast.success(`Invoice ${result.invoiceNumber} created`)

      const receiptData = buildReceiptData({
        invoiceNumber: result.invoiceNumber,
        cart,
        customer,
        walkInCustomerName,
        paymentMethod,
        discount,
        paidAmount,
      })
      receiptData.printInUrdu = getInvoicePrintInUrdu()
      receiptData.companyName = orgData?.name || branchData?.name
      receiptData.companyAddress =
        [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
          .filter(Boolean)
          .join(', ') || undefined
      receiptData.companyPhone = branchData?.phone
      receiptData.companyLogo = orgData?.logo?.url

      const paperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
      if (PAPER_FORMATS[paperSize].family === 'thermal') {
        openPrintWindowForFormat(generateInvoiceHTML(receiptData, resolveThermalSize(paperSize)), paperSize)
      } else {
        openPrintWindowForFormat(generateA4InvoiceHTML(receiptData, resolveSheetSize(paperSize)), paperSize)
      }

      resetSale()
    } catch (error) {
      playBeep('error')
      const message = (error as { data?: { message?: string } })?.data?.message || 'Failed to create invoice'
      toast.error(message)
    }
  }, [
    cart,
    customer,
    walkInCustomerName,
    paymentMethod,
    discount,
    paidAmount,
    createInvoice,
    resetSale,
    orgData,
    branchData,
  ])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        void handleCharge()
        return
      }
      // Alt-accelerators — Alt is never part of normal typing, so these are safe to fire
      // globally without checking what's focused, letting the whole flow run keyboard-only.
      if (!e.altKey) return
      switch (e.key) {
        case '1':
          e.preventDefault()
          setPaymentMethod('cash')
          break
        case '2':
          e.preventDefault()
          setPaymentMethod('card')
          break
        case '3':
          if (customer) {
            e.preventDefault()
            setPaymentMethod('credit')
          }
          break
        case 'h':
        case 'H':
          e.preventDefault()
          holdCurrentCart()
          break
        case 'l':
        case 'L':
          e.preventDefault()
          setHeldOpen((o) => !o)
          break
        case 'x':
        case 'X':
          e.preventDefault()
          resetSale()
          break
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [handleCharge, customer, holdCurrentCart, resetSale])

  return (
    <div className='flex flex-col'>
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm'>
            <Zap className='h-5 w-5' />
          </span>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>Fast Billing</h1>
            <p className='text-xs text-muted-foreground'>
              Type <span className='font-mono'>3*</span> for qty 3 · ↑↓ + Enter to pick · Alt+1/2/3 payment ·
              Alt+H hold · Alt+L held · Ctrl+Enter charge
            </p>
          </div>
        </div>
        <div className='flex items-center gap-2'>
          {cart.length > 0 && (
            <div className='mr-1 hidden items-baseline gap-1.5 rounded-lg border border-primary/20 bg-background/80 px-3 py-1.5 shadow-sm sm:flex'>
              <span className='text-xs text-muted-foreground'>{cart.length} items</span>
              <span className='text-base font-bold tabular-nums text-primary'>Rs{total.toFixed(0)}</span>
            </div>
          )}
          <Button type='button' variant='outline' size='sm' onClick={() => setHeldOpen(true)} title='Alt+L'>
            <Layers className='mr-1.5 h-3.5 w-3.5' />
            Held {held.length > 0 && `(${held.length})`}
          </Button>
          <Button
            type='button'
            variant='outline'
            size='sm'
            onClick={holdCurrentCart}
            disabled={cart.length === 0}
            title='Alt+H'
          >
            Hold Cart
          </Button>
          <Button
            type='button'
            variant='ghost'
            size='sm'
            className='text-muted-foreground hover:text-destructive'
            onClick={resetSale}
            disabled={cart.length === 0}
            title='Alt+X'
          >
            <Trash2 className='mr-1.5 h-3.5 w-3.5' />
            Clear
          </Button>
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-12'>
        <div className='flex flex-col gap-3 xl:col-span-7'>
          <BarcodeScanInput
            ref={scanInputRef}
            catalog={catalog}
            onScanSubmit={handleScanSubmit}
            onSelectSuggestion={openAddDialog}
          />
          {recentItems.length > 0 && (
            <div className='flex shrink-0 items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
              <span className='shrink-0 text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
                Repeat
              </span>
              {recentItems.map((item) => (
                <button
                  key={cartLineKey(item)}
                  type='button'
                  onClick={() => addToCart(item, 1)}
                  className='flex shrink-0 items-center gap-1.5 rounded-full border border-border/70 bg-card py-1 pl-1 pr-2.5 text-xs font-medium shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5'
                >
                  <span className='flex h-5 w-5 items-center justify-center overflow-hidden rounded-full bg-muted'>
                    {item.image?.url ? (
                      <img src={item.image.url} alt='' className='h-full w-full object-cover' />
                    ) : (
                      <Package className='h-2.5 w-2.5 text-muted-foreground/60' />
                    )}
                  </span>
                  <span className='max-w-[100px] truncate'>{item.name}</span>
                </button>
              ))}
            </div>
          )}
          <ProductQuickGrid
            products={catalog}
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
            onRequestAdd={openAddDialog}
          />
        </div>

        <div className='flex flex-col gap-3 xl:col-span-5'>
          <div className='flex max-h-[min(420px,calc(100vh-460px))] min-h-[140px] flex-col rounded-xl border border-border/60 bg-card p-3 shadow-md'>
            <h2 className='mb-2 shrink-0 text-sm font-semibold tracking-tight'>Cart ({cart.length})</h2>
            <CartPanel
              cart={cart}
              onQuantityChange={updateQuantity}
              onPriceChange={updatePrice}
              onRemove={removeLine}
              highlightKey={lastAddedKey}
            />
          </div>

          <div className='sticky bottom-3 z-10 rounded-xl border border-border/60 bg-card p-3 shadow-xl'>
            <PaymentPanel
              subtotal={subtotal}
              discount={discount}
              onDiscountChange={setDiscount}
              total={total}
              paymentMethod={paymentMethod}
              onPaymentMethodChange={setPaymentMethod}
              customer={customer}
              onCustomerChange={setCustomer}
              walkInCustomerName={walkInCustomerName}
              onWalkInCustomerNameChange={setWalkInCustomerName}
              paidAmount={paidAmount}
              onPaidAmountChange={setPaidAmount}
              itemCount={cart.length}
              onCharge={handleCharge}
              charging={charging}
            />
          </div>
        </div>
      </div>

      <HeldCartsSheet open={heldOpen} onOpenChange={setHeldOpen} held={held} onResume={resumeHeld} onDelete={deleteHeld} />
      <AddToCartDialog item={dialogItem} onClose={closeAddDialog} onConfirm={confirmAddDialog} />
    </div>
  )
}

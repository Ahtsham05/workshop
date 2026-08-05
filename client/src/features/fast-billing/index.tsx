import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { useSelector } from 'react-redux'
import { Link } from '@tanstack/react-router'
import type { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { ArrowLeftRight, History, Layers, Package, Receipt, ShoppingCart, Trash2, Zap } from 'lucide-react'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { useCreateInvoiceMutation } from '@/stores/invoice.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { ImeiEntryInput, ImeiRecord } from '@/stores/imei.api'
import { autoAllocateBatches, type BatchAllocation } from '@/lib/batch-allocation'
import { entryImei, SerialNumberDialog } from '@/components/serial-batch-line-controls'
import { generateInvoiceHTML, generateA4InvoiceHTML, openPrintWindowForFormat } from '@/features/invoice/utils/print-utils'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetFormat } from '@/features/invoice/utils/paper-format'
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
import { CartPanel } from './components/cart-panel'
import { PaymentPanel } from './components/payment-panel'
import { HeldCartsSheet } from './components/held-carts-sheet'
import { AddToCartDialog } from './components/add-to-cart-dialog'
import { playBeep } from './utils/beep'
import { buildInvoicePayload, computeCartSubtotal, computeCartItemDiscountTotal, type FastBillCustomer } from './utils/build-invoice-payload'
import { buildReceiptData } from './utils/build-receipt-data'
import { catalogItemToCartLine, cartLineKey, type CartLine, type PaymentMethod } from './types'
import { parseQuantityPrefix } from './utils/quantity-prefix'
import { computeDiscountAmount, type DiscountType } from '@/lib/discount'

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
  const [customer, setCustomer] = useState<FastBillCustomer>(null)
  const [walkInCustomerName, setWalkInCustomerName] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [discountType, setDiscountType] = useState<DiscountType>('fixed')
  const [discountValue, setDiscountValue] = useState(0)
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
      setDiscountType((ws.discountType as DiscountType) || 'fixed')
      setDiscountValue(ws.discountValue || 0)
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
      discountType,
      discountValue,
      paidAmount,
    })
  }, [cart, customer, paymentMethod, discountType, discountValue, paidAmount])

  const subtotal = computeCartSubtotal(cart)
  const itemDiscountTotal = computeCartItemDiscountTotal(cart)
  const discount = computeDiscountAmount(subtotal, discountType, discountValue)
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

  // Live lookup from a cart line's key back to its catalog entry — batches and stock
  // change as other sales go through, so cart lines never cache their own copy; they
  // always read the current one from here (mirrors invoice-panel's sellableCatalog.find).
  const catalogByKey = useMemo(() => {
    const map = new Map<string, PurchaseCatalogItem>()
    for (const item of catalog) map.set(cartLineKey(item), item)
    return map
  }, [catalog])

  // Which cart line's IMEI/serial picker is open — '' means none.
  const [serialDialogKey, setSerialDialogKey] = useState<string>('')

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
    // Every add either creates a fresh line with 0 picked, or bumps quantity past
    // whatever was already picked — either way the line now needs at least one more
    // serial/IMEI, so the picker always opens right after a scan/click and the flow
    // stays scan → pick → next scan without an extra step.
    if (item.trackImei || item.trackSerial) setSerialDialogKey(key)
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
  }, [])

  const confirmAddDialog = useCallback(
    (item: PurchaseCatalogItem, quantity: number, unitPrice: number) => {
      addToCart(item, quantity, unitPrice)
      setDialogItem(null)
    },
    [addToCart],
  )

  const focusScanInput = useCallback(() => {
    scanInputRef.current?.focus()
  }, [])

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
        scanInputRef.current?.setValue(rest)
        toast.message(`${nameMatches.length} products match "${rest}" — pick one below`)
        return
      }
      playBeep('error')
      toast.error(`No product found for "${rest}"`)
    },
    [barcodeIndex, catalog, addToCart],
  )

  // Batch-tracked lines try the currently-selected batch first — a quantity that fits
  // inside it alone stays a plain single-batch line, exactly as before. Only when it
  // falls short does this draw the remainder from the other batches in FEFO order,
  // auto-suggesting a split rather than blocking the increase outright. Mirrors
  // features/invoice/index.tsx's updateQuantity variant/batch branch.
  const updateQuantity = useCallback((key: string, quantity: number) => {
    const currentItem = cart.find((l) => l.key === key)
    if (currentItem?.variantId && (currentItem.trackBatch || currentItem.trackExpiry)) {
      const catalogEntry = catalogByKey.get(key)
      const batches = catalogEntry?.batches ?? []
      let nextBatchId = currentItem.batchId
      let nextBatchNumber = currentItem.batchNumber
      let nextBatchAllocations: BatchAllocation[] | undefined

      if (batches.length > 0) {
        const primaryBatch = currentItem.batchId ? batches.find((b) => b.id === currentItem.batchId) : undefined
        if (primaryBatch && quantity <= primaryBatch.quantity) {
          nextBatchAllocations = undefined
        } else {
          const orderedBatches = primaryBatch ? [primaryBatch, ...batches.filter((b) => b.id !== primaryBatch.id)] : batches
          const { allocations, remaining } = autoAllocateBatches(orderedBatches, quantity)
          if (remaining > 0) {
            toast.error(`${currentItem.name} - Only ${quantity - remaining} unit(s) available across all batches`)
            return
          }
          nextBatchAllocations = allocations.length > 1 ? allocations : undefined
          if (allocations.length > 0) {
            nextBatchId = allocations[0].batchId
            nextBatchNumber = allocations[0].batchNumber
          }
        }
      } else {
        const available = catalogEntry?.stockQuantity ?? 0
        if (quantity > available) {
          toast.error(`${currentItem.name} - Only ${available} unit(s) available`)
          return
        }
      }

      setCart((prev) =>
        prev.map((l) =>
          l.key === key
            ? { ...l, quantity, batchId: nextBatchId, batchNumber: nextBatchNumber, batchAllocations: nextBatchAllocations }
            : l,
        ),
      )
      return
    }

    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)))
  }, [cart, catalogByKey])

  const updatePrice = useCallback((key: string, unitPrice: number) => {
    setCart((prev) => prev.map((l) => (l.key === key ? { ...l, unitPrice } : l)))
  }, [])

  // Switching which batch a line deducts from — different batches can have been bought
  // at, and intended to sell for, different prices, so this swaps both cost AND sale
  // price to match the picked batch. Mirrors invoice-panel.tsx's updateItemBatch.
  const updateItemBatch = useCallback(
    (key: string, batchId: string, batchNumber: string, availableQuantity: number, costPerUnit?: number, sellingPrice?: number, basePrice?: number) => {
      const currentItem = cart.find((l) => l.key === key)
      if (currentItem && availableQuantity > 0 && availableQuantity < currentItem.quantity) {
        toast.error(`${currentItem.name} - quantity reduced to ${availableQuantity} to match batch ${batchNumber}'s available stock`)
      }
      setCart((prev) =>
        prev.map((line) => {
          if (line.key !== key) return line
          const cost = costPerUnit ?? line.cost
          const unitPrice = sellingPrice ?? basePrice ?? line.unitPrice
          const quantity = availableQuantity > 0 ? Math.min(line.quantity, availableQuantity) : line.quantity
          return { ...line, batchId, batchNumber, cost, unitPrice, quantity, batchAllocations: undefined }
        }),
      )
    },
    [cart],
  )

  // Shared recompute for editing a line's batch split — quantity is always just the sum
  // of the allocation rows, so editing one grows/shrinks the line rather than needing to
  // be rebalanced against a fixed target. Collapses back to a plain single-batch line the
  // moment only one row is left. Mirrors invoice-panel.tsx's applyBatchAllocations.
  const applyBatchAllocations = useCallback((key: string, compute: (current: BatchAllocation[]) => BatchAllocation[]) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        const current: BatchAllocation[] = line.batchAllocations
          ?? (line.batchId ? [{ batchId: line.batchId, batchNumber: line.batchNumber || '', quantity: line.quantity }] : [])
        const next = compute(current).filter((a) => a.quantity > 0)
        const totalQty = next.reduce((sum, a) => sum + a.quantity, 0)
        const only = next.length <= 1 ? next[0] : undefined
        return {
          ...line,
          quantity: totalQty,
          batchId: only ? only.batchId : (next[0]?.batchId ?? line.batchId),
          batchNumber: only ? only.batchNumber : (next[0]?.batchNumber ?? line.batchNumber),
          batchAllocations: only ? undefined : next,
        }
      }),
    )
  }, [])

  const updateAllocationQuantity = useCallback((key: string, batchId: string, newQty: number) => {
    applyBatchAllocations(key, (current) => current.map((a) => (a.batchId === batchId ? { ...a, quantity: newQty } : a)))
  }, [applyBatchAllocations])

  const addBatchToSplit = useCallback((key: string, batch: { id: string; batchNumber: string }) => {
    applyBatchAllocations(key, (current) =>
      current.some((a) => a.batchId === batch.id) ? current : [...current, { batchId: batch.id, batchNumber: batch.batchNumber, quantity: 1 }],
    )
  }, [applyBatchAllocations])

  // When a serial-tracked + batch-tracked line's picked serials change, re-derive the
  // batch split from what was actually picked — each serial belongs to exactly one real
  // batch (or none, for legacy/opening stock), so the allocation follows the seller's
  // serial choices instead of risking a mismatch the backend would reject. Mirrors
  // invoice-panel.tsx's updateItemImeis.
  const updateItemImeis = useCallback((key: string, nextImeis: ImeiEntryInput[], records: ImeiRecord[]) => {
    setCart((prev) =>
      prev.map((line) => {
        if (line.key !== key) return line
        if (!line.variantId) {
          const patch: Partial<CartLine> = { imeis: nextImeis }
          // A single-unit line with no meaningful product price (price 0) has nothing
          // sensible to default to — once the specific unit is picked, back price/name in
          // from its own record instead. Freely editable afterwards either way.
          if (nextImeis.length === 1 && line.quantity === 1) {
            const record = records.find((r) => r.imei === entryImei(nextImeis[0]))
            if (record) {
              if (record.askingPrice && line.unitPrice === 0) patch.unitPrice = record.askingPrice
              if (record.brand || record.model) patch.name = [record.brand, record.model].filter(Boolean).join(' ')
            }
          }
          return { ...line, ...patch }
        }

        const catalogEntry = catalogByKey.get(line.key)
        const batches = catalogEntry?.batches ?? []
        if (batches.length === 0) return { ...line, imeis: nextImeis }

        const batchIdByImei = new Map<string, string | null>(
          records.map((r) => [r.imei, (typeof r.batchId === 'string' ? r.batchId : r.batchId?.id) || null]),
        )
        const knownCounts = new Map<string, number>()
        nextImeis.forEach((entry) => {
          const bId = batchIdByImei.get(entryImei(entry))
          if (bId) knownCounts.set(bId, (knownCounts.get(bId) || 0) + 1)
        })

        const currentAllocations: BatchAllocation[] = line.batchAllocations
          ?? (line.batchId ? [{ batchId: line.batchId, batchNumber: line.batchNumber || '', quantity: line.quantity }] : [])

        const orderedBatchIds = [...new Set([...currentAllocations.map((a) => a.batchId), ...knownCounts.keys()])]
        const next: BatchAllocation[] = orderedBatchIds.map((batchId) => ({
          batchId,
          batchNumber: currentAllocations.find((a) => a.batchId === batchId)?.batchNumber
            ?? batches.find((b) => b.id === batchId)?.batchNumber ?? '',
          quantity: knownCounts.get(batchId) ?? 0,
        }))

        let leftover = Math.max(0, line.quantity - next.reduce((sum, a) => sum + a.quantity, 0))
        for (const alloc of next) {
          if (leftover <= 0) break
          const cap = batches.find((b) => b.id === alloc.batchId)?.quantity ?? Infinity
          const take = Math.min(Math.max(0, cap - alloc.quantity), leftover)
          alloc.quantity += take
          leftover -= take
        }
        if (leftover > 0) {
          for (const b of batches.filter((b) => b.quantity > 0 && !next.some((a) => a.batchId === b.id))) {
            if (leftover <= 0) break
            const take = Math.min(b.quantity, leftover)
            next.push({ batchId: b.id, batchNumber: b.batchNumber, quantity: take })
            leftover -= take
          }
        }

        const finalAllocations = next.filter((a) => a.quantity > 0)
        const only = finalAllocations.length <= 1 ? finalAllocations[0] : undefined
        return {
          ...line,
          imeis: nextImeis,
          batchId: only ? only.batchId : (finalAllocations[0]?.batchId ?? line.batchId),
          batchNumber: only ? only.batchNumber : (finalAllocations[0]?.batchNumber ?? line.batchNumber),
          batchAllocations: only ? undefined : finalAllocations,
        }
      }),
    )
  }, [catalogByKey])

  // Update one line's discount (type and/or raw value) — a customer discount on that
  // specific product, on top of any overall-sale discount. Mirrors invoice/purchase-invoice's
  // updateItemDiscount.
  const updateItemDiscount = useCallback((key: string, patch: { type?: DiscountType; value?: number }) => {
    setCart((prev) =>
      prev.map((l) =>
        l.key === key
          ? {
              ...l,
              discountType: patch.type ?? l.discountType ?? 'fixed',
              discountValue: patch.value ?? l.discountValue ?? 0,
            }
          : l,
      ),
    )
  }, [])

  // Flip both the overall discount and every line item's discount to the other unit in
  // one click — re-deriving each raw value so the actual Rs discounted stays the same,
  // it's just entered/displayed in the new unit. Mirrors invoice/purchase-invoice's
  // toggleAllDiscountTypes.
  const toggleAllDiscountTypes = useCallback(() => {
    setDiscountType((prevType) => {
      const targetType: DiscountType = prevType === 'percentage' ? 'fixed' : 'percentage'

      setCart((prev) =>
        prev.map((line) => {
          const gross = line.unitPrice * line.quantity
          const currentAmount = computeDiscountAmount(gross, line.discountType, line.discountValue)
          const newValue = targetType === 'percentage'
            ? (gross > 0 ? (currentAmount / gross) * 100 : 0)
            : currentAmount
          return { ...line, discountType: targetType, discountValue: Math.round(newValue * 100) / 100 }
        }),
      )

      setDiscountValue((prevValue) => {
        const netSubtotal = computeCartSubtotal(cart)
        const currentOverallAmount = computeDiscountAmount(netSubtotal, prevType, prevValue)
        const newOverallValue = targetType === 'percentage'
          ? (netSubtotal > 0 ? (currentOverallAmount / netSubtotal) * 100 : 0)
          : currentOverallAmount
        return Math.round(newOverallValue * 100) / 100
      })

      return targetType
    })
  }, [cart])

  const removeLine = useCallback((key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key))
  }, [])

  const resetSale = useCallback(() => {
    setCart([])
    setCustomer(null)
    setWalkInCustomerName('')
    setPaymentMethod('cash')
    setDiscountType('fixed')
    setDiscountValue(0)
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
        discountType,
        discountValue,
        paidAmount,
      },
    })
    setHeld(listFastBillHeld())
    resetSale()
    toast.success('Cart held')
  }, [cart, customer, walkInCustomerName, paymentMethod, discountType, discountValue, paidAmount, resetSale])

  const resumeHeld = useCallback((record: FastBillHeldRecord) => {
    setCart((record.snapshot.cart as unknown as CartLine[]) || [])
    setCustomer(record.snapshot.customerId ? { id: record.snapshot.customerId, name: record.snapshot.customerName } : null)
    setPaymentMethod((record.snapshot.paymentMethod as PaymentMethod) || 'cash')
    setDiscountType((record.snapshot.discountType as DiscountType) || 'fixed')
    setDiscountValue(record.snapshot.discountValue || 0)
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

    // IMEI/serial-tracked lines must have exactly one number selected per unit sold —
    // same check invoice-panel.tsx runs before save.
    for (const line of cart) {
      if (!line.trackImei && !line.trackSerial) continue
      const label = line.trackSerial ? 'serial' : 'IMEI'
      const imeiCount = (line.imeis || []).length
      if (imeiCount !== line.quantity) {
        toast.error(`${line.name}: select ${line.quantity} ${label} number(s) — ${imeiCount} selected`)
        setSerialDialogKey(line.key)
        return
      }
    }

    try {
      const payload = buildInvoicePayload({ cart, customer, walkInCustomerName, paymentMethod, discountType, discountValue, paidAmount })
      const result = await createInvoice(payload).unwrap()
      playBeep('success')
      toast.success(`Invoice ${result.invoiceNumber} created`)

      const receiptData = buildReceiptData({
        invoiceNumber: result.invoiceNumber,
        cart,
        customer,
        walkInCustomerName,
        paymentMethod,
        discountType,
        discountValue,
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
      const invoiceTemplate = branchData?.printSettings?.template ?? 'standard'
      const printOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'
      if (PAPER_FORMATS[paperSize].family === 'thermal') {
        openPrintWindowForFormat(generateInvoiceHTML(receiptData, resolveThermalSize(paperSize)), paperSize)
      } else {
        const sheetSize = resolveSheetFormat(paperSize, printOrientation)
        openPrintWindowForFormat(generateA4InvoiceHTML(receiptData, sheetSize, invoiceTemplate), sheetSize)
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
    discountType,
    discountValue,
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
      <div className='mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-violet-500/15 via-indigo-500/10 to-transparent px-4 py-3'>
        <div className='flex items-center gap-2.5'>
          <span className='flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm shadow-indigo-600/30'>
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
            <div className='mr-1 hidden items-baseline gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 shadow-sm dark:border-emerald-900 dark:bg-emerald-950/40 sm:flex'>
              <span className='text-xs text-muted-foreground'>{cart.length} items</span>
              <span className='text-base font-bold tabular-nums text-emerald-700 dark:text-emerald-400'>Rs{total.toFixed(0)}</span>
            </div>
          )}
          <Button variant='outline' size='sm' asChild>
            <Link to='/invoice' search={{ view: 'list' }}>
              <History className='mr-1.5 h-3.5 w-3.5' />
              Invoice History
            </Link>
          </Button>
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
          <div className='flex h-[min(680px,calc(100vh-330px))] flex-col rounded-xl border border-border/60 bg-card p-3 shadow-md'>
            <div className='mb-2 flex shrink-0 items-center justify-between border-b border-border/60 pb-2'>
              <h2 className='flex items-center gap-1.5 text-sm font-semibold tracking-tight'>
                <ShoppingCart className='h-4 w-4 text-sky-600 dark:text-sky-400' />
                Cart <span className='text-muted-foreground'>({cart.length})</span>
              </h2>
              <div className='flex items-center gap-2'>
                {cart.length > 0 && (
                  <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='h-7 gap-1 px-2 text-xs'
                    onClick={toggleAllDiscountTypes}
                    title='Switch every discount (all items + overall) to this unit at once'
                  >
                    <ArrowLeftRight className='h-3 w-3' />
                    {discountType === 'percentage' ? 'Rs' : '%'}
                  </Button>
                )}
                {cart.length > 0 && (
                  <span className='text-sm font-bold tabular-nums text-emerald-700 dark:text-emerald-400'>
                    Rs{subtotal.toFixed(0)}
                  </span>
                )}
              </div>
            </div>
            <CartPanel
              cart={cart}
              catalogByKey={catalogByKey}
              onQuantityChange={updateQuantity}
              onPriceChange={updatePrice}
              onItemDiscountChange={updateItemDiscount}
              onRemove={removeLine}
              highlightKey={lastAddedKey}
              customer={customer}
              onOpenSerialDialog={setSerialDialogKey}
              onUpdateBatch={updateItemBatch}
              onUpdateAllocationQuantity={updateAllocationQuantity}
              onAddBatchToSplit={addBatchToSplit}
            />
          </div>
        </div>

        <div className='flex flex-col gap-3 xl:col-span-5'>
          <div className='sticky top-3 rounded-xl border border-border/60 bg-card p-3 shadow-xl'>
            <h2 className='mb-2.5 flex items-center gap-1.5 border-b border-border/60 pb-2 text-sm font-semibold tracking-tight'>
              <Receipt className='h-4 w-4 text-violet-600 dark:text-violet-400' />
              Checkout
            </h2>
            <PaymentPanel
              subtotal={subtotal}
              itemDiscountTotal={itemDiscountTotal}
              discountType={discountType}
              discountValue={discountValue}
              onDiscountChange={(patch) => {
                if (patch.type !== undefined) setDiscountType(patch.type)
                if (patch.value !== undefined) setDiscountValue(patch.value)
              }}
              discount={discount}
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
      <AddToCartDialog
        item={dialogItem}
        onClose={closeAddDialog}
        onConfirm={confirmAddDialog}
        onAfterClose={focusScanInput}
      />

      {(() => {
        const dialogLine = cart.find((l) => l.key === serialDialogKey)
        if (!dialogLine) return null
        return (
          <SerialNumberDialog
            open={!!serialDialogKey}
            onOpenChange={(open) => setSerialDialogKey(open ? serialDialogKey : '')}
            productId={dialogLine.productId}
            batchId={dialogLine.batchId}
            batchIds={dialogLine.batchAllocations?.map((a) => a.batchId)}
            itemName={dialogLine.name}
            quantity={dialogLine.quantity}
            selected={dialogLine.imeis || []}
            isSerial={!!dialogLine.trackSerial}
            onChange={(next, records) => updateItemImeis(dialogLine.key, next, records)}
            onComplete={() => {
              // Fast Billing has no "next row" to advance to — just close and hand focus
              // back to the scan input, ready for the next scan.
              setSerialDialogKey('')
              focusScanInput()
            }}
          />
        )
      })()}
    </div>
  )
}

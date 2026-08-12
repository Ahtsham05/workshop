import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { CalendarClock, Layers, Minus, Package, PackageCheck, Plus, Sparkles, X } from 'lucide-react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useReceivePurchaseOrderItemsMutation,
  type PurchaseOrder,
} from '@/stores/purchaseOrder.api'
import { useGetBatchesForVariantQuery } from '@/stores/batch.api'
import { generateBatchNumber } from '@/features/products/components/variants/generate-variant-combinations'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import type { RootState } from '@/stores/store'
import { useLanguage } from '@/context/language-context'
import { getBusinessToday } from '@/lib/business-timezone'
import { focusField, onEnterAdvance } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import { openPurchasePrintWindow } from '@/utils/purchasePrintUtils'
import { computeDiscountAmount, type DiscountType } from '@/features/purchase-invoice/utils/discount'
import {
  buildMergedPaymentOptions,
  isWalletOptionValue,
  getWalletTypeFromOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { SplitPaymentFields, type SplitPaymentValue } from '@/components/split-payment-fields'

type Row = {
  productId: string
  productName: string
  ordered: number
  alreadyReceived: number
  remaining: number
  unit: string
  conversionFactor: number
  expectedPrice: number
  expectedSellingPrice?: number
  receivedQuantity: number
  priceAtPurchase: number
  sellingPriceAtPurchase?: number
  // Prorated from the order line's own discount rate by default (see
  // buildRowsFromOrder) — editable per-row, same as price/sell price above.
  discountType?: DiscountType
  discountValue?: number
  notes?: string
  variantId?: string
  trackBatch?: boolean
  trackExpiry?: boolean
  batchNumber?: string
  expiryDate?: string
}

interface Props {
  open: boolean
  order: PurchaseOrder | null
  onClose: () => void
  onReceived: () => void
}

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function buildRowsFromOrder(order: PurchaseOrder): Row[] {
  return order.items.map((it: any) => {
    const product = it.product
    const productId = typeof product === 'object' ? product?._id || product?.id : product
    // toJSON transforms _id -> id, so a populated variant only has `.id`, not `._id`.
    const variant = it.variantId && typeof it.variantId === 'object' ? it.variantId : null
    const variantId = variant?.id || variant?._id || (typeof it.variantId === 'string' ? it.variantId : undefined)
    // it.productName was already saved as "Toshiba — 12" at order-creation time (see
    // handleCatalogItemSelect in purchase-order-panel.tsx) — no need to reconstruct it.
    const productName = it.productName || (typeof product === 'object' ? product?.name : '') || ''
    const ordered = Number(it.quantity || 0)
    const alreadyReceived = Number(it.receivedQuantity || 0)
    const remaining = Math.max(0, ordered - alreadyReceived)
    // Default this row's discount to the order line's own discount *rate* (not its
    // flat Rs amount) — a receipt can be a partial quantity and/or at a different
    // actual price than expectedPrice, so the rate is what should carry over.
    // Expressed as a percentage so it's re-derivable regardless of how much/at what
    // price is actually received. Mirrors receiveItems in purchaseOrder.service.js.
    const orderedGross = ordered * Number(it.expectedPrice || 0)
    const orderLineDiscountAmount = Number(it.discountAmount || 0)
    const itemDiscountRate = orderedGross > 0 ? orderLineDiscountAmount / orderedGross : 0
    return {
      productId,
      productName,
      ordered,
      alreadyReceived,
      remaining,
      unit: it.unit || 'pcs',
      conversionFactor: Number(it.conversionFactor || 1),
      expectedPrice: Number(it.expectedPrice || 0),
      expectedSellingPrice: it.expectedSellingPrice
        ? Number(it.expectedSellingPrice)
        : undefined,
      receivedQuantity: remaining,
      priceAtPurchase: Number(it.expectedPrice || 0),
      sellingPriceAtPurchase: it.expectedSellingPrice
        ? Number(it.expectedSellingPrice)
        : undefined,
      discountType: 'percentage',
      discountValue: Math.round(itemDiscountRate * 100 * 100) / 100,
      notes: '',
      variantId,
      trackBatch: variant?.trackBatch,
      trackExpiry: variant?.trackExpiry,
      batchNumber: '',
      expiryDate: '',
    }
  })
}

/**
 * Batch number/expiry entry for a receiving row whose variant tracks batch/expiry —
 * mirrors Purchase Invoice's PurchaseItemVariantBatchFields (pills for known batches +
 * a dialog for entering a new one), minus the variant picker since a PO receipt line's
 * variant is already fixed. Picking an existing batch chip re-stocks it (matched by
 * batch number, same as Purchase's createPurchase); "New Batch" starts a fresh one via
 * the dialog. Pulled into its own component because it needs its own
 * useGetBatchesForVariantQuery call per row, which the Rules of Hooks don't allow
 * inside the rows.map() loop body directly.
 */
function ReceiveRowBatchFields({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  const { data: batches = [] } = useGetBatchesForVariantQuery(row.variantId || '', {
    skip: !row.variantId || (!row.trackBatch && !row.trackExpiry),
  })
  const activeBatches = batches.filter((b) => (b.status || 'active') === 'active')
  // Expiry is only meaningful for products that actually expire — a batch-only item
  // (batch tracked for cost/traceability but not perishable) never shows a date field,
  // same as Purchase Invoice.
  const isExpirable = !!row.trackExpiry

  // Default to the earliest-expiring batch (already sorted that way by the backend)
  // once it loads, instead of leaving the row unselected — speeds up bulk-restocking
  // already-known batches. The receiver can still switch to a different batch chip, or
  // start a new one, afterward. Purchase Invoice's manual-entry flow doesn't default
  // this (its items usually aren't restocks of a specific known batch), so this is a
  // deliberate receive-flow-only speed feature, kept from the previous implementation.
  useEffect(() => {
    if (row.batchNumber || activeBatches.length === 0) return
    const defaultBatch = activeBatches[0]
    onChange({ batchNumber: defaultBatch.batchNumber, priceAtPurchase: defaultBatch.costPerUnit })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatches.length])

  const [dialogOpen, setDialogOpen] = useState(false)
  const [draftBatchNumber, setDraftBatchNumber] = useState('')
  const [draftExpiryDate, setDraftExpiryDate] = useState('')
  const batchInputRef = useRef<HTMLInputElement | null>(null)
  const expiryInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!dialogOpen) return
    focusField(batchInputRef.current, true)
  }, [dialogOpen])

  if (!row.trackBatch && !row.trackExpiry) return null

  // The row's current pick, once it's not one of the server's known active batches, is
  // a batch being created by this receipt — shown as its own pill alongside the real
  // ones instead of raw always-visible inputs.
  const isNewBatch = !!row.batchNumber && !activeBatches.some((b) => b.batchNumber === row.batchNumber)

  const openCreateDialog = () => {
    setDraftBatchNumber(generateBatchNumber())
    setDraftExpiryDate('')
    setDialogOpen(true)
  }

  const openEditDialog = () => {
    setDraftBatchNumber(row.batchNumber || generateBatchNumber())
    setDraftExpiryDate(row.expiryDate || '')
    setDialogOpen(true)
  }

  const clearBatch = () => onChange({ batchNumber: '', expiryDate: '' })

  const commitBatch = () => {
    const trimmed = draftBatchNumber.trim()
    if (!trimmed) return
    onChange({ batchNumber: trimmed, expiryDate: isExpirable ? draftExpiryDate : '' })
    setDialogOpen(false)
  }

  const pillClass = (isSelected: boolean) =>
    cn(
      'inline-flex items-center gap-1 rounded-full border text-[11px] font-medium shadow-sm transition-colors',
      isSelected
        ? 'border-blue-600 bg-blue-600 text-white'
        : 'border-border bg-background text-muted-foreground hover:border-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950/30',
    )
  const removeButtonClass = (isSelected: boolean) =>
    cn(
      'shrink-0 rounded-full p-0.5 mr-1',
      isSelected ? 'hover:bg-white/20' : 'hover:bg-black/10 dark:hover:bg-white/10',
    )

  return (
    <div className='ml-10 flex flex-wrap items-center gap-1.5 px-2.5 pb-2'>
      <span className='inline-flex items-center gap-1 text-[11px] font-medium text-blue-700'>
        <Layers className='h-3 w-3' /> Batches
      </span>
      {activeBatches.map((b) => {
        const id = b._id || b.id
        const isSelected = row.batchNumber === b.batchNumber
        return (
          <span key={id} className={pillClass(isSelected)}>
            <button
              type='button'
              onClick={() => onChange({ batchNumber: b.batchNumber, priceAtPurchase: b.costPerUnit })}
              title={b.expiryDate ? `Expires ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
              className={cn('py-1', isSelected ? 'pl-2.5' : 'px-2.5')}
            >
              {b.batchNumber} · {b.quantity} left
            </button>
            {isSelected && (
              <button type='button' onClick={clearBatch} title='Remove batch' className={removeButtonClass(isSelected)}>
                <X className='h-3 w-3' />
              </button>
            )}
          </span>
        )
      })}
      {isNewBatch && (
        <span
          className={pillClass(true)}
          title={isExpirable ? (row.expiryDate ? `Expires ${new Date(row.expiryDate).toLocaleDateString()}` : 'No expiry set') : undefined}
        >
          <button type='button' onClick={openEditDialog} className='py-1 pl-2.5'>
            <Sparkles className='mr-1 inline h-3 w-3' />
            {row.batchNumber}
            {isExpirable && !row.expiryDate && <CalendarClock className='ml-1 inline h-3 w-3 text-amber-300' />}
          </button>
          <button type='button' onClick={clearBatch} title='Remove batch' className={removeButtonClass(true)}>
            <X className='h-3 w-3' />
          </button>
        </span>
      )}
      <button
        type='button'
        onClick={openCreateDialog}
        className='inline-flex items-center gap-1 rounded-full border border-dashed border-blue-300 px-2.5 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50 dark:border-blue-800 dark:text-blue-400 dark:hover:bg-blue-950/30'
      >
        <Plus className='h-3 w-3' /> New Batch
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className='sm:max-w-sm'>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2 text-base'>
              <Layers className='h-4 w-4 text-blue-600' />
              {isNewBatch ? 'Edit Batch' : 'New Batch'}
            </DialogTitle>
            <DialogDescription className='truncate'>{row.productName}</DialogDescription>
          </DialogHeader>

          <div className='space-y-3'>
            <div className='space-y-1.5'>
              <Label htmlFor={`receive-batch-number-${row.productId}-${row.variantId || ''}`}>Batch Number</Label>
              <Input
                id={`receive-batch-number-${row.productId}-${row.variantId || ''}`}
                ref={batchInputRef}
                placeholder='Batch number'
                value={draftBatchNumber}
                showVoiceInput={false}
                onChange={(e) => setDraftBatchNumber(e.target.value)}
                onKeyDown={(e) =>
                  onEnterAdvance(e, () => {
                    if (isExpirable) focusField(expiryInputRef.current)
                    else commitBatch()
                  })
                }
                className='h-9'
              />
            </div>
            {isExpirable && (
              <div className='space-y-1.5'>
                <Label htmlFor={`receive-batch-expiry-${row.productId}-${row.variantId || ''}`}>Expiry Date</Label>
                <Input
                  id={`receive-batch-expiry-${row.productId}-${row.variantId || ''}`}
                  ref={expiryInputRef}
                  type='date'
                  value={draftExpiryDate}
                  showVoiceInput={false}
                  onChange={(e) => setDraftExpiryDate(e.target.value)}
                  onKeyDown={(e) => onEnterAdvance(e, commitBatch)}
                  className='h-9'
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type='button' variant='outline' size='sm' onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button type='button' size='sm' disabled={!draftBatchNumber.trim()} onClick={commitBatch}>
              {isNewBatch ? 'Save Batch' : 'Create Batch'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function ReceiveItemsDialog({ open, order, onClose, onReceived }: Props) {
  const { t } = useLanguage()
  const activeBranchId = useSelector((state: RootState) => state.auth.activeBranchId)
  const preferredLanguage = useSelector(
    (state: RootState) => state.auth.data?.user?.preferredLanguage || 'en',
  )
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, {
    skip: !open || !user?.organizationId,
  })
  const { data: branchData } = useGetBranchQuery(activeBranchId!, { skip: !open || !activeBranchId })
  // Real bank accounts / mobile wallets are selectable for every business type here (not
  // just mobile shops), same as Purchase Invoice's payment method dropdown.
  const { data: walletsData } = useGetWalletsQuery(undefined, { skip: !open })
  const wallets = walletsData?.results?.filter((wallet) => wallet.isActive) ?? []

  const [rows, setRows] = useState<Row[]>([])
  const [receivedAt, setReceivedAt] = useState<string>(() => getBusinessToday())
  // Settlement status (does the unpaid remainder become a supplier debt) — separate from
  // paymentMethod (which real account absorbs paidAmount right now), same split as Purchase
  // Invoice's "Purchase Type" vs "Payment Method" fields.
  const [purchaseType, setPurchaseType] = useState<'cash' | 'credit'>('cash')
  const [purchaseTypeSelectOpen, setPurchaseTypeSelectOpen] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'wallet'>('cash')
  const [paymentMethodSelectOpen, setPaymentMethodSelectOpen] = useState(false)
  const [walletType, setWalletType] = useState<string>('')
  const [paidAmount, setPaidAmount] = useState<number>(0)
  // Optional second payment leg (e.g. paid partly cash, partly from a wallet/bank account) —
  // always the opposite bucket from paymentMethod, see split-payment-fields.tsx.
  const [splitPaymentMethod, setSplitPaymentMethod] = useState<'cash' | 'wallet' | undefined>(undefined)
  const [splitWalletType, setSplitWalletType] = useState<string>('')
  const [splitPaidAmount, setSplitPaidAmount] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')
  // Overall receipt-level discount — defaults to the order's own overall discount
  // *rate* prorated against however much of the order this receipt actually covers,
  // same idea as each row's per-line discount default above.
  const [discountType, setDiscountType] = useState<DiscountType>('percentage')
  const [discountValue, setDiscountValue] = useState<number>(0)

  const branchPrintDetails = useMemo(
    () => ({
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
    }),
    [branchData, orgData],
  )

  const resolveSupplierName = useCallback((purchaseOrder: PurchaseOrder, purchase?: any) => {
    const fromPurchase =
      typeof purchase?.supplier === 'object' ? purchase.supplier?.name : undefined
    if (fromPurchase) return fromPurchase
    const supplier = purchaseOrder.supplier
    if (typeof supplier === 'object' && supplier?.name) return supplier.name
    return 'Unknown'
  }, [])

  // Paying a supplier is a money-out action — show wallet balances so the user can avoid
  // overdrawing. No generic "Bank Transfer"/"Card"/"Cheque" placeholders — every real
  // account (bank or mobile wallet) is selectable here by its own name, same as Purchase
  // Invoice's payment method dropdown.
  const paymentMethodOptions = useMemo(
    () => buildMergedPaymentOptions([{ value: 'cash', label: 'Cash' }], wallets, true),
    [wallets],
  )
  const selectedPaymentMethodValue =
    paymentMethod === 'wallet' && walletType ? toWalletOptionValue(walletType) : 'cash'

  const receivedAtRef = useRef<HTMLInputElement>(null)
  const purchaseTypeRef = useRef<HTMLButtonElement>(null)
  const paymentMethodRef = useRef<HTMLButtonElement>(null)
  const paidAmountRef = useRef<HTMLInputElement>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const confirmBtnRef = useRef<HTMLButtonElement>(null)
  const qtyInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const costInputRefs = useRef<Record<number, HTMLInputElement | null>>({})
  const sellInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const [receive, { isLoading }] = useReceivePurchaseOrderItemsMutation()

  useEffect(() => {
    if (!order) {
      setRows([])
      return
    }
    setRows(buildRowsFromOrder(order))
    setReceivedAt(getBusinessToday())
    setPurchaseType('cash')
    setPaymentMethod('cash')
    setWalletType('')
    setSplitPaymentMethod(undefined)
    setSplitWalletType('')
    setSplitPaidAmount(0)
    setPaidAmount(0)
    setNotes('')
    const orderSubtotal = Number(order.subtotal || 0)
    const orderDiscountAmount = Number(order.discount || 0)
    const overallDiscountRate = orderSubtotal > 0 ? orderDiscountAmount / orderSubtotal : 0
    setDiscountType('percentage')
    setDiscountValue(Math.round(overallDiscountRate * 100 * 100) / 100)
  }, [order])

  const receivableIndexes = useMemo(
    () => rows.map((r, i) => (r.remaining > 0 ? i : -1)).filter((i) => i >= 0),
    [rows],
  )

  const itemDiscountTotal = useMemo(
    () =>
      rows.reduce((s, r) => {
        const gross = Number(r.receivedQuantity || 0) * Number(r.priceAtPurchase || 0)
        return s + computeDiscountAmount(gross, r.discountType, r.discountValue)
      }, 0),
    [rows],
  )

  const subtotal = useMemo(
    () =>
      rows.reduce((s, r) => {
        const gross = Number(r.receivedQuantity || 0) * Number(r.priceAtPurchase || 0)
        return s + (gross - computeDiscountAmount(gross, r.discountType, r.discountValue))
      }, 0),
    [rows],
  )

  const discountAmount = useMemo(
    () => computeDiscountAmount(subtotal, discountType, discountValue),
    [subtotal, discountType, discountValue],
  )

  const total = Math.max(0, subtotal - discountAmount)

  const resolvedSplitPaidAmount = splitPaymentMethod ? Math.max(0, Number(splitPaidAmount || 0)) : 0
  const totalPaidAmount = Number(paidAmount || 0) + resolvedSplitPaidAmount

  // The split leg is always the OPPOSITE bucket from paymentMethod (enforced by
  // SplitPaymentFields), so at most one wallet leg — either the primary or the split — is
  // ever active at a time. Resolve that single leg for the balance warning/validation below.
  const effectiveWalletType = paymentMethod === 'wallet' ? walletType : splitPaymentMethod === 'wallet' ? splitWalletType : ''
  const effectiveWalletAmount = paymentMethod === 'wallet' ? Number(paidAmount || 0) : splitPaymentMethod === 'wallet' ? resolvedSplitPaidAmount : 0
  const effectiveWallet = useMemo(
    () => wallets.find((wallet) => wallet.type === effectiveWalletType),
    [wallets, effectiveWalletType],
  )
  const effectiveWalletBalance = Number(effectiveWallet?.balance || 0)

  // Purchase Type "Cash" always means fully paid right now — whichever account(s) it went
  // through. A Credit receipt (or a Cash receipt with split payment on) leaves Paid amount
  // editable instead. Guarded against an active split so this never clobbers a split leg's
  // amount — mirrors purchase-panel.tsx's identical guard.
  useEffect(() => {
    if (purchaseType === 'cash' && !splitPaymentMethod && (paidAmount || 0) !== total) {
      setPaidAmount(total)
    }
  }, [purchaseType, splitPaymentMethod, total, paidAmount])

  useEffect(() => {
    if (!open || !order || receivableIndexes.length === 0) return
    queueMicrotask(() => focusField(receivedAtRef.current))
  }, [open, order, receivableIndexes.length])

  const updateRow = useCallback((idx: number, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }, [])

  const focusFirstReceivableQty = useCallback(() => {
    const idx = receivableIndexes[0]
    if (idx !== undefined) focusField(qtyInputRefs.current[idx])
  }, [receivableIndexes])

  const focusNextReceivableQty = useCallback(
    (currentIdx: number) => {
      const pos = receivableIndexes.indexOf(currentIdx)
      const nextIdx = pos >= 0 ? receivableIndexes[pos + 1] : undefined
      if (nextIdx !== undefined) {
        focusField(qtyInputRefs.current[nextIdx])
        return
      }
      focusField(notesRef.current, false)
    },
    [receivableIndexes],
  )

  const focusAfterPaymentMethod = useCallback(() => {
    if (purchaseType === 'cash' && !splitPaymentMethod) {
      focusFirstReceivableQty()
      return
    }
    focusField(paidAmountRef.current)
  }, [purchaseType, splitPaymentMethod, focusFirstReceivableQty])

  const handlePurchaseTypeChange = useCallback(
    (value: 'cash' | 'credit') => {
      const switchingCashToCredit = purchaseType === 'cash' && value === 'credit'
      setPurchaseType(value)
      if (value === 'cash') {
        setPaidAmount(total)
      } else if (switchingCashToCredit) {
        setPaidAmount(0)
      }
      // credit -> credit: keep whatever paidAmount was already entered.
    },
    [purchaseType, total],
  )

  const handlePaymentMethodChange = useCallback((value: string) => {
    const isWallet = isWalletOptionValue(value)
    setPaymentMethod(isWallet ? 'wallet' : 'cash')
    setWalletType(isWallet ? getWalletTypeFromOptionValue(value) : '')
    // The split leg's bucket is derived from this field — stale once it changes.
    setSplitPaymentMethod(undefined)
    setSplitWalletType('')
    setSplitPaidAmount(0)
  }, [])

  const handleSplitPaymentChange = useCallback((patch: SplitPaymentValue) => {
    setSplitPaymentMethod(patch.splitPaymentMethod)
    setSplitWalletType(patch.splitWalletType || '')
    setSplitPaidAmount(patch.splitPaidAmount || 0)
  }, [])

  const fillAllRemaining = useCallback(() => {
    setRows((prev) =>
      prev.map((r) =>
        r.remaining > 0
          ? {
              ...r,
              receivedQuantity: r.remaining,
              priceAtPurchase: r.expectedPrice,
              sellingPriceAtPurchase: r.expectedSellingPrice,
            }
          : r,
      ),
    )
    focusFirstReceivableQty()
  }, [focusFirstReceivableQty])

  const handleReceive = useCallback(async () => {
    if (!order) return
    const filtered = rows.filter((r) => Number(r.receivedQuantity) > 0)
    if (filtered.length === 0) {
      toast.error('Please specify at least one item to receive')
      focusFirstReceivableQty()
      return
    }
    for (const r of filtered) {
      if (r.receivedQuantity > r.remaining + 0.000001) {
        toast.error(
          `Cannot receive ${r.receivedQuantity} of ${r.productName} — only ${r.remaining} remaining`,
        )
        return
      }
      if (r.priceAtPurchase < 0) {
        toast.error(`Purchase price cannot be negative for ${r.productName}`)
        return
      }
    }
    if (paymentMethod === 'wallet' && !walletType.trim()) {
      toast.error('Please select an account for the payment method')
      focusField(paymentMethodRef.current)
      return
    }
    if (splitPaymentMethod === 'wallet' && !splitWalletType.trim()) {
      toast.error('Please select an account for the split payment')
      return
    }
    // The split leg is always the OPPOSITE bucket from paymentMethod, so at most one wallet
    // leg — either the primary or the split — is ever active; check that one leg's own
    // amount against that one wallet's own balance, not the combined receipt total.
    if (effectiveWalletType && effectiveWalletAmount > effectiveWalletBalance + 0.000001) {
      toast.error(
        `Paid amount exceeds ${effectiveWalletType} balance (Rs ${formatMoney(effectiveWalletBalance)})`,
      )
      focusField(paidAmountRef.current)
      return
    }

    try {
      const result = await receive({
        id: order._id || order.id!,
        items: filtered.map((r) => ({
          product: r.productId,
          variantId: r.variantId,
          receivedQuantity: Number(r.receivedQuantity),
          priceAtPurchase: Number(r.priceAtPurchase),
          sellingPriceAtPurchase: r.sellingPriceAtPurchase
            ? Number(r.sellingPriceAtPurchase)
            : undefined,
          unit: r.unit,
          conversionFactor: r.conversionFactor,
          discountType: r.discountType || 'fixed',
          discountValue: Number(r.discountValue || 0),
          notes: r.notes,
          batchNumber: r.batchNumber || undefined,
          expiryDate: r.expiryDate || undefined,
        })),
        receivedAt: new Date(receivedAt).toISOString(),
        paidAmount: totalPaidAmount,
        type: purchaseType,
        paymentMethod,
        walletType: paymentMethod === 'wallet' ? walletType.trim() : undefined,
        splitPaymentMethod,
        splitWalletType: splitPaymentMethod === 'wallet' ? splitWalletType.trim() : undefined,
        splitPaidAmount: resolvedSplitPaidAmount,
        discountType,
        discountValue: Number(discountValue || 0),
        notes,
      }).unwrap()
      toast.success(`Goods received against ${order.orderNumber}`)

      if (result.purchase) {
        const printed = openPurchasePrintWindow(
          result.purchase,
          resolveSupplierName(order, result.purchase),
          branchData?.printSettings?.paperSize ?? 'thermal80',
          {
            t,
            branchDetails: branchPrintDetails,
            languageOverride: preferredLanguage,
            printInUrdu: getInvoicePrintInUrdu(),
            template: branchData?.printSettings?.template ?? 'standard',
            orientation: branchData?.printSettings?.printOrientation ?? 'portrait',
          },
        )
        if (!printed) {
          toast.error(t('Allow pop-ups to print the purchase receipt'))
        }
      } else {
        toast.error(t('Purchase created but receipt data was not returned for printing'))
      }

      onReceived()
      onClose()
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to receive items')
    }
  }, [
    order,
    rows,
    purchaseType,
    paymentMethod,
    walletType,
    splitPaymentMethod,
    splitWalletType,
    resolvedSplitPaidAmount,
    totalPaidAmount,
    effectiveWalletType,
    effectiveWalletAmount,
    effectiveWalletBalance,
    receivedAt,
    discountType,
    discountValue,
    notes,
    receive,
    onReceived,
    onClose,
    focusFirstReceivableQty,
    resolveSupplierName,
    branchPrintDetails,
    t,
    preferredLanguage,
  ])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return
      if (e.key === 'Enter' && !isLoading) {
        e.preventDefault()
        handleReceive()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, isLoading, handleReceive])

  const balance = Math.max(0, total - totalPaidAmount)
  const receivingCount = rows.filter((r) => Number(r.receivedQuantity) > 0).length
  const receivingUnits = rows.reduce((s, r) => s + Number(r.receivedQuantity || 0), 0)

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className='flex max-h-[96vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl'>
        <DialogHeader className='shrink-0 border-b px-4 py-3 sm:px-5'>
          <DialogTitle className='flex items-center gap-2'>
            <PackageCheck className='h-5 w-5 text-emerald-600' />
            Receive items — {order?.orderNumber}
          </DialogTitle>
          <DialogDescription>
            Enter to move fields · Ctrl+Enter confirm receipt. A purchase invoice is created and
            stock updates automatically.
          </DialogDescription>
        </DialogHeader>

        <div className='min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3 sm:px-5'>
          <div className='flex flex-wrap items-end gap-3'>
            <div className='w-[140px] shrink-0'>
              <Label htmlFor='received-at' className='text-xs'>
                Received on
              </Label>
              <Input
                ref={receivedAtRef}
                id='received-at'
                type='date'
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                onKeyDown={(e) => onEnterAdvance(e, () => focusField(purchaseTypeRef.current))}
                className='mt-1.5 h-9'
              />
            </div>
            <div className='w-[110px] shrink-0'>
              <Label className='text-xs'>Purchase Type</Label>
              <Select
                value={purchaseType}
                onOpenChange={setPurchaseTypeSelectOpen}
                onValueChange={handlePurchaseTypeChange}
              >
                <SelectTrigger
                  ref={purchaseTypeRef}
                  className='mt-1.5 h-9'
                  onKeyDown={(e) => {
                    if (!purchaseTypeSelectOpen) {
                      onEnterAdvance(e, () => focusField(paymentMethodRef.current))
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='cash'>Cash</SelectItem>
                  <SelectItem value='credit'>Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='min-w-[200px] flex-1'>
              <Label className='text-xs'>Payment Method</Label>
              <Select
                value={selectedPaymentMethodValue}
                onOpenChange={setPaymentMethodSelectOpen}
                onValueChange={handlePaymentMethodChange}
              >
                <SelectTrigger
                  ref={paymentMethodRef}
                  className='mt-1.5 h-9'
                  onKeyDown={(e) => {
                    if (!paymentMethodSelectOpen) {
                      onEnterAdvance(e, focusAfterPaymentMethod)
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentMethodOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {wallets.length === 0 && (
                <p className='mt-1 text-[11px] text-muted-foreground'>No wallets configured.</p>
              )}
            </div>
            <div className='w-[120px] shrink-0'>
              <Label htmlFor='paid-amount' className='text-xs'>
                Paid amount
              </Label>
              <Input
                ref={paidAmountRef}
                id='paid-amount'
                type='text'
                inputMode='decimal'
                value={purchaseType === 'cash' && !splitPaymentMethod ? total : paidAmount || ''}
                disabled={purchaseType === 'cash' && !splitPaymentMethod}
                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => onEnterAdvance(e, focusFirstReceivableQty)}
                onFocus={(e) => e.target.select()}
                className='mt-1.5 h-9'
                placeholder='0'
              />
            </div>
          </div>

          <SplitPaymentFields
            primaryMethod={paymentMethod === 'wallet' ? 'wallet' : 'cash'}
            wallets={wallets}
            paidAmount={paidAmount || 0}
            value={{ splitPaymentMethod, splitWalletType, splitPaidAmount }}
            onChange={handleSplitPaymentChange}
            showBalance
          />

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <p className='text-xs text-muted-foreground'>
              {receivingCount} line{receivingCount === 1 ? '' : 's'} · {receivingUnits} units
            </p>
            <Button type='button' size='sm' variant='outline' onClick={fillAllRemaining}>
              Fill all remaining
            </Button>
          </div>

          <div className='space-y-2'>
            {rows.map((r, idx) => {
              const lineGross = Number(r.receivedQuantity || 0) * Number(r.priceAtPurchase || 0)
              const lineDiscountAmount = computeDiscountAmount(lineGross, r.discountType, r.discountValue)
              const lineTotal = lineGross - lineDiscountAmount
              const fullyReceivedAlready = r.remaining <= 0

              return (
                <div
                  key={`${r.productId}-${idx}`}
                  className={cn(
                    'overflow-hidden rounded-lg border bg-card',
                    fullyReceivedAlready && 'opacity-50',
                  )}
                >
                  {!fullyReceivedAlready ? (
                    <div className='flex flex-wrap items-center gap-2 p-2.5'>
                      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted'>
                        <Package className='h-4 w-4 text-muted-foreground/50' />
                      </div>
                      <div className='min-w-[88px] max-w-[140px] shrink-0'>
                        <p className='truncate text-sm font-semibold'>{r.productName}</p>
                        <div className='mt-0.5 flex flex-wrap gap-1'>
                          <Badge variant='outline' className='px-1 py-0 text-[10px]'>
                            {r.unit}
                          </Badge>
                          <Badge variant='secondary' className='px-1 py-0 text-[10px]'>
                            L{r.remaining}
                          </Badge>
                        </div>
                      </div>

                      <div className='flex items-center overflow-hidden rounded-md border bg-background'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className='h-7 w-7 rounded-none border-r p-0'
                          onClick={() =>
                            updateRow(idx, {
                              receivedQuantity: Math.max(0, r.receivedQuantity - 1),
                            })
                          }
                        >
                          <Minus className='h-3 w-3' />
                        </Button>
                        <Input
                          ref={(el) => {
                            qtyInputRefs.current[idx] = el
                          }}
                          type='number'
                          min={0}
                          max={r.remaining}
                          step='any'
                          value={r.receivedQuantity}
                          onChange={(e) =>
                            updateRow(idx, {
                              receivedQuantity: Number(e.target.value || 0),
                            })
                          }
                          onKeyDown={(e) =>
                            onEnterAdvance(e, () => focusField(costInputRefs.current[idx]))
                          }
                          onFocus={(e) => e.target.select()}
                          className='h-7 w-20 border-0 text-center text-sm font-semibold focus-visible:ring-0'
                        />
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className='h-7 w-7 rounded-none border-l p-0'
                          onClick={() =>
                            updateRow(idx, {
                              receivedQuantity: Math.min(r.remaining, r.receivedQuantity + 1),
                            })
                          }
                        >
                          <Plus className='h-3 w-3' />
                        </Button>
                      </div>

                      <span className='text-xs text-muted-foreground'>×</span>

                      <div className='flex items-center overflow-hidden rounded-md border bg-background'>
                        <span className='flex h-7 items-center border-r bg-muted px-1.5 text-[10px]'>
                          Rs
                        </span>
                        <Input
                          ref={(el) => {
                            costInputRefs.current[idx] = el
                          }}
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={r.priceAtPurchase > 0 ? r.priceAtPurchase : ''}
                          onChange={(e) =>
                            updateRow(idx, {
                              priceAtPurchase: parseFloat(e.target.value) || 0,
                            })
                          }
                          onKeyDown={(e) =>
                            onEnterAdvance(e, () => focusField(sellInputRefs.current[idx]))
                          }
                          onFocus={(e) => e.target.select()}
                          className='h-7 w-20 border-0 text-sm font-semibold focus-visible:ring-0'
                        />
                      </div>

                      <span className='text-xs text-muted-foreground'>−</span>

                      <div className='flex items-center overflow-hidden rounded-md border bg-background' title='Discount — defaults to the order line rate, editable'>
                        <Input
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={(r.discountValue || 0) > 0 ? r.discountValue : ''}
                          onChange={(e) =>
                            updateRow(idx, {
                              discountValue: Math.max(0, parseFloat(e.target.value) || 0),
                            })
                          }
                          onFocus={(e) => e.target.select()}
                          placeholder='0'
                          className='h-7 w-14 border-0 text-sm font-semibold focus-visible:ring-0'
                        />
                        <button
                          type='button'
                          onClick={() =>
                            updateRow(idx, {
                              discountType: r.discountType === 'percentage' ? 'fixed' : 'percentage',
                            })
                          }
                          title='Click to switch between Rs and % discount'
                          className='flex h-7 items-center border-l bg-muted px-1.5 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95'
                        >
                          {r.discountType === 'percentage' ? '%' : 'Rs'}
                        </button>
                      </div>

                      <span className='text-xs text-muted-foreground'>→</span>

                      <div className='flex items-center overflow-hidden rounded-md border border-blue-200 bg-blue-50/50'>
                        <span className='flex h-7 items-center border-r border-blue-200 bg-blue-100/60 px-1.5 text-[10px] text-blue-600'>
                          Rs
                        </span>
                        <Input
                          ref={(el) => {
                            sellInputRefs.current[idx] = el
                          }}
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={(r.sellingPriceAtPurchase ?? 0) > 0 ? r.sellingPriceAtPurchase : ''}
                          onChange={(e) =>
                            updateRow(idx, {
                              sellingPriceAtPurchase:
                                e.target.value === ''
                                  ? undefined
                                  : parseFloat(e.target.value) || 0,
                            })
                          }
                          onKeyDown={(e) => onEnterAdvance(e, () => focusNextReceivableQty(idx))}
                          onFocus={(e) => e.target.select()}
                          placeholder='0'
                          className='h-7 w-20 border-0 bg-transparent text-sm font-semibold text-blue-700 focus-visible:ring-0'
                        />
                      </div>

                      <div className='ml-auto flex shrink-0 flex-col items-end gap-0'>
                        {lineDiscountAmount > 0 && (
                          <span className='text-[10px] leading-none text-muted-foreground line-through'>Rs{lineGross.toFixed(2)}</span>
                        )}
                        <p className='text-sm font-bold tabular-nums'>Rs{lineTotal.toFixed(2)}</p>
                      </div>
                    </div>
                  ) : null}
                  {!fullyReceivedAlready && (
                    <ReceiveRowBatchFields row={r} onChange={(patch) => updateRow(idx, patch)} />
                  )}
                  {fullyReceivedAlready ? (
                    <div className='flex items-center gap-2 px-2.5 py-2 text-xs text-emerald-700'>
                      <Package className='h-3.5 w-3.5 shrink-0' />
                      <span className='min-w-0 truncate font-medium' title={r.productName}>{r.productName}</span>
                      <span className='shrink-0 text-muted-foreground'>· Fully received</span>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>

          <div className='space-y-3'>
            <div>
              <Label htmlFor='receive-notes' className='text-xs'>
                Notes
              </Label>
              <Textarea
                ref={notesRef}
                id='receive-notes'
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isLoading) {
                    e.preventDefault()
                    handleReceive()
                    return
                  }
                  onEnterAdvance(e, () => focusField(confirmBtnRef.current, false))
                }}
                rows={2}
                placeholder='Optional notes...'
                className='mt-1.5'
              />
            </div>
            <div className='space-y-1.5 rounded-md border bg-muted/40 p-3'>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Subtotal</span>
                <span className='font-medium tabular-nums'>Rs {formatMoney(subtotal)}</span>
              </div>
              {itemDiscountTotal > 0 && (
                <div className='flex justify-between text-sm text-green-600'>
                  <span>Item discounts</span>
                  <span className='tabular-nums'>-Rs {formatMoney(itemDiscountTotal)}</span>
                </div>
              )}
              <div className='flex items-center justify-between gap-2 text-sm'>
                <span className='text-muted-foreground'>Discount</span>
                <div className='flex items-center overflow-hidden rounded-md border bg-background'>
                  <Input
                    type='text'
                    inputMode='decimal'
                    showVoiceInput={false}
                    value={(discountValue || 0) > 0 ? discountValue : ''}
                    onChange={(e) => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    onFocus={(e) => e.target.select()}
                    placeholder='0'
                    className='h-7 w-16 border-0 text-right text-sm font-medium focus-visible:ring-0'
                  />
                  <button
                    type='button'
                    onClick={() => setDiscountType((prev) => (prev === 'percentage' ? 'fixed' : 'percentage'))}
                    title='Click to switch between Rs and % discount'
                    className='flex h-7 items-center border-l bg-muted px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95'
                  >
                    {discountType === 'percentage' ? '%' : 'Rs'}
                  </button>
                </div>
              </div>
              {discountAmount > 0 && (
                <div className='flex justify-between text-sm text-green-600'>
                  <span>Discount applied</span>
                  <span className='tabular-nums'>-Rs {formatMoney(discountAmount)}</span>
                </div>
              )}
              <Separator />
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Receipt total</span>
                <span className='font-medium tabular-nums'>Rs {formatMoney(total)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Paid now</span>
                <span className='font-medium tabular-nums'>
                  Rs {formatMoney(totalPaidAmount)}
                </span>
              </div>
              {effectiveWalletType ? (
                <div className='flex justify-between text-sm'>
                  <span className='text-muted-foreground'>{effectiveWalletType} balance</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      effectiveWalletBalance < effectiveWalletAmount && 'text-red-600',
                    )}
                  >
                    Rs {formatMoney(effectiveWalletBalance)}
                  </span>
                </div>
              ) : null}
              <Separator />
              <div className='flex justify-between'>
                <span className='font-semibold'>Balance owed</span>
                <span className='text-base font-bold tabular-nums text-primary'>
                  Rs {formatMoney(balance)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className='shrink-0 border-t px-4 py-3 sm:px-5'>
          <Button variant='outline' onClick={onClose}>
            Cancel
          </Button>
          <Button ref={confirmBtnRef} onClick={handleReceive} disabled={isLoading}>
            <PackageCheck className='mr-2 h-4 w-4' />
            {isLoading ? 'Receiving...' : 'Confirm receipt (Ctrl+Enter)'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

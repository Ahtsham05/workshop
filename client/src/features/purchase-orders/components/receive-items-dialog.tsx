import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { Minus, Package, PackageCheck, Plus } from 'lucide-react'

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
import { isMobileShopBusiness } from '@/lib/business-types'
import { cn } from '@/lib/utils'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import { openPurchasePrintWindow } from '@/utils/purchasePrintUtils'

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

const BASE_PAYMENT_TYPES = ['Cash', 'Card', 'Bank Transfer', 'Cheque', 'Credit'] as const

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
 * Batch number/expiry entry for a receiving row whose variant tracks batch/expiry.
 * Picking an existing batch chip re-stocks it (matched by batch number, same as
 * Purchase's createPurchase); "+ New batch" starts a fresh one. Pulled into its own
 * component because it needs its own useGetBatchesForVariantQuery call per row, which
 * the Rules of Hooks don't allow inside the rows.map() loop body directly.
 */
function ReceiveRowBatchFields({ row, onChange }: { row: Row; onChange: (patch: Partial<Row>) => void }) {
  if (!row.trackBatch && !row.trackExpiry) return null
  const { data: batches = [] } = useGetBatchesForVariantQuery(row.variantId || '', {
    skip: !row.variantId,
  })
  const activeBatches = batches.filter((b) => (b.status || 'active') === 'active')

  // Default to the earliest-expiring batch (already sorted that way by the backend)
  // once it loads, instead of leaving the row unselected — same rule as Purchase
  // Invoice/Sale Invoice's default-batch selection. The receiver can still switch to
  // a different batch chip afterward.
  useEffect(() => {
    if (row.batchNumber || activeBatches.length === 0) return
    const defaultBatch = activeBatches[0]
    onChange({
      batchNumber: defaultBatch.batchNumber,
      expiryDate: row.expiryDate,
      priceAtPurchase: defaultBatch.costPerUnit,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBatches.length])

  return (
    <div className='ml-10 flex flex-wrap items-center gap-1.5 px-2.5 pb-2'>
      {activeBatches.length > 0 && (
        <div className='flex flex-wrap gap-1'>
          {activeBatches.map((b) => {
            const id = b._id || b.id
            const isSelected = row.batchNumber === b.batchNumber
            return (
              <button
                key={id}
                type='button'
                onClick={() =>
                  onChange({ batchNumber: b.batchNumber, expiryDate: row.expiryDate, priceAtPurchase: b.costPerUnit })
                }
                title={b.expiryDate ? `Expires ${new Date(b.expiryDate).toLocaleDateString()}` : undefined}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] transition-colors',
                  isSelected
                    ? 'border-blue-600 bg-blue-100 text-blue-800'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {b.batchNumber} · {b.quantity} left
              </button>
            )
          })}
          <button
            type='button'
            onClick={() => onChange({ batchNumber: generateBatchNumber(), expiryDate: '' })}
            className='rounded-full border border-dashed px-2 py-0.5 text-[11px] text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/30'
          >
            + New batch
          </button>
        </div>
      )}
      <Input
        placeholder='Batch number'
        value={row.batchNumber || ''}
        showVoiceInput={false}
        onChange={(e) => onChange({ batchNumber: e.target.value })}
        className='h-7 w-[200px] text-xs'
      />
      <Input
        type='date'
        value={row.expiryDate || ''}
        showVoiceInput={false}
        onChange={(e) => onChange({ expiryDate: e.target.value })}
        className='h-7 w-[160px] text-xs'
      />
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
  const isMobileShop = isMobileShopBusiness(orgData?.businessType || user?.businessType)
  const { data: walletsData } = useGetWalletsQuery(undefined, {
    skip: !open || !isMobileShop,
  })
  const wallets = walletsData?.results?.filter((wallet) => wallet.isActive) ?? []

  const [rows, setRows] = useState<Row[]>([])
  const [receivedAt, setReceivedAt] = useState<string>(() => getBusinessToday())
  const [paymentType, setPaymentType] = useState<string>('Cash')
  const [paymentTypeSelectOpen, setPaymentTypeSelectOpen] = useState(false)
  const [walletType, setWalletType] = useState<string>('')
  const [walletSelectOpen, setWalletSelectOpen] = useState(false)
  const [paidAmount, setPaidAmount] = useState<number>(0)
  const [notes, setNotes] = useState<string>('')

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

  const paymentTypes = useMemo(
    () => (isMobileShop ? [...BASE_PAYMENT_TYPES, 'Wallet'] : [...BASE_PAYMENT_TYPES]),
    [isMobileShop],
  )

  const receivedAtRef = useRef<HTMLInputElement>(null)
  const paymentTypeRef = useRef<HTMLButtonElement>(null)
  const walletSelectRef = useRef<HTMLButtonElement>(null)
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
    setPaymentType('Cash')
    setWalletType('')
    setPaidAmount(0)
    setNotes('')
  }, [order])

  const receivableIndexes = useMemo(
    () => rows.map((r, i) => (r.remaining > 0 ? i : -1)).filter((i) => i >= 0),
    [rows],
  )

  const total = useMemo(
    () =>
      rows.reduce(
        (s, r) => s + Number(r.receivedQuantity || 0) * Number(r.priceAtPurchase || 0),
        0,
      ),
    [rows],
  )

  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.type === walletType),
    [wallets, walletType],
  )

  const selectedWalletBalance = Number(selectedWallet?.balance || 0)

  const detectPaidFromWallet = useCallback(
    (walletBalance: number, receiptTotal: number) =>
      Math.min(Math.max(0, receiptTotal), Math.max(0, walletBalance)),
    [],
  )

  useEffect(() => {
    if (paymentType === 'Cash') {
      setPaidAmount(total)
      return
    }
    if (paymentType === 'Wallet' && selectedWallet) {
      setPaidAmount(detectPaidFromWallet(selectedWalletBalance, total))
    }
  }, [paymentType, total, selectedWallet, selectedWalletBalance, detectPaidFromWallet])

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

  const focusAfterPaymentType = useCallback(() => {
    if (paymentType === 'Wallet') {
      focusField(walletSelectRef.current)
      return
    }
    if (paymentType === 'Cash') {
      focusFirstReceivableQty()
      return
    }
    focusField(paidAmountRef.current)
  }, [paymentType, focusFirstReceivableQty])

  const handleWalletChange = useCallback(
    (value: string) => {
      setWalletType(value)
      const wallet = wallets.find((item) => item.type === value)
      if (wallet) {
        setPaidAmount(detectPaidFromWallet(Number(wallet.balance || 0), total))
      }
    },
    [wallets, total, detectPaidFromWallet],
  )

  const handlePaymentTypeChange = useCallback(
    (value: string) => {
      setPaymentType(value)
      if (value === 'Cash') {
        setWalletType('')
        setPaidAmount(total)
        return
      }
      if (value === 'Credit' || value === 'Wallet') {
        setPaidAmount(0)
      }
      if (value !== 'Wallet') {
        setWalletType('')
      }
    },
    [total],
  )

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
    if (paymentType === 'Wallet' && !walletType.trim()) {
      toast.error('Please select a wallet for wallet payment')
      focusField(walletSelectRef.current)
      return
    }
    if (paymentType === 'Wallet' && Number(paidAmount || 0) > selectedWalletBalance + 0.000001) {
      toast.error(
        `Paid amount exceeds ${walletType} balance (Rs ${formatMoney(selectedWalletBalance)})`,
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
          notes: r.notes,
          batchNumber: r.batchNumber || undefined,
          expiryDate: r.expiryDate || undefined,
        })),
        receivedAt: new Date(receivedAt).toISOString(),
        paymentType,
        walletType: paymentType === 'Wallet' ? walletType.trim() : undefined,
        paidAmount: Number(paidAmount || 0),
        notes,
      }).unwrap()
      toast.success(`Goods received against ${order.orderNumber}`)

      if (result.purchase) {
        const printed = openPurchasePrintWindow(
          result.purchase,
          resolveSupplierName(order, result.purchase),
          'receipt',
          {
            t,
            branchDetails: branchPrintDetails,
            languageOverride: preferredLanguage,
            printInUrdu: getInvoicePrintInUrdu(),
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
    paymentType,
    walletType,
    receivedAt,
    paidAmount,
    notes,
    receive,
    onReceived,
    onClose,
    focusFirstReceivableQty,
    selectedWalletBalance,
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

  const balance = Math.max(0, total - Number(paidAmount || 0))
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
            <div className='w-[148px] shrink-0'>
              <Label htmlFor='received-at' className='text-xs'>
                Received on
              </Label>
              <Input
                ref={receivedAtRef}
                id='received-at'
                type='date'
                value={receivedAt}
                onChange={(e) => setReceivedAt(e.target.value)}
                onKeyDown={(e) => onEnterAdvance(e, () => focusField(paymentTypeRef.current))}
                className='mt-1.5 h-9'
              />
            </div>
            <div className='w-[140px] shrink-0'>
              <Label className='text-xs'>Payment type</Label>
              <Select
                value={paymentType}
                onOpenChange={setPaymentTypeSelectOpen}
                onValueChange={handlePaymentTypeChange}
              >
                <SelectTrigger
                  ref={paymentTypeRef}
                  className='mt-1.5 h-9'
                  onKeyDown={(e) => {
                    if (!paymentTypeSelectOpen) {
                      onEnterAdvance(e, focusAfterPaymentType)
                    }
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {paymentTypes.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                value={paymentType === 'Cash' ? total : paidAmount || ''}
                disabled={paymentType === 'Cash'}
                onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => onEnterAdvance(e, focusFirstReceivableQty)}
                onFocus={(e) => e.target.select()}
                className='mt-1.5 h-9'
                placeholder='0'
              />
            </div>
            {paymentType === 'Wallet' ? (
              <div className='min-w-[180px] flex-1'>
                <Label className='text-xs'>Select wallet *</Label>
                {wallets.length > 0 ? (
                  <>
                    <Select
                      value={walletType}
                      onOpenChange={setWalletSelectOpen}
                      onValueChange={handleWalletChange}
                    >
                      <SelectTrigger
                        ref={walletSelectRef}
                        className='mt-1.5 h-9'
                        onKeyDown={(e) => {
                          if (!walletSelectOpen) {
                            onEnterAdvance(e, () => focusField(paidAmountRef.current))
                          }
                        }}
                      >
                        <SelectValue placeholder='Select wallet...' />
                      </SelectTrigger>
                      <SelectContent>
                        {wallets.map((wallet) => (
                          <SelectItem key={wallet.id} value={wallet.type}>
                            {wallet.type} (Rs {formatMoney(wallet.balance)})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedWallet ? (
                      <p className='mt-1 text-[11px] text-muted-foreground'>
                        Balance Rs {formatMoney(selectedWalletBalance)}
                        {selectedWalletBalance < total ? (
                          <span className='text-amber-600'> · less than receipt total</span>
                        ) : null}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className='mt-1.5 text-xs text-muted-foreground'>
                    No wallets configured.
                  </p>
                )}
              </div>
            ) : null}
          </div>

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
              const lineTotal = Number(r.receivedQuantity || 0) * Number(r.priceAtPurchase || 0)
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
                          className='h-7 w-14 border-0 text-sm font-semibold focus-visible:ring-0'
                        />
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
                          className='h-7 w-14 border-0 bg-transparent text-sm font-semibold text-blue-700 focus-visible:ring-0'
                        />
                      </div>

                      <p className='ml-auto shrink-0 text-sm font-bold tabular-nums'>
                        Rs{lineTotal.toFixed(2)}
                      </p>
                    </div>
                  ) : null}
                  {!fullyReceivedAlready && (
                    <ReceiveRowBatchFields row={r} onChange={(patch) => updateRow(idx, patch)} />
                  )}
                  {fullyReceivedAlready ? (
                    <div className='flex items-center gap-2 px-2.5 py-2 text-xs text-emerald-700'>
                      <Package className='h-3.5 w-3.5' />
                      <span className='font-medium'>{r.productName}</span>
                      <span className='text-muted-foreground'>· Fully received</span>
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
                <span className='text-muted-foreground'>Receipt total</span>
                <span className='font-medium tabular-nums'>Rs {formatMoney(total)}</span>
              </div>
              <div className='flex justify-between text-sm'>
                <span className='text-muted-foreground'>Paid now</span>
                <span className='font-medium tabular-nums'>
                  Rs {formatMoney(Number(paidAmount || 0))}
                </span>
              </div>
              {paymentType === 'Wallet' && selectedWallet ? (
                <div className='flex justify-between text-sm'>
                  <span className='text-muted-foreground'>{walletType} balance</span>
                  <span
                    className={cn(
                      'font-medium tabular-nums',
                      selectedWalletBalance < Number(paidAmount || 0) && 'text-red-600',
                    )}
                  >
                    Rs {formatMoney(selectedWalletBalance)}
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

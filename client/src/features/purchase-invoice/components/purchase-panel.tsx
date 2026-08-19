import { useCallback, useState, useEffect, useRef, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useLanguage } from '@/context/language-context'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Trash2, Package, Printer, Save, ArrowLeft, Minus, Plus, Loader2, Search, ChevronDown, Check, Sparkles, X, ArrowLeftRight, ScanLine, ListChecks, Smartphone, Eye, Percent, Receipt, Banknote, CreditCard, Pencil, RotateCcw } from 'lucide-react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { BilingualName } from '@/components/bilingual-name'
import { getDisplayStock } from '@/lib/product-stock-display'
import { useIsPhone } from '@/hooks/use-mobile'
import { useIsNarrower } from '@/hooks/use-element-width'
import { PurchaseAiScanDialog, type PurchaseScanApplyPayload } from './purchase-ai-scan-dialog'
import { PurchaseItemVariantBatchFields } from './purchase-item-variant-batch-fields'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import type { ImeiEntryInput } from '@/stores/imei.api'
import { resolvePurchaseInvoiceBalance } from '@/features/purchase-invoice/utils/purchase-balance'

// Per-type accent for the Purchase Type buttons — mirrors Invoice's INVOICE_TYPE_STYLES
// (see invoice-panel.tsx): a light tint + thin border, not a filled/shadowed badge.
const PURCHASE_TYPE_STYLES: Record<'cash' | 'credit', { active: string; icon: string }> = {
  cash: {
    active: 'border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400',
    icon: 'text-green-600 dark:text-green-400',
  },
  credit: {
    active: 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-400',
    icon: 'text-blue-600 dark:text-blue-400',
  },
}

// Solid badge color for the Summary card's Purchase Type tag — mirrors InvoicePanel's
// own getTypeColor (see invoice-panel.tsx).
const getPurchaseTypeColor = (type: string) => (type === 'credit' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800')

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading.
const EMPTY_PURCHASE_CATALOG: PurchaseCatalogItem[] = []
// Cap the product dropdown's rendered rows — matches Invoice's identical cap (see
// invoice-panel.tsx) so a large catalog doesn't render hundreds of DOM rows per keystroke.
const MAX_VISIBLE_DROPDOWN_RESULTS = 50
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { useSelector, useDispatch } from 'react-redux'
import { RootState, AppDispatch } from '@/stores/store'
import { useCreatePurchaseMutation, useUpdatePurchaseMutation, useGetNextPurchaseNumberQuery, purchaseApi } from '@/stores/purchase.api'
import { useGetBranchQuery } from '@/stores/branch.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  buildMergedPaymentOptions,
  getWalletTypeFromOptionValue,
  isWalletOptionValue,
  toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { SplitPaymentFields } from '@/components/split-payment-fields'
import { toast } from 'sonner'
import Axios from '@/utils/Axios'
import summery from '@/utils/summery'
import { createEmptyPurchaseManualItem, type Purchase, type PurchaseItem, type Supplier } from '../index'
import { computeDiscountAmount, type DiscountType } from '../utils/discount'
import { getProductUnitOptions, getUnitAdjustedPrice, resolveUnitConversion } from '@/lib/inventory-unit-conversions'
import { isWholesaleRetailBusiness, isMobileShopBusiness } from '@/lib/business-types'
import { BuyUsedPhoneDialog } from '@/features/mobile-shop/old-phones/components/buy-used-phone-dialog'
import { getInvoicePrintInUrdu } from '@/features/invoice/utils/print-preferences'
import { getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { normalizeSuppliersList } from '../utils/catalog-helpers'
import { getSupplierId } from '../utils/scan-matching'
import { focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { PAPER_FORMATS, resolveThermalSize, resolveSheetSize, withPrintOrientation, type PaperSize, type PrintOrientation } from '@/features/invoice/utils/paper-format'
import type { InvoiceTemplate } from '@/features/invoice/utils/invoice-template'
import { PrintFormatButton } from '@/components/print-format-button'
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

const entryImei = (e: ImeiEntryInput) => (typeof e === 'string' ? e : e.imei)
const entryImei2 = (e: ImeiEntryInput) => (typeof e === 'string' ? undefined : e.imei2)
/** Real IMEIs are always 15 digits — strips anything a scanner/paste adds (spaces, dashes). */
const sanitizeImei = (raw: string) => raw.replace(/\D/g, '').slice(0, 15)

/**
 * Compact pill trigger for a purchase line's serial/IMEI entry — mirrors Invoice's
 * SerialSummaryTrigger (see invoice-panel.tsx) so the two flows read the same way.
 * Replaces an always-expanded "Serial Numbers (0/1)" box that used to run full width
 * under every serialized line, costing each row its own permanent chunk of vertical
 * space whether or not the seller was actively entering codes.
 */
function PurchaseSerialSummaryTrigger({
  selectedCount,
  quantity,
  isSerial,
  onClick,
}: {
  selectedCount: number
  quantity: number
  isSerial: boolean
  onClick: () => void
}) {
  const label = isSerial ? 'Serial #' : 'IMEI'
  const complete = selectedCount >= quantity
  return (
    <button
      type='button'
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        complete
          ? 'border-green-300 bg-green-50 text-green-700 hover:bg-green-100 dark:border-green-900 dark:bg-green-950/30 dark:text-green-400'
          : selectedCount > 0
            ? 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-400'
            : 'border-destructive/40 bg-destructive/5 text-destructive hover:bg-destructive/10',
      )}
    >
      {complete ? <Check className='h-2.5 w-2.5' /> : <ListChecks className='h-2.5 w-2.5' />}
      {label}: {selectedCount}/{quantity}
    </button>
  )
}

/**
 * Modal for entering the serial/IMEI numbers a purchase line adds to stock. Unlike
 * Invoice's SerialNumberDialog — which picks *existing* in-stock units from a fetched
 * pool — a purchase is the one place these numbers first enter the system, so this is
 * pure scan-or-type entry with no server-side "available" list behind it.
 */
function PurchaseSerialEntryDialog({
  open,
  onOpenChange,
  itemName,
  quantity,
  isSerial,
  imeis,
  onAdd,
  onRemove,
  onComplete,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  itemName: string
  quantity: number
  isSerial: boolean
  imeis: ImeiEntryInput[]
  onAdd: (value: string, value2?: string) => void
  onRemove: (value: string) => void
  // Continues the row's Enter-key cascade (batch fields, or the next row) — fired once
  // the line is fully entered, whether that happened by scanning the last unit or by
  // clicking Done early. Mirrors Invoice's SerialNumberDialog onComplete.
  onComplete: () => void
}) {
  const [draft, setDraft] = useState('')
  const [draft2, setDraft2] = useState('')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const input2Ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    if (!open) return
    setDraft('')
    setDraft2('')
    focusField(inputRef.current, false)
  }, [open])

  const label = isSerial ? 'Serial Number' : 'IMEI'
  const isFull = imeis.length >= quantity

  const finish = () => {
    onOpenChange(false)
    onComplete()
  }

  const commit = () => {
    const cleaned = draft.trim()
    const cleaned2 = draft2.trim()
    if (!cleaned) return
    if (cleaned2 && cleaned2 === cleaned) {
      toast.error(`${label} and ${label} 2 cannot be the same number`)
      return
    }
    // Check both slots of every already-added entry — otherwise a phone entered as
    // "112 / 12" lets a second unit reuse "12" as its own primary number undetected,
    // and dual-SIM matching would then treat the two as the same unit everywhere.
    const usedNumbers = new Set(imeis.flatMap((e) => [entryImei(e), entryImei2(e)].filter(Boolean)))
    if (usedNumbers.has(cleaned) || (cleaned2 && usedNumbers.has(cleaned2))) {
      toast.error(`This ${label.toLowerCase()} is already entered for another unit`)
      return
    }
    onAdd(cleaned, cleaned2 || undefined)
    setDraft('')
    setDraft2('')
    // The scan that reaches the required count closes the dialog and hands off to the
    // rest of the cascade itself — no extra Enter or click needed to move on.
    if (imeis.length + 1 >= quantity) finish()
    else inputRef.current?.focus()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2 text-base'>
            <ScanLine className='h-4 w-4 text-amber-600' />
            {isSerial ? 'Serial Numbers' : 'IMEI Numbers'}
          </DialogTitle>
          <DialogDescription className='truncate'>{itemName}</DialogDescription>
        </DialogHeader>

        <div className='flex items-center justify-between'>
          <span className='text-xs text-muted-foreground'>Scan or type, then Enter</span>
          <Badge className={isFull ? 'bg-green-600 hover:bg-green-600' : ''} variant={isFull ? 'default' : 'secondary'}>
            {imeis.length} / {quantity} entered
          </Badge>
        </div>

        {isSerial ? (
          <div className='flex items-center gap-2'>
            <Input
              ref={inputRef}
              placeholder={`Scan or type ${label.toLowerCase()}…`}
              value={draft}
              showVoiceInput={false}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ',') {
                  e.preventDefault()
                  commit()
                }
              }}
              className='h-9 flex-1'
            />
            <Button type='button' size='sm' className='shrink-0' onClick={commit}>
              <Plus className='h-3.5 w-3.5' />
            </Button>
          </div>
        ) : (
          <div className='space-y-1.5'>
            <div className='space-y-1'>
              <Input
                ref={inputRef}
                placeholder='Scan or type IMEI'
                value={draft}
                showVoiceInput={false}
                inputMode='numeric'
                onChange={(e) => setDraft(sanitizeImei(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === ',') {
                    e.preventDefault()
                    commit()
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    // Enter first hops to IMEI 2 (in case it's a dual-SIM unit); a second
                    // Enter there commits.
                    if (draft.trim()) input2Ref.current?.focus()
                  }
                }}
                className='h-9'
              />
              {draft.length > 0 && <p className='text-[11px] text-muted-foreground'>{draft.length}/15 digits</p>}
            </div>
            <div className='flex items-center gap-2'>
              <Input
                ref={input2Ref}
                placeholder='IMEI 2 (optional)'
                value={draft2}
                showVoiceInput={false}
                inputMode='numeric'
                onChange={(e) => setDraft2(sanitizeImei(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    commit()
                  } else if (e.key === 'Backspace' && !draft2) {
                    inputRef.current?.focus()
                  }
                }}
                className='h-9 flex-1'
              />
              <Button type='button' size='sm' className='shrink-0' onClick={commit}>
                <Plus className='h-3.5 w-3.5' />
              </Button>
            </div>
          </div>
        )}

        <div className='max-h-72 space-y-0.5 overflow-y-auto rounded-md border bg-muted/20 p-1.5'>
          {imeis.length > 0 ? (
            imeis.map((entry, idx) => {
              const num = entryImei(entry)
              const num2 = entryImei2(entry)
              return (
                <div key={`${num}-${idx}`} className='flex items-center justify-between rounded-sm px-3 py-2 text-sm bg-green-50 dark:bg-green-950/25'>
                  <span className='font-mono font-semibold'>{num2 ? `${num} · ${num2}` : num}</span>
                  <button
                    type='button'
                    onClick={() => onRemove(num)}
                    className='rounded-full p-0.5 hover:bg-black/10 dark:hover:bg-white/10'
                  >
                    <X className='h-3.5 w-3.5' />
                  </button>
                </div>
              )
            })
          ) : (
            <p className='py-8 text-center text-sm text-muted-foreground'>
              No {isSerial ? 'serial numbers' : 'IMEIs'} entered yet.
            </p>
          )}
        </div>

        <DialogFooter className='flex-row items-center justify-between sm:justify-between'>
          <span className={cn('text-xs font-medium', isFull ? 'text-green-600' : 'text-amber-600')}>
            {isFull ? `All ${quantity} entered` : `${quantity - imeis.length} more needed`}
          </span>
          <Button size='sm' onClick={finish}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface PurchasePanelProps {
  purchase: Purchase
  setPurchase: React.Dispatch<React.SetStateAction<Purchase>>
  updateQuantity: (productId: string, newQuantity: number, variantId?: string) => void
  removeFromPurchase: (productId: string, variantId?: string) => void
  updatePurchasePrice: (productId: string, price: number, variantId?: string) => void
  updateSellingPrice: (productId: string, price: number, variantId?: string) => void
  updateItemDiscount: (productId: string, patch: { type?: DiscountType; value?: number }, variantId?: string) => void
  calculateTotals: () => { subtotal: number; total: number; discount: number; itemDiscountTotal: number; grossSubtotal: number }
  onBackToList?: () => void
  onSaveSuccess?: (mode: 'create' | 'update') => void
  isEditing?: boolean
  editingPurchase?: any
  products: any[]
  productsLoading?: boolean
  setProducts?: React.Dispatch<React.SetStateAction<any[]>>
  /** When false (catalog hidden), the panel switches to a dense two-column "fast
   * purchasing" layout — single-row items and a sticky save bar — matching InvoicePanel. */
  showProductCatalog?: boolean
  /** Fast-purchasing mode only: DOM node (owned by the page, outside the cards' scroll
   * region) to portal the save/print bar into, so it's always visible without scrolling.
   * Falls back to an inline sticky bar until this is available. */
  stickyActionsContainer?: HTMLElement | null
}

export default function PurchasePanel({
  purchase,
  setPurchase,
  updateQuantity,
  removeFromPurchase,
  updatePurchasePrice,
  updateSellingPrice,
  updateItemDiscount,
  calculateTotals,
  onBackToList,
  onSaveSuccess,
  isEditing = false,
  editingPurchase,
  products,
  setProducts,
  showProductCatalog = true,
  stickyActionsContainer = null,
}: PurchasePanelProps) {
  const { t } = useLanguage()
  // Below sm (640px): items render as cards instead of the table (see the items list
  // below) — same isPhone gating InvoicePanel uses (see invoice-panel.tsx).
  const isPhone = useIsPhone()
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const { isElectron, online } = useSync()
  const canCreateSupplier = hasPermission('createSuppliers' as never)
  const canCreateProduct = hasPermission('createProducts' as never)
  const [savingType, setSavingType] = useState<'none' | PaperSize | null>(null)
  const [supplierSelectOpen, setSupplierSelectOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [supplierBalance, setSupplierBalance] = useState<number>(0)
  const [loadingBalance, setLoadingBalance] = useState(false)
  const [productSelectOpen, setProductSelectOpen] = useState<string>('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [suppliersLoading, setSuppliersLoading] = useState(false)
  const [aiScanOpen, setAiScanOpen] = useState(false)
  const [isEditingPurchaseNumber, setIsEditingPurchaseNumber] = useState(false)
  const [applyDiscountOpen, setApplyDiscountOpen] = useState(false)
  const [quickCreate, setQuickCreate] = useState<QuickCreateState>(null)
  const [quickCreateProductIndex, setQuickCreateProductIndex] = useState<number | null>(null)
  // Which line's serial/IMEI entry dialog is open — null means none.
  const [serialDialogIndex, setSerialDialogIndex] = useState<number | null>(null)

  // Raw text the user is currently typing into a decimal field (price/discount/paid
  // amount), keyed by a field id — e.g. "3:purchasePrice". A controlled input whose
  // value is re-derived from a *number* on every keystroke strips a trailing "."
  // the instant it's typed (parseFloat("40.") === 40), so "40.5" can never be typed.
  // Keeping the exact typed string here until blur fixes that while still committing
  // a parsed number to state on every change so totals stay live.
  const [numericDrafts, setNumericDrafts] = useState<Record<string, string>>({})
  const DECIMAL_INPUT_PATTERN = /^\d*\.?\d*$/
  const getNumericDraftValue = (key: string, committedValue: number): string =>
    numericDrafts[key] ?? (committedValue > 0 ? String(committedValue) : '')
  const handleNumericDraftChange = (key: string, raw: string, commit: (parsed: number) => void) => {
    if (raw !== '' && !DECIMAL_INPUT_PATTERN.test(raw)) return
    setNumericDrafts((prev) => ({ ...prev, [key]: raw }))
    commit(parseFloat(raw) || 0)
  }
  const clearNumericDraft = (key: string) => {
    setNumericDrafts((prev) => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  // Flip every discount field (each line item's + the overall one) to the other unit
  // in one click — re-deriving each raw value so the actual Rs discounted stays the
  // same, it's just entered/displayed in the new unit (e.g. a Rs 200 item discount on
  // an Rs 8000 line becomes 2.5% — not a fresh "200%" discount).
  const toggleAllDiscountTypes = useCallback(() => {
    setNumericDrafts({})
    setPurchase((prev) => {
      const targetType: DiscountType = prev.discountType === 'percentage' ? 'fixed' : 'percentage'

      const items = prev.items.map((item) => {
        const gross = item.quantity * (item.purchasePrice || 0)
        const currentAmount = computeDiscountAmount(gross, item.discountType, item.discountValue)
        const newValue = targetType === 'percentage'
          ? (gross > 0 ? (currentAmount / gross) * 100 : 0)
          : currentAmount
        return {
          ...item,
          discountType: targetType,
          discountValue: Math.round(newValue * 100) / 100,
        }
      })

      const subtotal = items.reduce((sum, item) => {
        const gross = item.quantity * (item.purchasePrice || 0)
        return sum + (gross - computeDiscountAmount(gross, item.discountType, item.discountValue))
      }, 0)
      const currentOverallAmount = computeDiscountAmount(subtotal, prev.discountType, prev.discountValue)
      const newOverallValue = targetType === 'percentage'
        ? (subtotal > 0 ? (currentOverallAmount / subtotal) * 100 : 0)
        : currentOverallAmount

      return {
        ...prev,
        items,
        discountType: targetType,
        discountValue: Math.round(newOverallValue * 100) / 100,
      }
    })
  }, [setPurchase])

  const addImeiToItem = useCallback((index: number, value: string, value2?: string) => {
    const cleaned = value.trim()
    const cleaned2 = value2?.trim()
    if (!cleaned || (cleaned2 && cleaned2 === cleaned)) return
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => {
        if (i !== index) return item
        const existing = item.imeis || []
        const usedNumbers = new Set(existing.flatMap((e) => [entryImei(e), entryImei2(e)].filter(Boolean)))
        if (usedNumbers.has(cleaned) || (cleaned2 && usedNumbers.has(cleaned2))) return item
        return { ...item, imeis: [...existing, cleaned2 ? { imei: cleaned, imei2: cleaned2 } : cleaned] }
      }),
    }))
  }, [setPurchase])

  const removeImeiFromItem = useCallback((index: number, value: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) =>
        i === index ? { ...item, imeis: (item.imeis || []).filter((e) => entryImei(e) !== value) } : item,
      ),
    }))
  }, [setPurchase])

  const updateItemVariant = useCallback((index: number, variantId: string | undefined) => {
    setPurchase((prev) => ({
      ...prev,
      // Clear batch/expiry when the variant changes — they belong to the previously
      // selected variant and may no longer apply (e.g. switching to a non-batch variant).
      items: prev.items.map((item, i) =>
        i === index ? { ...item, variantId, batchNumber: undefined, expiryDate: undefined } : item,
      ),
    }))
  }, [setPurchase])

  const updateItemBatchNumber = useCallback((index: number, value: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, batchNumber: value } : item)),
    }))
  }, [setPurchase])

  const updateItemExpiryDate = useCallback((index: number, value: string) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, expiryDate: value } : item)),
    }))
  }, [setPurchase])

  const updateItemBatchCost = useCallback((index: number, cost: number) => {
    setPurchase((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => (i === index ? { ...item, purchasePrice: cost } : item)),
    }))
  }, [setPurchase])

  // Per-row field refs, keyed by `${index}:${field}` — index, not productId, since two
  // rows can be the same product with different variants and must never collide.
  const itemFieldRefs = useRef<Record<string, HTMLInputElement | null>>({})
  // Whether each row's batch/expiry fields are currently rendered, written directly
  // during the child's render (not via setState) so the Sale Price Enter handler can
  // read it synchronously without an extra render round-trip.
  const itemNeedsBatchRef = useRef<Record<number, boolean>>({})
  // Opens (or advances past) a row's batch dialog — likewise written directly during
  // the child's render. A plain callback registry rather than a DOM ref: the batch
  // field has no visible input to focus, and driving it through `.focus()` on a proxy
  // button backfired — Radix's Dialog restores focus to its trigger on close, which
  // re-fired that focus handler and kept appending new rows after every batch save.
  const itemBatchTriggerRef = useRef<Record<number, () => void>>({})
  const setItemFieldRef = (index: number, field: string) => (el: HTMLInputElement | null) => {
    itemFieldRefs.current[`${index}:${field}`] = el
  }
  const focusItemField = (index: number, field: string) => focusField(itemFieldRefs.current[`${index}:${field}`])
  const paymentTypeTriggerRef = useRef<HTMLButtonElement>(null)
  const paymentMethodTriggerRef = useRef<HTMLButtonElement>(null)
  const purchaseDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  // The items table (colgroup: 8 + auto + 110 + 100 + 100 + 85 + 90 + 10px) needs ~700px+ to
  // render its fixed-width columns without table-fixed proportionally squeezing all of them
  // below their intended width (that's what causes headers/values to visually run together —
  // not overflow, since the table is forced to 100% of a too-narrow container). Below that,
  // fall back to the same stacked-card row layout used for catalog-visible/phone (see
  // renderPurchaseItemCard) — same "product on its own line, controls wrap below" behavior,
  // just triggered by the item area's actual rendered width instead of viewport width alone,
  // so a docked devtools panel or a collapsed sidebar can trigger it too.
  const itemsAreaRef = useRef<HTMLDivElement>(null)
  const isItemsAreaNarrow = useIsNarrower(itemsAreaRef, 700)
  const [, setPaymentMethodSelectOpen] = useState(false)

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
  const defaultPaperSize: PaperSize = branchData?.printSettings?.paperSize ?? 'thermal80'
  const invoiceTemplate: InvoiceTemplate = branchData?.printSettings?.template ?? 'standard'
  const printOrientation: PrintOrientation = branchData?.printSettings?.printOrientation ?? 'portrait'
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  const showUnitConversions = isWholesaleRetailBusiness(orgData?.businessType || user?.businessType)
  const isMobileShop = isMobileShopBusiness(orgData?.businessType || user?.businessType)
  const [buyUsedPhoneOpen, setBuyUsedPhoneOpen] = useState(false)
  // Purchase Type (Cash = settled now vs Credit = may owe a balance) is a separate concern
  // from Payment Method (which real account absorbs whatever's paid right now) — a Credit
  // purchase can still be partially paid from a real account, so both fields are shown.
  // (Segmented buttons in the Details card below render these two options directly.)
  // Paying a supplier is a money-out action — show wallet balances so the user can avoid
  // overdrawing. No generic 'Bank Transfer'/'Card' placeholders — every real account (bank or
  // mobile wallet) is already selectable here by its own name.
  const purchasePaymentMethodOptions = useMemo(
    () =>
      buildMergedPaymentOptions(
        [{ value: 'cash', label: t('cash') || 'Cash' }],
        wallets,
        true,
      ),
    [wallets, t],
  )

  // Filter suppliers by name, Urdu name, or phone
  const filteredSuppliers = suppliers.filter((supplier) =>
    matchesBilingualSearch(supplierSearchQuery, supplier.name, supplier.nameUrdu, supplier.phone),
  )

  // Flat purchase catalog: one row per non-variant product, and one row per real
  // variant for hasVariants products — each with its own real price/cost/stock, so the
  // picker shows "Toshiba — Black/64GB" with its own numbers instead of a vague
  // rolled-up product row. See docs/architecture/universal-product-migration.md.
  const { data: purchaseCatalog = EMPTY_PURCHASE_CATALOG, isLoading: purchaseCatalogLoading } = useGetPurchasableCatalogQuery()

  const filteredPurchaseProducts = purchaseCatalog.filter((item) =>
    matchesBilingualSearch(
      productSearchQuery,
      item.name,
      item.nameUrdu,
      item.barcode,
      item.brand?.name,
    ),
  )
  // Capped slice actually rendered — matches Invoice's identical
  // visibleSellableProducts/filteredSellableProducts split.
  const visiblePurchaseProducts = filteredPurchaseProducts.slice(0, MAX_VISIBLE_DROPDOWN_RESULTS)

  // RTK Query mutations
  const [createPurchase] = useCreatePurchaseMutation()
  const [updatePurchase] = useUpdatePurchaseMutation()
  // Preview of the number the next save would actually receive (see next-number route +
  // generateNextPurchaseInvoiceNumber) — shown read-only until the user clicks the pencil
  // to type their own. Only relevant before the purchase is first saved; a saved purchase
  // already has its real invoiceNumber and that number can't be changed here. Mirrors
  // Invoice's identical preview query (see invoice-panel.tsx).
  const { data: nextPurchaseNumberData } = useGetNextPurchaseNumberQuery(undefined, { skip: isEditing })
  const previewedPurchaseNumber = nextPurchaseNumberData?.invoiceNumber as string | undefined

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
    // Fresh purchase (every row still an untouched empty manual entry) — auto-open the
    // first row's product picker. Matches on "all rows empty" rather than a single row
    // so this still fires now that a new purchase starts pre-populated with several
    // empty rows.
    const allEmptyManual =
      purchase.items.length > 0 &&
      purchase.items.every(
        (item) => item.isManualEntry && !(item.product?.id || (item.product as { _id?: string })?._id)
      )
    if (allEmptyManual && !purchaseAutoOpenDoneRef.current) {
      purchaseAutoOpenDoneRef.current = true
      queueMicrotask(() => setProductSelectOpen('manual-0'))
    }
    if (!allEmptyManual) {
      purchaseAutoOpenDoneRef.current = false
    }
  }, [isEditing, purchase.items])

  // Purchase Type "Cash" always means fully paid right now — whichever account it went
  // through. Credit purchases (or a Cash purchase with split payment on) show an editable
  // Paid Amount input instead (see the JSX below).
  useEffect(() => {
    if (purchase.type === 'cash' && !purchase.splitPaymentMethod) {
      const currentTotal = calculateTotals().total
      if ((purchase.paidAmount || 0) !== currentTotal || (purchase.balance || 0) !== 0) {
        setPurchase((prev) => ({
          ...prev,
          paidAmount: currentTotal,
          balance: 0,
        }))
      }
    }
  }, [purchase.type, purchase.splitPaymentMethod, purchase.paidAmount, purchase.balance, calculateTotals, setPurchase])

  // Shared branch/org details for every print path (thermal, A4, and the unsaved
  // Preview) — factored out so previewPurchase doesn't duplicate printPurchase's
  // assembly of the same fields.
  const purchaseBranchDetails = useMemo(
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
    [orgData, branchData]
  )

  // Print functionality
  const printPurchase = useCallback(
    (purchaseData: any, paperSize: PaperSize = defaultPaperSize) => {
      try {
        import('@/utils/purchasePrintUtils').then((module) => {
          const supplierName = purchase.supplier?.name || 'Unknown'
          const branchDetails = {
            name: resolveBranchCompanyName(orgData?.name, branchData?.name),
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
          const format = PAPER_FORMATS[withPrintOrientation(paperSize, printOrientation)]
          const html =
            format.family === 'thermal'
              ? module.generatePurchaseInvoiceHTML(purchaseData, supplierName, t, purchaseBranchDetails, preferredLanguage, getInvoicePrintInUrdu(), resolveThermalSize(paperSize))
              : module.generatePurchaseInvoiceA4HTML(purchaseData, supplierName, t, purchaseBranchDetails, preferredLanguage, getInvoicePrintInUrdu(), withPrintOrientation(resolveSheetSize(paperSize), printOrientation), invoiceTemplate)

          const printWindow = window.open('', '_blank', `width=${format.popup.width},height=${format.popup.height},scrollbars=yes,resizable=yes`)
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
    [purchase.supplier, t, preferredLanguage, invoiceTemplate, purchaseBranchDetails]
  )

  // "Preview" header action (dense mode only) — opens the same A4 print HTML used by
  // Save & Print, but built straight from the live, not-yet-saved `purchase` state (no
  // create/update API call, no invoiceNumber yet). Mirrors InvoicePanel's
  // previewInvoice/buildA4PrintData (see invoice-panel.tsx).
  const previewPurchase = useCallback(async () => {
    const itemsWithProducts = purchase.items.filter((item) => {
      const pid = item.product.id || (item.product as any)?._id
      return pid && item.product.name
    })
    if (itemsWithProducts.length === 0) {
      toast.error(t('Add at least one item to preview'))
      return
    }
    const draftTotals = calculateTotals()
    const splitPaidAmountForPreview = purchase.splitPaymentMethod ? Math.max(0, Number(purchase.splitPaidAmount || 0)) : 0
    const totalPaidAmountForPreview = (purchase.paidAmount || 0) + splitPaidAmountForPreview
    const draftPurchaseData = {
      invoiceNumber: (isEditing && editingPurchase?.invoiceNumber) || t('Draft Preview'),
      items: itemsWithProducts,
      total: draftTotals.total,
      totalAmount: draftTotals.total,
      discount: draftTotals.discount,
      paidAmount: totalPaidAmountForPreview,
      balance: resolvePurchaseInvoiceBalance(draftTotals.total, totalPaidAmountForPreview),
      purchaseDate: purchase.date,
      notes: purchase.notes,
    }
    try {
      const module = await import('@/utils/purchasePrintUtils')
      const supplierName = purchase.supplier?.name || 'Unknown'
      const sheetFormat = withPrintOrientation(resolveSheetSize(defaultPaperSize), printOrientation)
      const html = module.generatePurchaseInvoiceA4HTML(draftPurchaseData, supplierName, t, purchaseBranchDetails, preferredLanguage, getInvoicePrintInUrdu(), sheetFormat, invoiceTemplate)
      const format = PAPER_FORMATS[sheetFormat]
      const printWindow = window.open('', '_blank', `width=${format.popup.width},height=${format.popup.height},scrollbars=yes,resizable=yes`)
      if (printWindow) {
        printWindow.document.write(html)
        printWindow.document.close()
        printWindow.print()
      }
    } catch (error) {
      console.error('Preview error:', error)
      toast.error('Failed to open preview')
    }
  }, [purchase, calculateTotals, isEditing, editingPurchase, t, preferredLanguage, invoiceTemplate, purchaseBranchDetails, defaultPaperSize, printOrientation])

  // Handle product selection for manual entries
  const handleProductSelect = useCallback(
    (
      itemIndex: number,
      product: any,
      variantId?: string,
      variantMeta?: { trackBatch?: boolean; trackExpiry?: boolean; knownBatches?: PurchaseItem['knownBatches'] },
    ) => {
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
          isManualEntry: false,
          variantId,
          trackBatch: variantMeta?.trackBatch,
          trackExpiry: variantMeta?.trackExpiry,
          knownBatches: variantMeta?.knownBatches,
        }
        return { ...prev, items: newItems }
      })
      setProductSelectOpen('')
      setProductSearchQuery('')
      // Focus the quantity input of the just-selected row
      setTimeout(() => focusItemField(itemIndex, 'quantity'), 100)
    },
    [setPurchase]
  )

  // Selecting a flat catalog row (product or real variant) — builds the product-shaped
  // object the rest of this form expects, using the *variant's* real price/cost/stock
  // when the row is a variant, and wires variantId + trackBatch/trackExpiry/batches
  // straight through (the catalog already has all of it) so the batch fields render
  // instantly instead of waiting on a fresh network round-trip.
  const handleCatalogItemSelect = useCallback(
    (itemIndex: number, catalogItem: PurchaseCatalogItem) => {
      const builtProduct = {
        id: catalogItem.productId,
        _id: catalogItem.productId,
        // catalogItem.name already reads "Toshiba — 12" for a variant row —
        // productName alone would lose the variant label the user just picked.
        name: catalogItem.name,
        nameUrdu: catalogItem.nameUrdu,
        image: catalogItem.image,
        barcode: catalogItem.barcode,
        unit: catalogItem.unit,
        hasVariants: catalogItem.type === 'variant',
        trackImei: catalogItem.trackImei,
        trackSerial: catalogItem.trackSerial,
        price: catalogItem.price,
        cost: catalogItem.cost,
        stockQuantity: catalogItem.stockQuantity,
      }
      handleProductSelect(itemIndex, builtProduct, catalogItem.variantId, {
        trackBatch: catalogItem.trackBatch,
        trackExpiry: catalogItem.trackExpiry,
        // costPerUnit is only ever omitted for roles without product/purchasing access
        // (see getPurchasableCatalog) — reaching Purchase Invoice already requires
        // viewPurchases, so this is just satisfying the stricter local type, not a
        // real fallback that should ever be exercised here.
        knownBatches: catalogItem.batches?.map((b) => ({ ...b, costPerUnit: b.costPerUnit ?? 0 })),
      })
    },
    [handleProductSelect]
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
  }, [setPurchase, purchase.items])

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

  // Keyboard cascade for a purchase row: Quantity → Purchase Price → Sale Price →
  // (Serial/IMEI entry dialog, only for tracked products not yet fully entered) →
  // (Batch Number → Expiry Date, only when the selected variant tracks batch/expiry) →
  // a brand new row with the product picker already open.
  const handlePurchaseQuantityKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      onEnterAdvance(e, () => focusItemField(index, 'purchasePrice'))
    },
    [],
  )

  const handlePurchasePriceKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      onEnterAdvance(e, () => focusItemField(index, 'sellingPrice'))
    },
    [],
  )

  // Shared tail of the cascade — used both when Sale Price's Enter skips serial entry
  // (not tracked, or already fully entered) and as the serial dialog's onComplete, so
  // finishing serial entry continues into batch fields instead of stranding the seller
  // there with no keyboard path onward.
  const advanceAfterSaleFields = useCallback((index: number) => {
    if (itemNeedsBatchRef.current[index]) {
      itemBatchTriggerRef.current[index]?.()
    } else {
      addNewPurchaseRowAndOpenProduct()
    }
  }, [addNewPurchaseRowAndOpenProduct])

  const handleSellingPriceKeyDown = useCallback(
    (e: React.KeyboardEvent, index: number) => {
      onEnterAdvance(e, () => {
        const item = purchase.items[index]
        const needsSerial = !!(item?.product?.trackImei || item?.product?.trackSerial)
        if (needsSerial && (item?.imeis || []).length < (item?.quantity || 0)) {
          setSerialDialogIndex(index)
          return
        }
        advanceAfterSaleFields(index)
      })
    },
    [purchase.items, advanceAfterSaleFields],
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
    async (printType: 'none' | PaperSize = 'none') => {
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

      // IMEI/serial-tracked products must have exactly one number entered per unit purchased
      for (const item of validItems) {
        if (!item.product.trackImei && !item.product.trackSerial) continue
        const label = item.product.trackSerial ? 'serial' : 'IMEI'
        const imeiCount = (item.imeis || []).filter((e) => entryImei(e).trim()).length
        if (imeiCount !== item.quantity) {
          toast.error(
            `${item.product.name}: enter ${item.quantity} ${label} number(s) — ${imeiCount} entered`,
          )
          return
        }
      }

      setSavingType(printType)

      const totals = calculateTotals()

      console.log('Saving purchase with data:', purchase)
      console.log('Supplier ID:', supplierId)
      console.log('Totals:', totals)

      // Validate and normalize the payment fields
      const purchaseType: 'cash' | 'credit' = purchase.type === 'credit' ? 'credit' : 'cash'
      const paymentMethod: 'cash' | 'wallet' = purchase.paymentMethod === 'wallet' ? 'wallet' : 'cash'
      if (paymentMethod === 'wallet' && !purchase.walletType) {
        toast.error(t('Please select a wallet for wallet payment'))
        return
      }
      const splitPaymentMethod = purchase.splitPaymentMethod
      if (splitPaymentMethod === 'wallet' && !purchase.splitWalletType) {
        toast.error('Please select an account for the split payment')
        return
      }
      // The split leg is an independent amount, not carved out of Paid Amount — the two
      // legs add up to what was actually paid (see split-payment-fields.tsx).
      const splitPaidAmount = splitPaymentMethod ? Math.max(0, Number(purchase.splitPaidAmount || 0)) : 0
      const totalPaidAmount = (purchase.paidAmount || 0) + splitPaidAmount

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
          
          const itemGross = item.quantity * item.purchasePrice
          const itemDiscountType: DiscountType = item.discountType || 'fixed'
          const itemDiscountValue = item.discountValue || 0
          const itemDiscountAmount = computeDiscountAmount(itemGross, itemDiscountType, itemDiscountValue)

          return {
            product: productId,
            quantity: item.quantity,
            unit: item.unit || item.product.unit || 'pcs',
            conversionFactor: item.conversionFactor,
            stockQuantity: item.stockQuantity,
            priceAtPurchase: item.purchasePrice,
            sellingPriceAtPurchase: item.sellingPrice || 0,
            discountType: itemDiscountType,
            discountValue: itemDiscountValue,
            discountAmount: itemDiscountAmount,
            total: itemGross - itemDiscountAmount,
            imeis: (item.product.trackImei || item.product.trackSerial) ? (item.imeis || []) : undefined,
            variantId: item.variantId || undefined,
            batchNumber: item.variantId ? (item.batchNumber || undefined) : undefined,
            expiryDate: item.variantId ? (item.expiryDate || undefined) : undefined,
          };
        }),
        discountType: purchase.discountType || 'fixed',
        discountValue: purchase.discountValue || 0,
        discount: totals.discount,
        totalAmount: totals.total,
        paidAmount: totalPaidAmount,
        balance: resolvePurchaseInvoiceBalance(totals.total, totalPaidAmount),
        type: purchaseType,
        paymentMethod: paymentMethod,
        walletType: paymentMethod === 'wallet' ? purchase.walletType : undefined,
        splitPaymentMethod: splitPaymentMethod,
        splitWalletType: splitPaymentMethod === 'wallet' ? purchase.splitWalletType : undefined,
        splitPaidAmount: splitPaidAmount,
        purchaseDate: purchase.date || new Date().toISOString(),
        notes: purchase.notes?.trim() || undefined,
        // Manual override only applies on create — saved purchases keep their number.
        ...(!isEditing && purchase.invoiceNumber?.trim() ? { invoiceNumber: purchase.invoiceNumber.trim() } : {}),
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
            // Not purchase.items — that still includes the trailing empty manual row(s)
            // the form always keeps ready for the next entry, which printed as bogus
            // "Unknown Product" lines.
            items: validItems,
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
  // The split leg is an independent amount that adds to Paid Amount, not carved out of it —
  // see split-payment-fields.tsx. This is what's actually been paid so far.
  const totalPaidNow = (purchase.paidAmount || 0) + (purchase.splitPaymentMethod ? (purchase.splitPaidAmount || 0) : 0)
  const isLoading = savingType !== null

  useInvoiceSaveShortcuts(
    () => handleSavePurchase('none'),
    () => handleSavePurchase(defaultPaperSize),
    () => handleSavePurchase(resolveSheetSize(defaultPaperSize)),
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
        // OCR only reliably distinguishes "credit terms" from everything else — it can't
        // know which of the user's real accounts was used, so paymentMethod stays as-is.
        type: payload.paymentType === 'Credit' ? 'credit' : prev.type,
      }))
    },
    [setPurchase],
  )

  // Card rendering for one purchase line — used unconditionally in catalog-shown mode
  // and on phone widths, and as the expanded fallback (spanning every column of the
  // dense-mode table) for manual/unselected rows and rows needing batch/expiry/variant
  // fields, which don't fit in table cells. Mirrors InvoicePanel's renderItemCard split
  // (see invoice-panel.tsx).
  const renderPurchaseItemCard = (item: PurchaseItem, index: number) => {
                const productId = item.product.id || (item.product as any)._id;
                const compact = !showProductCatalog

                // Show product selector for manual entries
                if (item.isManualEntry && !productId) {
                  return (
                    <div key={`manual-${index}`} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                      <div className={cn('flex items-center gap-3', compact ? 'p-2' : 'p-3')}>
                        <div className={cn('rounded-lg bg-muted flex items-center justify-center flex-shrink-0', compact ? 'w-8 h-8' : 'w-10 h-10')}>
                          <Package className={cn('text-muted-foreground/50', compact ? 'h-4 w-4' : 'h-5 w-5')} />
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
                            <PopoverContent className="w-[calc(100vw-2rem)] max-w-[560px] p-0" align="start">
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
                                <CommandList className="max-h-[300px] overflow-y-auto">
                                  {purchaseCatalogLoading && purchaseCatalog.length === 0 ? (
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
                                      {visiblePurchaseProducts.map((catalogItem) => (
                                        <CommandItem
                                          key={catalogItem.id}
                                          value={`${catalogItem.id}-${catalogItem.name}`}
                                          onSelect={() => handleCatalogItemSelect(index, catalogItem)}
                                          className="flex items-center gap-3 cursor-pointer p-3"
                                        >
                                          {catalogItem.image?.url ? (
                                            <img
                                              src={catalogItem.image.url}
                                              alt={catalogItem.name}
                                              className="w-8 h-8 object-cover rounded-lg flex-shrink-0"
                                            />
                                          ) : (
                                            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                                              <Package className="h-4 w-4 text-muted-foreground" />
                                            </div>
                                          )}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
                                              <div className="font-medium text-sm truncate shrink-0">{catalogItem.name}</div>
                                              {catalogItem.nameUrdu?.trim() ? (
                                                <span
                                                  dir="rtl"
                                                  className={cn(
                                                    'min-w-0 truncate text-xs',
                                                    getUrduSecondaryNameClasses(catalogItem.nameUrdu),
                                                  )}
                                                >
                                                  {catalogItem.nameUrdu.trim()}
                                                </span>
                                              ) : null}
                                              {catalogItem.brand?.name && (
                                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                                                  {catalogItem.brand.name}
                                                </Badge>
                                              )}
                                            </div>
                                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                              {catalogItem.barcode && <span>{catalogItem.barcode}</span>}
                                              <span className="text-amber-600">Purchase Price: Rs{Number(catalogItem.cost || 0).toFixed(2)}</span>
                                              <span className={catalogItem.stockQuantity <= 5 ? 'text-red-500 font-medium' : 'text-green-600'}>
                                                Stock: {catalogItem.stockQuantity}
                                              </span>
                                              {catalogItem.trackBatch && (
                                                <span className="text-blue-600">
                                                  {catalogItem.batches?.length || 0} batch{catalogItem.batches?.length === 1 ? '' : 'es'}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  )}
                                </CommandList>
                                {filteredPurchaseProducts.length > visiblePurchaseProducts.length ? (
                                  <div className="border-t px-3 py-2 text-center text-xs text-muted-foreground">
                                    {t('Showing {{shown}} of {{total}} — keep typing to narrow', {
                                      shown: visiblePurchaseProducts.length,
                                      total: filteredPurchaseProducts.length,
                                    })}
                                  </div>
                                ) : null}
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

                const deleteButton = (
                  <Button
                    size="sm"
                    variant="ghost"
                    className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
                    onClick={() => removeFromPurchase(productId, item.variantId)}
                  >
                    <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
                  </Button>
                )

                // Line-level discount (supplier discounting this one product) — net is
                // what actually feeds the purchase subtotal.
                const itemGross = item.quantity * item.purchasePrice
                const itemDiscountAmount = computeDiscountAmount(itemGross, item.discountType, item.discountValue)
                const itemNet = itemGross - itemDiscountAmount

                return (
                  <div key={`${productId}-${index}`} className='rounded-xl border bg-card shadow-sm overflow-hidden'>
                    {/* Compact (catalog hidden): row1 + row2 flatten via `contents` into one
                        flex-wrap line — name flexes in the middle, qty/price/subtotal/delete
                        pack to the end — instead of stacking, so each item takes ~half the height. */}
                    <div className={cn(compact && 'flex flex-wrap items-center gap-2 p-2')}>
                    {/* Row 1: Image + Info + Delete */}
                    <div className={cn(compact ? 'contents' : 'flex items-start gap-3 p-3')}>
                      {item.product.image?.url ? (
                        <img
                          src={item.product.image.url}
                          alt={item.product.name}
                          className={cn('object-cover rounded-lg flex-shrink-0', compact ? 'w-8 h-8' : 'w-10 h-10 mt-0.5')}
                        />
                      ) : (
                        <div className={cn('rounded-lg bg-muted flex items-center justify-center flex-shrink-0', compact ? 'w-8 h-8' : 'w-10 h-10 mt-0.5')}>
                          <Package className={cn('text-muted-foreground/50', compact ? 'h-4 w-4' : 'h-5 w-5')} />
                        </div>
                      )}

                      {/* min-w-[110px] (instead of min-w-0) in compact mode — without a floor,
                          flex-1 lets this shrink to near-nothing once the qty/cost/discount/
                          sell/total controls (siblings on the same flex-wrap line) claim their
                          fixed widths, truncating the name to 2-3 characters. The floor forces
                          those controls to wrap to their own line instead once space is tight. */}
                      <div className={cn('flex-1', compact ? 'min-w-[110px]' : 'min-w-0')}>
                        <BilingualName
                          primary={item.product.name}
                          secondary={item.product.nameUrdu}
                          primaryClassName='font-semibold text-sm'
                          truncate={compact}
                        />
                        {/* Stock + serial-entry status live in one wrapping pill row right
                            under the name, matching Invoice's item row — instead of the
                            serial box being its own always-expanded section further down,
                            it's now a status pill here that opens a dialog on click. */}
                        <div className='flex flex-wrap items-center gap-1.5 mt-1'>
                          {!compact && item.product.barcode && (
                            <span className='text-xs text-muted-foreground'>{item.product.barcode}</span>
                          )}
                          {!compact && (
                            <span className='text-xs text-muted-foreground'>Rs{item.purchasePrice} · {item.unit || item.product.unit || 'pcs'}</span>
                          )}
                          {(() => {
                            const stock = getDisplayStock(item.product)
                            return (
                              <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
                                stock <= 0 ? 'bg-red-100 text-red-700' :
                                stock <= 5 ? 'bg-red-50 text-red-500' :
                                stock <= 20 ? 'bg-amber-50 text-amber-600' :
                                'bg-green-50 text-green-700'
                              }`}>
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                  stock <= 0 ? 'bg-red-500' :
                                  stock <= 5 ? 'bg-red-400' :
                                  stock <= 20 ? 'bg-amber-400' :
                                  'bg-green-500'
                                }`} />
                                {stock <= 0 ? 'Out of stock' : `${stock} in stock`}
                              </span>
                            )
                          })()}
                          {(item.product.trackImei || item.product.trackSerial) && (
                            <PurchaseSerialSummaryTrigger
                              selectedCount={(item.imeis || []).length}
                              quantity={item.quantity}
                              isSerial={!!item.product.trackSerial}
                              onClick={() => setSerialDialogIndex(index)}
                            />
                          )}
                        </div>
                      </div>

                      {!compact && deleteButton}
                    </div>

                    {/* Row 2: Controls */}
                    <div className={cn(compact ? 'contents' : 'flex items-center gap-3 flex-wrap border-t bg-muted/20 px-3 py-2.5')}>
                      {/* Quantity Stepper */}
                      <div className='flex items-center gap-1.5 shrink-0'>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <Button
                            size="sm"
                            variant="ghost"
                            className='h-7 w-7 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            onClick={() => updateQuantity(productId, Math.max(1, item.quantity - 1), item.variantId)}
                          >
                            <Minus className='h-3.5 w-3.5' />
                          </Button>
                          <Input
                            ref={setItemFieldRef(index, 'quantity')}
                            type="number"
                            min="1"
                            value={item.quantity}
                            onChange={(e) => updateQuantity(productId, parseInt(e.target.value) || 1, item.variantId)}
                            onKeyDown={(e) => handlePurchaseQuantityKeyDown(e, index)}
                            onFocus={(e) => e.target.select()}
                            className='h-7 w-14 text-center text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                          <Button
                            size="sm"
                            variant="ghost"
                            className='h-7 w-7 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
                            onClick={() => updateQuantity(productId, item.quantity + 1, item.variantId)}
                          >
                            <Plus className='h-3.5 w-3.5' />
                          </Button>
                        </div>
                        <span className='text-xs text-muted-foreground'>{item.unit || item.product.unit || 'pcs'}</span>
                      </div>

                      {showUnitConversions && (
                        <div className='flex flex-col gap-1 min-w-[80px] shrink-0'>
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
                            ref={setItemFieldRef(index, 'purchasePrice')}
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={getNumericDraftValue(`${index}:purchasePrice`, item.purchasePrice)}
                            onChange={(e) =>
                              handleNumericDraftChange(`${index}:purchasePrice`, e.target.value, (parsed) =>
                                updatePurchasePrice(productId, parsed, item.variantId),
                              )
                            }
                            onKeyDown={(e) => handlePurchasePriceKeyDown(e, index)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => clearNumericDraft(`${index}:purchasePrice`)}
                            className='h-7 w-20 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>
                      </div>

                      {/* − separator */}
                      <span className='text-muted-foreground/60 text-sm select-none'>−</span>

                      {/* Item Discount Input */}
                      <div className='flex flex-col gap-0.5'>
                        <span className='text-[10px] text-muted-foreground leading-none'>Discount</span>
                        <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                          <Input
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={getNumericDraftValue(`${index}:discountValue`, item.discountValue || 0)}
                            onChange={(e) =>
                              handleNumericDraftChange(`${index}:discountValue`, e.target.value, (parsed) =>
                                updateItemDiscount(productId, { value: Math.max(0, parsed) }, item.variantId),
                              )
                            }
                            onFocus={(e) => e.target.select()}
                            onBlur={() => clearNumericDraft(`${index}:discountValue`)}
                            placeholder='0'
                            className='h-7 w-14 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                          <button
                            type="button"
                            onClick={() =>
                              updateItemDiscount(
                                productId,
                                { type: item.discountType === 'percentage' ? 'fixed' : 'percentage' },
                                item.variantId,
                              )
                            }
                            title='Click to switch between Rs and % discount'
                            className='px-2 h-7 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors'
                          >
                            {item.discountType === 'percentage' ? '%' : 'Rs'}
                          </button>
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
                            ref={setItemFieldRef(index, 'sellingPrice')}
                            type="text"
                            inputMode="decimal"
                            showVoiceInput={false}
                            value={getNumericDraftValue(`${index}:sellingPrice`, item.sellingPrice ?? 0)}
                            onChange={(e) =>
                              handleNumericDraftChange(`${index}:sellingPrice`, e.target.value, (parsed) =>
                                updateSellingPrice(productId, parsed, item.variantId),
                              )
                            }
                            onKeyDown={(e) => handleSellingPriceKeyDown(e, index)}
                            onFocus={(e) => e.target.select()}
                            onBlur={() => clearNumericDraft(`${index}:sellingPrice`)}
                            placeholder='0'
                            className='h-7 w-20 text-sm font-semibold border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent text-blue-700 dark:text-blue-300 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                          />
                        </div>
                      </div>

                      {/* = subtotal */}
                      <div className='flex flex-col items-end gap-0 ml-auto shrink-0'>
                        {itemDiscountAmount > 0 && (
                          <span className='text-[10px] text-muted-foreground line-through leading-none'>Rs{itemGross.toFixed(2)}</span>
                        )}
                        <div className='flex items-center gap-1.5'>
                          <span className='text-muted-foreground/60 text-sm select-none'>=</span>
                          <p className='font-bold text-sm'>Rs{itemNet.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>
                    {compact && deleteButton}
                    </div>


                    {/* Row 4: variant + batch/expiry (only for products with variants) */}
                    <PurchaseItemVariantBatchFields
                      item={item}
                      index={index}
                      onVariantChange={updateItemVariant}
                      onBatchNumberChange={updateItemBatchNumber}
                      onExpiryDateChange={updateItemExpiryDate}
                      onBatchCostChange={updateItemBatchCost}
                      onNeedsBatchChange={(i, needsBatch) => { itemNeedsBatchRef.current[i] = needsBatch }}
                      onRegisterBatchTrigger={(i, trigger) => { itemBatchTriggerRef.current[i] = trigger }}
                      onLastFieldEnter={addNewPurchaseRowAndOpenProduct}
                    />
                  </div>
                )
  }

  // Whether a line needs the batch/expiry/variant sub-fields (PurchaseItemVariantBatchFields
  // renders something for it) — those fields are block-level and don't fit in table cells,
  // so these rows always render as the expanded card (colSpan-ing the dense-mode table),
  // same escape hatch InvoicePanel uses for isSplitAcrossBatches lines.
  const purchaseItemNeedsExpandedRow = (item: PurchaseItem): boolean =>
    !!(item.product.hasVariants || item.trackBatch || item.trackExpiry)

  // Compact table-cell content for one purchase line (dense mode, non-phone, no
  // batch/expiry/variant fields needed) — mirrors InvoicePanel's renderInvoiceItemParts.
  const renderPurchaseItemParts = (item: PurchaseItem, index: number) => {
    const productId = item.product.id || (item.product as any)._id
    const itemGross = item.quantity * item.purchasePrice
    const itemDiscountAmount = computeDiscountAmount(itemGross, item.discountType, item.discountValue)
    const itemNet = itemGross - itemDiscountAmount
    const stock = getDisplayStock(item.product)

    const productCell = (
      <div className='flex items-start gap-2'>
        {item.product.image?.url ? (
          <img src={item.product.image.url} alt={item.product.name} className='h-8 w-8 shrink-0 rounded-lg object-cover' />
        ) : (
          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted'>
            <Package className='h-4 w-4 text-muted-foreground/50' />
          </div>
        )}
        <div className='min-w-0 flex-1'>
          <BilingualName primary={item.product.name} secondary={item.product.nameUrdu} primaryClassName='font-medium text-sm' truncate />
          <div className='mt-1 flex flex-wrap items-center gap-1.5'>
            <span className={`inline-flex shrink-0 items-center gap-1 text-[11px] px-1.5 py-0.5 rounded-full font-medium ${
              stock <= 0 ? 'bg-red-100 text-red-700' :
              stock <= 5 ? 'bg-red-50 text-red-500' :
              stock <= 20 ? 'bg-amber-50 text-amber-600' :
              'bg-green-50 text-green-700'
            }`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                stock <= 0 ? 'bg-red-500' :
                stock <= 5 ? 'bg-red-400' :
                stock <= 20 ? 'bg-amber-400' :
                'bg-green-500'
              }`} />
              {stock <= 0 ? 'Out of stock' : `${stock} in stock`}
            </span>
            {(item.product.trackImei || item.product.trackSerial) && (
              <PurchaseSerialSummaryTrigger
                selectedCount={(item.imeis || []).length}
                quantity={item.quantity}
                isSerial={!!item.product.trackSerial}
                onClick={() => setSerialDialogIndex(index)}
              />
            )}
          </div>
        </div>
      </div>
    )

    const qtyControl = (
      <div className='flex items-center rounded-lg border bg-background overflow-hidden w-fit'>
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-6 rounded-none border-r p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
          onClick={() => updateQuantity(productId, Math.max(1, item.quantity - 1), item.variantId)}
        >
          <Minus className='h-3 w-3' />
        </Button>
        <Input
          ref={setItemFieldRef(index, 'quantity')}
          type='number'
          min='1'
          value={item.quantity}
          onChange={(e) => updateQuantity(productId, parseInt(e.target.value) || 1, item.variantId)}
          onKeyDown={(e) => handlePurchaseQuantityKeyDown(e, index)}
          onFocus={(e) => e.target.select()}
          className='h-7 w-12 border-0 rounded-none text-center text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
        />
        <Button
          size='sm'
          variant='ghost'
          className='h-7 w-6 rounded-none border-l p-0 text-muted-foreground hover:text-foreground hover:bg-muted'
          onClick={() => updateQuantity(productId, item.quantity + 1, item.variantId)}
        >
          <Plus className='h-3 w-3' />
        </Button>
      </div>
    )

    const purchasePriceControl = (
      <div className='flex items-center rounded-lg border bg-background overflow-hidden w-fit'>
        <span className='px-1.5 h-7 flex items-center text-[11px] text-muted-foreground bg-muted border-r font-medium select-none'>Rs</span>
        <Input
          ref={setItemFieldRef(index, 'purchasePrice')}
          type='text'
          inputMode='decimal'
          showVoiceInput={false}
          value={getNumericDraftValue(`${index}:purchasePrice`, item.purchasePrice)}
          onChange={(e) =>
            handleNumericDraftChange(`${index}:purchasePrice`, e.target.value, (parsed) =>
              updatePurchasePrice(productId, parsed, item.variantId),
            )
          }
          onKeyDown={(e) => handlePurchasePriceKeyDown(e, index)}
          onFocus={(e) => e.target.select()}
          onBlur={() => clearNumericDraft(`${index}:purchasePrice`)}
          className='h-7 w-16 border-0 rounded-none text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
        />
      </div>
    )

    const sellingPriceControl = (
      <div className='flex items-center rounded-lg border border-blue-200 bg-blue-50/50 dark:bg-blue-950/20 dark:border-blue-800 overflow-hidden w-fit'>
        <span className='px-1.5 h-7 flex items-center text-[11px] text-blue-500 bg-blue-100/60 dark:bg-blue-900/30 border-r border-blue-200 dark:border-blue-800 font-medium select-none'>Rs</span>
        <Input
          ref={setItemFieldRef(index, 'sellingPrice')}
          type='text'
          inputMode='decimal'
          showVoiceInput={false}
          value={getNumericDraftValue(`${index}:sellingPrice`, item.sellingPrice ?? 0)}
          onChange={(e) =>
            handleNumericDraftChange(`${index}:sellingPrice`, e.target.value, (parsed) =>
              updateSellingPrice(productId, parsed, item.variantId),
            )
          }
          onKeyDown={(e) => handleSellingPriceKeyDown(e, index)}
          onFocus={(e) => e.target.select()}
          onBlur={() => clearNumericDraft(`${index}:sellingPrice`)}
          className='h-7 w-16 border-0 rounded-none bg-transparent text-sm font-semibold text-blue-700 dark:text-blue-300 focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
        />
      </div>
    )

    const discountControl = (
      <div className='flex items-center rounded-lg border bg-background overflow-hidden w-fit'>
        <Input
          type='text'
          inputMode='decimal'
          showVoiceInput={false}
          value={getNumericDraftValue(`${index}:discountValue`, item.discountValue || 0)}
          onChange={(e) =>
            handleNumericDraftChange(`${index}:discountValue`, e.target.value, (parsed) =>
              updateItemDiscount(productId, { value: Math.max(0, parsed) }, item.variantId),
            )
          }
          onFocus={(e) => e.target.select()}
          onBlur={() => clearNumericDraft(`${index}:discountValue`)}
          placeholder='0'
          className='h-7 w-12 border-0 rounded-none text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
        />
        <button
          type='button'
          onClick={() =>
            updateItemDiscount(productId, { type: item.discountType === 'percentage' ? 'fixed' : 'percentage' }, item.variantId)
          }
          title='Click to switch between Rs and % discount'
          className='px-1.5 h-7 flex items-center text-[11px] text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors'
        >
          {item.discountType === 'percentage' ? '%' : 'Rs'}
        </button>
      </div>
    )

    const totalDisplay = (
      <div className='flex flex-col items-end gap-0'>
        {itemDiscountAmount > 0 && (
          <span className='text-[10px] text-muted-foreground line-through leading-none'>Rs{itemGross.toFixed(2)}</span>
        )}
        <p className='font-bold text-sm tabular-nums'>Rs{itemNet.toFixed(2)}</p>
      </div>
    )

    const deleteButton = (
      <Button
        size='sm'
        variant='ghost'
        className='h-7 w-7 p-0 flex-shrink-0 hover:bg-red-50 dark:hover:bg-red-950/30'
        onClick={() => removeFromPurchase(productId, item.variantId)}
      >
        <Trash2 className='h-3.5 w-3.5 text-red-400 hover:text-red-600' />
      </Button>
    )

    return { productCell, qtyControl, purchasePriceControl, sellingPriceControl, discountControl, totalDisplay, deleteButton }
  }

  return (
    <div
      className={cn(
        !showProductCatalog
          ? // Three columns — details / items / summary+payment+actions — mirrors
            // InvoicePanel's compact-mode grid exactly (see invoice-panel.tsx). Each
            // column is its own independent top-to-bottom stack (the wrapper divs
            // below), so a column's height is just its own content.
            'grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-[320px_minmax(0,1fr)_300px] items-start'
          : 'space-y-4',
      )}
    >
      {/* Column 1 (compact mode): Purchase Details. */}
      <div className={cn('min-w-0 space-y-4', !showProductCatalog && 'md:col-start-1 md:row-start-1 xl:row-start-1 xl:col-start-1')}>
      {/* Purchase Details */}
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-2">
            <CardTitle className="flex items-center gap-2">
              {onBackToList && (
                <Button variant="ghost" size="sm" onClick={onBackToList}>
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <Package className="h-5 w-5" />
              {t('Purchase Details')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {!isEditing && isMobileShop && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setBuyUsedPhoneOpen(true)}
                >
                  <Smartphone className="h-4 w-4 text-primary" />
                  Buy Old Phone
                </Button>
              )}
              {!isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setAiScanOpen(true)}
                >
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  {t('ai_scan_invoice')}
                </Button>
              )}
            </div>
          </div>

          {/* Purchase number — real (read-only) once saved; before that, a live preview of
              what the next save would auto-assign, editable via the pencil. Saved purchases
              can't have their number changed after the fact from here. Mirrors Invoice's
              identical invoice-number header block (see invoice-panel.tsx). */}
          {isEditing ? (
            editingPurchase?.invoiceNumber && (
              <div className='mt-3 flex items-center gap-2'>
                <span className='text-xs text-muted-foreground'>{t('Purchase Number') || 'Purchase Number'}</span>
                <span className='rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs'>
                  {editingPurchase.invoiceNumber}
                </span>
              </div>
            )
          ) : (
            <div className='mt-3 flex items-center gap-2'>
              <span className='text-xs text-muted-foreground'>{t('Purchase Number') || 'Purchase Number'}</span>
              {isEditingPurchaseNumber ? (
                <div className='flex items-center gap-1'>
                  <Input
                    autoFocus
                    showVoiceInput={false}
                    value={purchase.invoiceNumber ?? previewedPurchaseNumber ?? ''}
                    onChange={(e) => setPurchase(prev => ({ ...prev, invoiceNumber: e.target.value }))}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => setIsEditingPurchaseNumber(false)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); setIsEditingPurchaseNumber(false) }
                    }}
                    className='h-7 w-44 font-mono text-xs'
                  />
                  {purchase.invoiceNumber && (
                    <Button
                      type='button'
                      variant='ghost'
                      size='sm'
                      className='h-7 w-7 p-0 text-muted-foreground'
                      title={t('reset_to_auto_generated') || 'Reset to auto-generated'}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => {
                        setPurchase(prev => ({ ...prev, invoiceNumber: '' }))
                        setIsEditingPurchaseNumber(false)
                      }}
                    >
                      <RotateCcw className='h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>
              ) : (
                <button
                  type='button'
                  onClick={() => setIsEditingPurchaseNumber(true)}
                  className='inline-flex items-center gap-1.5 rounded-md border bg-muted/40 px-2 py-1 font-mono text-xs text-foreground transition-colors hover:bg-muted'
                  title={t('edit_invoice_number') || 'Edit purchase number'}
                >
                  {purchase.invoiceNumber || previewedPurchaseNumber || '…'}
                  <Pencil className='h-3 w-3 text-muted-foreground' />
                </button>
              )}
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
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
              <PopoverContent className="w-[calc(100vw-2rem)] max-w-[400px] p-0" align="start">
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

            {/* Purchase Type — segmented buttons instead of a dropdown, matching
                Invoice's Invoice Type control exactly (see invoice-panel.tsx). */}
            <div>
              <Label className='mb-2 block'>{t('Purchase Type') || 'Purchase Type'}</Label>
              <div className='grid grid-cols-2 gap-1.5 sm:gap-2'>
                {(
                  [
                    { value: 'cash', label: t('cash') || 'Cash', icon: Banknote },
                    { value: 'credit', label: t('credit') || 'Credit', icon: CreditCard },
                  ] as const
                ).map(({ value, label, icon: Icon }) => {
                  const active = (purchase.type || 'cash') === value
                  const styles = PURCHASE_TYPE_STYLES[value]
                  return (
                    <button
                      key={value}
                      type='button'
                      ref={value === 'cash' ? paymentTypeTriggerRef : undefined}
                      onClick={() => {
                        const currentTotal = calculateTotals().total
                        setPurchase((prev) => {
                          const switchingCashToCredit = (prev.type || 'cash') === 'cash' && value === 'credit'
                          // Cash type always means "fully paid right now" — Credit starts
                          // unpaid (unless switching back from Credit, which keeps whatever
                          // was entered).
                          const nextPaid = value === 'cash' ? currentTotal : (switchingCashToCredit ? 0 : (prev.paidAmount || 0))
                          return {
                            ...prev,
                            type: value,
                            paidAmount: nextPaid,
                            balance: resolvePurchaseInvoiceBalance(currentTotal, nextPaid),
                          }
                        })
                      }}
                      onKeyDown={(e) => onEnterAdvance(e, focusPurchaseDate)}
                      className={cn(
                        'flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-medium transition-colors sm:px-2 sm:py-2.5 sm:text-xs',
                        active
                          ? styles.active
                          : 'border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground',
                      )}
                    >
                      <Icon className={cn('h-4 w-4', active && styles.icon)} />
                      <span className='truncate'>{label}</span>
                    </button>
                  )
                })}
              </div>
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

            {/* Notes — Invoice has no equivalent field to mirror here, so this stays as
                the one purchase-specific addition to the Details card (moved up from the
                old combined Totals card). */}
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
        </CardContent>
      </Card>

      </div>

      {/* Column 2 (compact mode): at-a-glance stats + Purchase Items. Spans both tracks of
          the md-tier 2-col grid (Details | Summary+Payment sit above it in row 1) so it
          always runs full width; reverts to its own single track at xl once Details and
          Summary+Payment split back out into separate side columns. Mirrors InvoicePanel's
          Column 2 exactly (see invoice-panel.tsx). */}
      <div className={cn('min-w-0 space-y-4', !showProductCatalog && 'md:col-start-1 md:row-start-2 md:col-span-2 xl:row-start-1 xl:col-span-1 xl:col-start-2')}>
      {/* At-a-glance totals strip — same numbers as the Summary card below. Hidden once the
          catalog is showing (Column 2 and Column 3 both stack into the same left-hand
          column there) and below sm (phone widths). */}
      {!showProductCatalog && (
        <div className='hidden grid-cols-4 gap-2 sm:grid'>
          {[
            { label: t('items') || 'Items', value: String(purchase.items.filter((i) => (i.product.id || (i.product as any)?._id) && i.product.name).length) },
            { label: t('Subtotal'), value: `Rs${totals.subtotal.toFixed(2)}` },
            { label: t('Discount'), value: `Rs${(totals.discount + totals.itemDiscountTotal).toFixed(2)}` },
            { label: t('Total'), value: `Rs${totals.total.toFixed(2)}`, highlight: true },
          ].map((stat) => (
            <div
              key={stat.label}
              className={cn(
                'min-w-0 rounded-lg border px-2 py-1.5',
                stat.highlight ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20' : 'bg-card',
              )}
            >
              <p className='truncate text-[10px] text-muted-foreground'>{stat.label}</p>
              <p className={cn('truncate text-sm font-bold tabular-nums', stat.highlight && 'text-emerald-700 dark:text-emerald-400')}>
                {stat.value}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Purchase Items — middle column (compact mode): sits beside the details+payment
          stack, spanning both its rows so it runs the full height. */}
      <Card className='min-w-0'>
        <CardHeader className='py-3'>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className='text-base'>{t('Purchase Items')} ({purchase.items.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {purchase.items.length > 0 && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={toggleAllDiscountTypes}
                  className="flex items-center gap-1"
                  title="Switch every discount (all items + overall) to this unit at once"
                >
                  <ArrowLeftRight className="h-4 w-4" />
                  <span className="hidden sm:inline">{t('Switch All Discounts to')}</span>
                  <span className="sm:hidden">{t('Switch to')}</span>
                  {' '}{purchase.discountType === 'percentage' ? 'Rs' : '%'}
                </Button>
              )}
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
              {t('add_item')}
            </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent ref={itemsAreaRef} className='flex flex-1 flex-col p-0 lg:min-h-0'>
          {/* Capped + internally scrollable regardless of table vs. stacked-card layout —
              without max-h here, the card layout (catalog-visible/phone/narrow) grew with
              the item count and pushed Payment & Amount off screen, forcing a full-page
              scroll through every item just to reach Save. Mirrors Invoice's identical fix
              (see invoice-panel.tsx). */}
          <div
            ref={itemsScrollRef}
            className={cn(
              'overflow-y-auto max-h-[460px]',
              (showProductCatalog || isPhone || isItemsAreaNarrow) ? 'space-y-2 p-3' : 'overflow-x-auto',
            )}
          >
            {purchase.items.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                {t('No items added yet')}
              </div>
            ) : showProductCatalog || isPhone || isItemsAreaNarrow ? (
              // Catalog-visible mode, catalog-hidden on a phone (<sm/640px), or the item
              // area's rendered width is too narrow for the table's fixed columns (see
              // isItemsAreaNarrow above): items render as stacked cards instead of a table —
              // same gating InvoicePanel uses (see invoice-panel.tsx), plus the width check.
              purchase.items.map((item: PurchaseItem, index: number) => renderPurchaseItemCard(item, index))
            ) : (
              <Table className='table-fixed'>
                <colgroup>
                  <col className='w-8' />
                  <col />
                  <col className='w-[110px]' />
                  <col className='w-[100px]' />
                  <col className='w-[100px]' />
                  <col className='w-[85px]' />
                  <col className='w-[90px]' />
                  <col className='w-10' />
                </colgroup>
                <TableHeader className='sticky top-0 z-10 bg-muted'>
                  <TableRow className='hover:bg-transparent'>
                    <TableHead className='w-8 pl-3'>#</TableHead>
                    <TableHead className='min-w-[140px]'>{t('product') || 'Product'}</TableHead>
                    <TableHead className='min-w-[100px]'>{t('Qty')}</TableHead>
                    <TableHead className='min-w-[100px]'>{t('Purchase Price')}</TableHead>
                    <TableHead className='min-w-[100px]'>{t('Sale Price')}</TableHead>
                    <TableHead className='min-w-[85px]'>{t('discount') || 'Discount'}</TableHead>
                    <TableHead className='min-w-[90px] text-right'>{t('total') || 'Total'}</TableHead>
                    <TableHead className='w-10 pr-2' />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {purchase.items.map((item: PurchaseItem, index: number) => {
                    const productId = item.product.id || (item.product as any)?._id
                    // Manual/unselected rows, and rows needing batch/expiry/variant fields,
                    // don't fit in table cells — expand to the full-width card instead,
                    // same escape hatch InvoicePanel uses for isSplitAcrossBatches lines.
                    if ((item.isManualEntry && !productId) || purchaseItemNeedsExpandedRow(item)) {
                      return (
                        <TableRow key={`${productId || 'manual'}-${index}`} className='hover:bg-transparent'>
                          <TableCell colSpan={8} className='p-2'>
                            {renderPurchaseItemCard(item, index)}
                          </TableCell>
                        </TableRow>
                      )
                    }
                    const { productCell, qtyControl, purchasePriceControl, sellingPriceControl, discountControl, totalDisplay, deleteButton } = renderPurchaseItemParts(item, index)
                    return (
                      <TableRow key={`${productId}-${index}`}>
                        <TableCell className='py-3 pl-3 align-top text-xs text-muted-foreground'>{index + 1}</TableCell>
                        <TableCell className='whitespace-normal py-2.5 align-top'>{productCell}</TableCell>
                        <TableCell className='align-middle py-3'>{qtyControl}</TableCell>
                        <TableCell className='align-middle py-3'>{purchasePriceControl}</TableCell>
                        <TableCell className='align-middle py-3'>{sellingPriceControl}</TableCell>
                        <TableCell className='align-middle py-3'>{discountControl}</TableCell>
                        <TableCell className='align-middle py-3 text-right'>{totalDisplay}</TableCell>
                        <TableCell className='py-3 pr-2 align-middle'>{deleteButton}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            )}
          </div>

          {/* Apply Discount — the one place the overall (whole-purchase) discount is
              edited; feeds the Summary card's totals directly. Mirrors Invoice's items-
              table footer popover exactly, minus "Add Tax" (purchases have no tax). */}
          <div className='flex flex-wrap items-center gap-2 border-t p-3'>
            <Popover open={applyDiscountOpen} onOpenChange={setApplyDiscountOpen}>
              <PopoverTrigger asChild>
                <Button type='button' variant='outline' size='sm' className='gap-1.5'>
                  <Percent className='h-4 w-4' />
                  {t('Apply Discount')}
                  {totals.discount > 0 && (
                    <Badge variant='secondary' className='ml-1 tabular-nums'>-Rs{totals.discount.toFixed(2)}</Badge>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-64 p-3' align='start'>
                <Label className='mb-2 block text-xs'>{t('Discount')}</Label>
                <div className='flex items-center rounded-lg border bg-background overflow-hidden'>
                  <Input
                    id='purchase-discount'
                    type='text'
                    inputMode='decimal'
                    showVoiceInput={false}
                    value={getNumericDraftValue('overallDiscount', purchase.discountValue || 0)}
                    onChange={(e) =>
                      handleNumericDraftChange('overallDiscount', e.target.value, (parsed) =>
                        setPurchase((prev) => ({ ...prev, discountValue: Math.max(0, parsed) })),
                      )
                    }
                    onFocus={(e) => e.target.select()}
                    onBlur={() => clearNumericDraft('overallDiscount')}
                    placeholder='0'
                    className='h-9 flex-1 border-0 text-right text-sm font-semibold focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                  />
                  <button
                    type='button'
                    onClick={() => setPurchase((prev) => ({ ...prev, discountType: prev.discountType === 'percentage' ? 'fixed' : 'percentage' }))}
                    title='Click to switch between Rs and % discount'
                    className='px-3 h-9 flex items-center text-xs text-muted-foreground bg-muted border-l font-medium select-none cursor-pointer hover:bg-primary hover:text-primary-foreground active:scale-95 transition-colors'
                  >
                    {purchase.discountType === 'percentage' ? '%' : 'Rs'}
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Column 3 (compact mode): Summary, Payment & Amount. Sits beside Purchase Details
          in row 1 of the md-tier 2-col grid (md:col-start-2); at xl it moves out to its
          own third track via xl:col-start-3. Mirrors InvoicePanel's Column 3 exactly (see
          invoice-panel.tsx) — split out of the old combined Totals+Payment card. */}
      <div className={cn('space-y-4', !showProductCatalog && 'md:col-start-2 md:row-start-1 xl:row-start-1 xl:col-start-3')}>
      {/* Summary — the same totals shown in the stats strip above the items table, laid
          out as a running receipt-style breakdown. Discount is now edited from the items
          table's footer ("Apply Discount" popover) rather than here, so this card is
          read-only. */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Receipt className='h-4 w-4 text-muted-foreground' />
            {t('Summary')}
          </CardTitle>
        </CardHeader>
        <CardContent className='space-y-2 pt-0'>
          <div className='flex justify-between gap-6'>
            <span className='text-muted-foreground'>{t('Subtotal')}:</span>
            <span className='tabular-nums font-medium'>Rs{totals.subtotal.toFixed(2)}</span>
          </div>
          {totals.itemDiscountTotal > 0 && (
            <div className='flex justify-between gap-6 text-sm text-green-600'>
              <span>{t('Item Discounts')}:</span>
              <span className='tabular-nums'>-Rs{totals.itemDiscountTotal.toFixed(2)}</span>
            </div>
          )}
          {totals.discount > 0 && (
            <div className='flex justify-between gap-6 text-red-600'>
              <span>{t('Discount')}:</span>
              <span className='tabular-nums'>-Rs{totals.discount.toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className='flex justify-between gap-6 font-bold text-lg'>
            <span>{t('Total')}:</span>
            <span className='tabular-nums'>Rs{totals.total.toFixed(2)}</span>
          </div>
          {(totals.itemDiscountTotal + totals.discount) > 0 && (
            <div className='flex justify-between gap-6 text-xs font-medium text-green-600'>
              <span>{t('You Saved')}:</span>
              <span className='tabular-nums'>Rs{(totals.itemDiscountTotal + totals.discount).toFixed(2)}</span>
            </div>
          )}

          <Separator />
          {/* Type + Total Items + Total Quantity as one row of tags instead of a badge
              plus two separate label/value rows underneath — same info, less height. */}
          <div className='flex flex-wrap items-center gap-1.5'>
            <Badge className={getPurchaseTypeColor(purchase.type || 'cash')}>
              {t(purchase.type || 'cash')}
            </Badge>
            <Badge variant='secondary' className='gap-1 tabular-nums'>
              {t('Total Items')}: {purchase.items.length}
            </Badge>
            <Badge variant='secondary' className='gap-1 tabular-nums'>
              {t('Total Quantity')}: {purchase.items.reduce((sum, item) => sum + item.quantity, 0)}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Payment & Amount — right column (compact mode), below the Summary card */}
      <Card>
        <CardHeader className='pb-3'>
          <CardTitle className='flex items-center gap-2 text-base'>
            <Banknote className='h-4 w-4 text-muted-foreground' />
            {t('Payment & Amount')}
          </CardTitle>
        </CardHeader>
        <CardContent className='p-4 pt-0 space-y-4'>
          <div>
            <Label htmlFor="payment-method" className="mb-2">{t('Payment Method') || 'Payment Method'}</Label>
            <Select
              value={
                purchase.paymentMethod === 'wallet' && purchase.walletType
                  ? toWalletOptionValue(purchase.walletType)
                  : 'cash'
              }
              onOpenChange={setPaymentMethodSelectOpen}
              onValueChange={(value: string) => {
                const isWallet = isWalletOptionValue(value)
                setPurchase((prev) => ({
                  ...prev,
                  paymentMethod: isWallet ? 'wallet' : 'cash',
                  walletType: isWallet ? getWalletTypeFromOptionValue(value) : undefined,
                  // The split leg's bucket is derived from this field — stale once it changes.
                  splitPaymentMethod: undefined,
                  splitWalletType: undefined,
                  splitPaidAmount: 0,
                }))
              }}
            >
              <SelectTrigger ref={paymentMethodTriggerRef} className='w-full'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {purchasePaymentMethodOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {wallets.length === 0 && (
              <p className='mt-1 text-xs text-muted-foreground'>
                {t('No wallets configured. Add one from the Wallet page.') || 'No wallets configured. Add one from the Wallet page.'}
              </p>
            )}
          </div>

          {/* Paid Amount Input */}
          <div className="space-y-2">
            <div>
              <Label htmlFor="paid-amount" className="mb-2 block">
                {t('Paid Amount')}:
              </Label>
              <Input
                id="paid-amount"
                type="text"
                inputMode="decimal"
                value={getNumericDraftValue('paidAmount', purchase.paidAmount || 0)}
                disabled={purchase.type === 'cash' && !purchase.splitPaymentMethod}
                onChange={(e) =>
                  handleNumericDraftChange('paidAmount', e.target.value, (value) => {
                    const currentTotal = calculateTotals().total
                    setPurchase((prev) => ({
                      ...prev,
                      paidAmount: value,
                      balance: resolvePurchaseInvoiceBalance(currentTotal, value),
                    }))
                  })
                }
                onBlur={() => clearNumericDraft('paidAmount')}
                placeholder="0.00"
                className="w-full"
              />
            </div>
            <SplitPaymentFields
              primaryMethod={purchase.paymentMethod === 'wallet' ? 'wallet' : 'cash'}
              wallets={wallets}
              paidAmount={purchase.paidAmount || 0}
              value={{
                splitPaymentMethod: purchase.splitPaymentMethod,
                splitWalletType: purchase.splitWalletType,
                splitPaidAmount: purchase.splitPaidAmount,
              }}
              onChange={(patch) => setPurchase((prev) => ({ ...prev, ...patch }))}
            />
          </div>

          {/* Supplier Balance After Payment - Only show in create mode */}
          {!isEditing && (purchase.supplier?._id || (purchase.supplier as any)?.id) && (
            <div className="border-t pt-3 space-y-2 bg-orange-50 dark:bg-orange-950 rounded-lg p-3">
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
              {totalPaidNow > 0 && (
                <div className='flex justify-between items-center text-sm'>
                  <span className="font-medium">{t('Paid Now')}:</span>
                  <span className="font-bold text-green-600">-Rs{totalPaidNow.toFixed(2)} (Dr)</span>
                </div>
              )}
              <Separator />
              <div className='flex justify-between items-center'>
                <span className="font-bold">{t('Net Balance')}:</span>
                <span className={`font-bold text-lg ${(supplierBalance + totals.total - totalPaidNow) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                  Rs{Math.abs(supplierBalance + totals.total - totalPaidNow).toFixed(2)} {(supplierBalance + totals.total - totalPaidNow) > 0 ? '(Payable)' : '(Receivable)'}
                </span>
              </div>
            </div>
          )}

          {/* Save Buttons — compact mode (catalog hidden): the header-portaled bar below
              is the buttons row, these full-size duplicates would just repeat it. */}
          {showProductCatalog && (
          <div className="grid grid-cols-1 gap-3">
            <Button
              type='button'
              onClick={previewPurchase}
              variant='ghost'
              disabled={purchase.items.length === 0}
              className='gap-1.5'
            >
              <Eye className='h-4 w-4' />
              {t('Preview')}
            </Button>
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

            <PrintFormatButton
              onPrint={(paperSize) => handleSavePurchase(paperSize)}
              defaultPaperSize={defaultPaperSize}
              size="lg"
              variant="default"
              fullWidth
              disabled={!getSupplierId(purchase.supplier as Supplier) || purchase.items.length === 0 || isLoading}
              mainButtonContent={
                isLoading && savingType !== 'none' ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {t('Saving...')}
                  </>
                ) : (
                  <>
                    <Printer className="mr-2 h-4 w-4" />
                    {t('Save & Print Receipt')} (Ctrl+Enter)
                  </>
                )
              }
            />
          </div>
          )}
        </CardContent>
      </Card>
      </div>

      {/* Fast-purchasing header actions — catalog hidden means the panel is a 3-column
          layout; the primary actions are always reachable without scrolling. Portaled into
          a slot the page places in its header (see purchase-invoice/index.tsx). Falls back
          to a floating bottom bar (with item count/total for context) until that slot
          exists. Mirrors InvoicePanel's identical bar (see invoice-panel.tsx). */}
      {!showProductCatalog && (() => {
        const disabled = !(purchase.supplier?._id || (purchase.supplier as any)?.id) || purchase.items.length === 0 || isLoading
        const bar = (
          <div className='flex flex-wrap items-center gap-2'>
            <Button type='button' onClick={previewPurchase} size='sm' variant='ghost' disabled={purchase.items.length === 0} className='gap-1.5'>
              <Eye className='h-4 w-4' />
              {t('Preview')}
            </Button>
            <Button
              type='button'
              onClick={() => handleSavePurchase('none')}
              size='sm'
              variant='outline'
              disabled={disabled}
              className='gap-1.5'
            >
              {isLoading && savingType === 'none' ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Save className='h-4 w-4' />
              )}
              {isEditing ? t('Update Purchase') : t('Save Purchase')}
            </Button>
            <PrintFormatButton
              onPrint={(paperSize) => handleSavePurchase(paperSize)}
              defaultPaperSize={defaultPaperSize}
              size='sm'
              variant='default'
              disabled={!getSupplierId(purchase.supplier as Supplier) || purchase.items.length === 0 || isLoading}
              mainButtonClassName='bg-emerald-600 hover:bg-emerald-700'
              mainButtonContent={
                isLoading && savingType !== 'none' ? (
                  <Loader2 className='h-4 w-4 animate-spin' />
                ) : (
                  <>
                    <Printer className='h-4 w-4' />
                    <span className='ml-1.5'>{t('Save & Print Receipt')}</span>
                  </>
                )
              }
            />
          </div>
        )
        if (stickyActionsContainer) return createPortal(bar, stickyActionsContainer)
        // No header slot yet — fall back to a floating bottom bar (with item count/total
        // for context, since it's not sitting next to the page title in this fallback).
        return (
          <div className='sticky bottom-3 z-20 md:col-start-1 md:col-span-2 xl:col-start-1 xl:col-span-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/90'>
            <div className='flex items-baseline gap-2 pl-1'>
              <span className='text-xs text-muted-foreground'>
                {purchase.items.filter((i) => (i.product.id || (i.product as any)?._id) && i.product.name).length} {t('Purchase Items')}
              </span>
              <span className='text-lg font-bold tabular-nums'>Rs{totals.total.toFixed(2)}</span>
            </div>
            {bar}
          </div>
        )
      })()}

      <PurchaseAiScanDialog
        open={aiScanOpen}
        onOpenChange={setAiScanOpen}
        suppliers={suppliers}
        products={products}
        onApply={handleApplyAiScan}
      />

      {isMobileShop && (
        <BuyUsedPhoneDialog open={buyUsedPhoneOpen} onOpenChange={setBuyUsedPhoneOpen} />
      )}

      {(() => {
        const item = serialDialogIndex !== null ? purchase.items[serialDialogIndex] : undefined
        if (!item) return null
        return (
          <PurchaseSerialEntryDialog
            open={serialDialogIndex !== null}
            onOpenChange={(open) => { if (!open) setSerialDialogIndex(null) }}
            itemName={item.product.name}
            quantity={item.quantity}
            isSerial={!!item.product.trackSerial}
            imeis={item.imeis || []}
            onAdd={(value, value2) => addImeiToItem(serialDialogIndex as number, value, value2)}
            onRemove={(value) => removeImeiFromItem(serialDialogIndex as number, value)}
            onComplete={() => advanceAfterSaleFields(serialDialogIndex as number)}
          />
        )
      })()}

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

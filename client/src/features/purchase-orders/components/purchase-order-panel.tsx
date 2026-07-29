import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowLeftRight,
  Check,
  ChevronDown,
  ClipboardList,
  Loader2,
  Minus,
  Package,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { BilingualName } from '@/components/bilingual-name'
import { Separator } from '@/components/ui/separator'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

import type { Product } from '@/features/invoice/index'
import type { RootState } from '@/stores/store'
import {
  useCreatePurchaseOrderMutation,
  useUpdatePurchaseOrderMutation,
  useSendPurchaseOrderMutation,
  type PurchaseOrder,
} from '@/stores/purchaseOrder.api'
import { normalizeSuppliersList } from '@/features/purchase-invoice/utils/catalog-helpers'
import { computeDiscountAmount, type DiscountType } from '@/features/purchase-invoice/utils/discount'
import { focusField, onEnterAdvance, useInvoiceSaveShortcuts } from '@/lib/invoice-form-keyboard'
import { getUrduSecondaryNameClasses, matchesBilingualSearch } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'
import { getDisplayStock } from '@/lib/product-stock-display'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

// Stable empty-array reference — an inline `= []` default on `data` would create a new
// array every render while the query is loading.
const EMPTY_PURCHASE_CATALOG: PurchaseCatalogItem[] = []
// Cap the product dropdown's rendered rows — matches Invoice/Purchase Invoice's
// identical cap (see invoice-panel.tsx / purchase-panel.tsx) so a large catalog
// doesn't render hundreds of DOM rows per keystroke.
const MAX_VISIBLE_DROPDOWN_RESULTS = 50

export interface OrderItem {
  product: Product
  // Real (non-default) variant this line is for, when product.hasVariants — see
  // docs/architecture/universal-product-migration.md. Batch number/expiry aren't
  // captured here; they're entered when the order is actually received.
  variantId?: string
  trackBatch?: boolean
  trackExpiry?: boolean
  quantity: number
  unit?: string
  expectedPrice: number
  expectedSellingPrice?: number
  // Line-level discount (e.g. supplier discounts this one product on the order).
  // Applied on top of quantity * expectedPrice; discountValue is the raw entered
  // number (Rs or %), resolved via computeDiscountAmount(). Mirrors Purchase
  // Invoice's per-item discount exactly, see purchase-panel.tsx.
  discountType?: DiscountType
  discountValue?: number
  isManualEntry?: boolean
}

export interface OrderSupplier {
  _id: string
  name: string
  nameUrdu?: string
  phone?: string
  picture?: { url?: string; publicId?: string }
}

export interface PurchaseOrderDraft {
  supplier: OrderSupplier | Record<string, never>
  items: OrderItem[]
  orderDate: string
  expectedDeliveryDate: string
  notes: string
  termsAndConditions: string
  // Overall order-level discount, applied on top of any per-item discounts.
  discountType: DiscountType
  discountValue: number
  tax: number
  shippingCost: number
}

export function createEmptyOrderManualItem(): OrderItem {
  return {
    product: {
      id: '',
      _id: '',
      name: '',
      price: 0,
      cost: 0,
      stockQuantity: 0,
    } as Product,
    quantity: 1,
    expectedPrice: 0,
    isManualEntry: true,
  }
}

const todayISO = () => new Date().toISOString().slice(0, 10)

function buildInitialDraft(
  editing?: PurchaseOrder | null,
  purchasableCatalog: PurchaseCatalogItem[] = EMPTY_PURCHASE_CATALOG,
): PurchaseOrderDraft {
  if (!editing) {
    return {
      supplier: {},
      items: [createEmptyOrderManualItem()],
      orderDate: todayISO(),
      expectedDeliveryDate: '',
      notes: '',
      termsAndConditions: '',
      discountType: 'fixed',
      discountValue: 0,
      tax: 0,
      shippingCost: 0,
    }
  }

  const supplier =
    typeof editing.supplier === 'object' && editing.supplier
      ? {
          _id: editing.supplier._id || editing.supplier.id || '',
          name: editing.supplier.name || '',
          nameUrdu: editing.supplier.nameUrdu,
          phone: editing.supplier.phone,
          picture: editing.supplier.picture,
        }
      : ({} as OrderSupplier)

  const items: OrderItem[] = (editing.items || []).map((it: any) => {
    const product = it.product
    const productId = typeof product === 'object' ? product?.id || product?._id || '' : product
    // toJSON transforms _id -> id, so a populated variant only has `.id`, not `._id`.
    const variant = it.variantId && typeof it.variantId === 'object' ? it.variantId : null
    const variantId = variant?.id || variant?._id || (typeof it.variantId === 'string' ? it.variantId : undefined)
    // it.productName was already saved as "Toshiba — 12" at order-creation time (see
    // handleCatalogItemSelect below) — no need to reconstruct it from variant.attributes.
    const baseName = it.productName || (typeof product === 'object' ? product?.name : '') || ''
    // The saved item's stockQuantity is stale (it's whatever the product/variant had at
    // order time) — look up the *live* figure from the purchasable catalog when possible.
    const catalogEntry = variantId ? purchasableCatalog.find((c) => c.variantId === variantId) : undefined
    return {
      product: {
        ...(typeof product === 'object' ? product : {}),
        id: productId,
        _id: productId,
        hasVariants: !!variantId || (typeof product === 'object' ? product?.hasVariants : false),
        name: baseName,
        nameUrdu: it.productNameUrdu || (typeof product === 'object' ? product?.nameUrdu : undefined),
        cost: Number(it.expectedPrice || 0),
        price: Number(it.expectedSellingPrice || 0),
        stockQuantity:
          catalogEntry?.stockQuantity ?? (typeof product === 'object' ? product?.stockQuantity : 0),
        // getDisplayStock reads this (not stockQuantity) once hasVariants is true.
        variantStockTotal: catalogEntry?.stockQuantity ?? (typeof product === 'object' ? product?.stockQuantity : 0),
        unit: it.unit || (typeof product === 'object' ? product?.unit : 'pcs'),
      } as Product,
      variantId,
      trackBatch: variant?.trackBatch,
      trackExpiry: variant?.trackExpiry,
      quantity: Number(it.quantity || 1),
      unit: it.unit || 'pcs',
      expectedPrice: Number(it.expectedPrice || 0),
      expectedSellingPrice: it.expectedSellingPrice ? Number(it.expectedSellingPrice) : undefined,
      discountType: (it.discountType as DiscountType) || 'fixed',
      discountValue: Number(it.discountValue || 0),
      isManualEntry: false,
    }
  })

  return {
    supplier,
    items: items.length > 0 ? items : [createEmptyOrderManualItem()],
    orderDate: editing.orderDate
      ? new Date(editing.orderDate).toISOString().slice(0, 10)
      : todayISO(),
    expectedDeliveryDate: editing.expectedDeliveryDate
      ? new Date(editing.expectedDeliveryDate).toISOString().slice(0, 10)
      : '',
    notes: editing.notes || '',
    termsAndConditions: editing.termsAndConditions || '',
    discountType: (editing.discountType as DiscountType) || 'fixed',
    discountValue: Number(editing.discountValue || 0),
    tax: Number(editing.tax || 0),
    shippingCost: Number(editing.shippingCost || 0),
  }
}

interface Props {
  onBack: () => void
  onSaved: () => void
  editing?: PurchaseOrder | null
  products: Product[]
  productsLoading?: boolean
  onRegisterAddProduct?: (fn: (product: Product, quantity?: number, variantId?: string) => void) => void
  /** Auto-select this supplier (e.g. the AI-recommended supplier) once suppliers load. */
  prefillSupplierId?: string
  /** When false (catalog hidden), the panel switches to a dense two-column "fast
   * ordering" layout — single-row items and a sticky save bar — matching InvoicePanel. */
  showProductCatalog?: boolean
  /** Fast-ordering mode only: DOM node (owned by the page, outside the cards' scroll
   * region) to portal the save/print bar into, so it's always visible without scrolling.
   * Falls back to an inline sticky bar until this is available. */
  stickyActionsContainer?: HTMLElement | null
}

export default function PurchaseOrderPanel({
  onBack,
  onSaved,
  editing,
  productsLoading = false,
  onRegisterAddProduct,
  prefillSupplierId,
  showProductCatalog = true,
  stickyActionsContainer = null,
}: Props) {
  const { data: purchasableCatalog = EMPTY_PURCHASE_CATALOG } = useGetPurchasableCatalogQuery()
  const [draft, setDraft] = useState<PurchaseOrderDraft>(() => buildInitialDraft(editing, purchasableCatalog))
  const [supplierSelectOpen, setSupplierSelectOpen] = useState(false)
  const [supplierSearchQuery, setSupplierSearchQuery] = useState('')
  const [productSelectOpen, setProductSelectOpen] = useState('')
  const [productSearchQuery, setProductSearchQuery] = useState('')
  const [saving, setSaving] = useState(false)

  // Raw text the user is currently typing into a decimal field (cost/discount/sell/
  // tax/shipping), keyed by a field id — e.g. "3:expectedPrice". A controlled input
  // whose value is re-derived from a *number* on every keystroke strips a trailing "."
  // the instant it's typed (parseFloat("40.") === 40), so "40.5" can never be typed.
  // Keeping the exact typed string here until blur fixes that while still committing
  // a parsed number to state on every change so totals stay live. Mirrors
  // PurchasePanel's identical numericDrafts.
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

  const qtyInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const costInputRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const orderDateRef = useRef<HTMLInputElement>(null)
  const expectedDateRef = useRef<HTMLInputElement>(null)
  const itemsScrollRef = useRef<HTMLDivElement>(null)
  const autoOpenDoneRef = useRef(false)
  const prefillSupplierAppliedRef = useRef(false)

  const suppliersData = useSelector((state: RootState) => state.supplier.data)
  const suppliers = normalizeSuppliersList(suppliersData)

  const [createPO] = useCreatePurchaseOrderMutation()
  const [updatePO] = useUpdatePurchaseOrderMutation()
  const [sendPO] = useSendPurchaseOrderMutation()

  useEffect(() => {
    // Deliberately keyed on `editing` only (not `purchasableCatalog`) — this should
    // only reset the draft when switching which order is being edited, not every time
    // the catalog refetches (which would wipe out in-progress unsaved edits). The
    // effect closure still captures whatever `purchasableCatalog` value is current at
    // the moment `editing` changes, since React re-creates the closure every render.
    setDraft(buildInitialDraft(editing, purchasableCatalog))
    autoOpenDoneRef.current = false
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  useEffect(() => {
    if (itemsScrollRef.current) {
      itemsScrollRef.current.scrollTop = itemsScrollRef.current.scrollHeight
    }
  }, [draft.items.length])

  useEffect(() => {
    const first = draft.items[0]
    const oneEmptyManual =
      draft.items.length === 1 &&
      first?.isManualEntry &&
      !(first.product?.id || (first.product as { _id?: string })?._id)
    if (oneEmptyManual && !autoOpenDoneRef.current && !editing) {
      autoOpenDoneRef.current = true
      queueMicrotask(() => setProductSelectOpen('manual-0'))
    }
  }, [draft.items, editing])

  const filteredSuppliers = suppliers.filter((s) =>
    matchesBilingualSearch(supplierSearchQuery, s.name, s.nameUrdu, s.phone),
  )

  const filteredCatalogItems = purchasableCatalog.filter((p) =>
    matchesBilingualSearch(productSearchQuery, p.name, p.nameUrdu, p.barcode, p.brand?.name),
  )
  // Capped slice actually rendered — matches Invoice/Purchase Invoice's identical
  // visible/filtered split, so a large catalog doesn't render hundreds of DOM rows.
  const visibleCatalogItems = filteredCatalogItems.slice(0, MAX_VISIBLE_DROPDOWN_RESULTS)

  const getProductId = (item: OrderItem) =>
    item.product.id || (item.product as { _id?: string })._id || ''

  // Row identity is (productId, variantId) — two different variants of the same
  // product are different lines and must not be confused with each other.
  const rowKey = (productId: string, variantId?: string) => `${productId}::${variantId || ''}`

  // Gross line amounts, minus any per-item discounts, gives the Subtotal; the overall
  // order-level discount is then applied on top of that, before tax/shipping.
  const grossSubtotal = draft.items.reduce(
    (sum, item) => sum + item.quantity * (item.expectedPrice || 0),
    0,
  )
  const itemDiscountTotal = draft.items.reduce((sum, item) => {
    const gross = item.quantity * (item.expectedPrice || 0)
    return sum + computeDiscountAmount(gross, item.discountType, item.discountValue)
  }, 0)
  const subtotal = grossSubtotal - itemDiscountTotal
  const discountAmount = computeDiscountAmount(subtotal, draft.discountType, draft.discountValue)
  const totalAmount = Math.max(
    0,
    subtotal - discountAmount + draft.tax + draft.shippingCost,
  )

  const addProductToOrder = useCallback((product: Product, quantity = 1, variantId?: string) => {
    const productId = product.id || (product as { _id?: string })._id
    if (!productId) return
    const resolvedVariantId = variantId ?? (product as { variantId?: string }).variantId

    setDraft((prev) => {
      const existingIndex = prev.items.findIndex(
        (item) =>
          getProductId(item) === productId && (item.variantId || undefined) === (resolvedVariantId || undefined),
      )
      if (existingIndex >= 0) {
        const items = [...prev.items]
        items[existingIndex] = {
          ...items[existingIndex],
          quantity: items[existingIndex].quantity + quantity,
        }
        return { ...prev, items }
      }

      const emptyManualIdx = prev.items.findIndex(
        (item) => item.isManualEntry && !getProductId(item),
      )
      const newItem: OrderItem = {
        product,
        variantId: resolvedVariantId,
        trackBatch: (product as { trackBatch?: boolean }).trackBatch,
        trackExpiry: (product as { trackExpiry?: boolean }).trackExpiry,
        quantity,
        unit: product.unit || 'pcs',
        expectedPrice: product.cost || product.price || 0,
        expectedSellingPrice: product.price || 0,
        isManualEntry: false,
      }

      if (emptyManualIdx >= 0) {
        const items = [...prev.items]
        items[emptyManualIdx] = newItem
        return { ...prev, items }
      }

      return { ...prev, items: [...prev.items, newItem] }
    })

    setTimeout(() => {
      focusField(qtyInputRefs.current[rowKey(String(productId), resolvedVariantId)])
    }, 80)
  }, [])

  useEffect(() => {
    onRegisterAddProduct?.(addProductToOrder)
  }, [onRegisterAddProduct, addProductToOrder])

  const addNewRowAndOpenProduct = useCallback(() => {
    const emptyIdx = draft.items.findIndex(
      (item) => item.isManualEntry && !getProductId(item),
    )
    if (emptyIdx >= 0) {
      setProductSelectOpen(`manual-${emptyIdx}`)
      return
    }
    setDraft((prev) => {
      const nextIndex = prev.items.length
      setTimeout(() => setProductSelectOpen(`manual-${nextIndex}`), 120)
      return { ...prev, items: [...prev.items, createEmptyOrderManualItem()] }
    })
  }, [draft.items])

  const openProductSelector = useCallback(() => {
    const emptyIdx = draft.items.findIndex(
      (item) => item.isManualEntry && !getProductId(item),
    )
    if (emptyIdx >= 0) {
      setProductSelectOpen(`manual-${emptyIdx}`)
      return
    }
    addNewRowAndOpenProduct()
  }, [draft.items, addNewRowAndOpenProduct])

  const handleProductSelect = useCallback(
    (itemIndex: number, product: Product, variantId?: string, meta?: { trackBatch?: boolean; trackExpiry?: boolean }) => {
      setDraft((prev) => {
        const items = [...prev.items]
        items[itemIndex] = {
          product,
          variantId,
          trackBatch: meta?.trackBatch,
          trackExpiry: meta?.trackExpiry,
          quantity: items[itemIndex]?.quantity || 1,
          unit: product.unit || 'pcs',
          expectedPrice: product.cost || 0,
          expectedSellingPrice: product.price || 0,
          isManualEntry: false,
        }
        return { ...prev, items }
      })
      setProductSelectOpen('')
      setProductSearchQuery('')
      const productId = product.id || (product as { _id?: string })._id
      setTimeout(() => focusField(qtyInputRefs.current[rowKey(String(productId), variantId)]), 80)
    },
    [],
  )

  const handleCatalogItemSelect = useCallback(
    (itemIndex: number, catalogItem: PurchaseCatalogItem) => {
      const builtProduct = {
        id: catalogItem.productId,
        _id: catalogItem.productId,
        // catalogItem.name already reads "Toshiba — 12" for a variant row — productName
        // alone would lose the variant label the user just picked.
        name: catalogItem.name,
        nameUrdu: catalogItem.nameUrdu,
        image: catalogItem.image,
        barcode: catalogItem.barcode,
        unit: catalogItem.unit,
        hasVariants: catalogItem.type === 'variant',
        price: catalogItem.price,
        cost: catalogItem.cost,
        stockQuantity: catalogItem.stockQuantity,
        // getDisplayStock reads this (not stockQuantity) once hasVariants is true.
        variantStockTotal: catalogItem.stockQuantity,
      } as Product
      handleProductSelect(itemIndex, builtProduct, catalogItem.variantId, {
        trackBatch: catalogItem.trackBatch,
        trackExpiry: catalogItem.trackExpiry,
      })
    },
    [handleProductSelect],
  )

  const updateQuantity = useCallback((productId: string, quantity: number, variantId?: string) => {
    if (quantity <= 0) return
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        getProductId(item) === productId && (item.variantId || undefined) === (variantId || undefined)
          ? { ...item, quantity }
          : item,
      ),
    }))
  }, [])

  const updateExpectedPrice = useCallback((productId: string, price: number, variantId?: string) => {
    if (price < 0) return
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        getProductId(item) === productId && (item.variantId || undefined) === (variantId || undefined)
          ? { ...item, expectedPrice: price }
          : item,
      ),
    }))
  }, [])

  const updateSellingPrice = useCallback((productId: string, price: number, variantId?: string) => {
    if (price < 0) return
    setDraft((prev) => ({
      ...prev,
      items: prev.items.map((item) =>
        getProductId(item) === productId && (item.variantId || undefined) === (variantId || undefined)
          ? { ...item, expectedSellingPrice: price }
          : item,
      ),
    }))
  }, [])

  // Update per-item discount (type and/or raw value) — supplier discounting one
  // specific product line, on top of any overall order-level discount.
  const updateItemDiscount = useCallback(
    (productId: string, patch: { type?: DiscountType; value?: number }, variantId?: string) => {
      setDraft((prev) => ({
        ...prev,
        items: prev.items.map((item) =>
          getProductId(item) === productId && (item.variantId || undefined) === (variantId || undefined)
            ? {
                ...item,
                discountType: patch.type ?? item.discountType ?? 'fixed',
                discountValue: patch.value ?? item.discountValue ?? 0,
              }
            : item,
        ),
      }))
    },
    [],
  )

  // Flip every discount field (each line item's + the overall one) to the other unit
  // in one click — re-deriving each raw value so the actual Rs discounted stays the
  // same, it's just entered/displayed in the new unit. Mirrors Purchase Invoice's
  // identical toggle, see purchase-panel.tsx's toggleAllDiscountTypes.
  const toggleAllDiscountTypes = useCallback(() => {
    setDraft((prev) => {
      const targetType: DiscountType = prev.discountType === 'percentage' ? 'fixed' : 'percentage'

      const items = prev.items.map((item) => {
        const gross = item.quantity * (item.expectedPrice || 0)
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

      const newSubtotal = items.reduce((sum, item) => {
        const gross = item.quantity * (item.expectedPrice || 0)
        return sum + (gross - computeDiscountAmount(gross, item.discountType, item.discountValue))
      }, 0)
      const currentOverallAmount = computeDiscountAmount(newSubtotal, prev.discountType, prev.discountValue)
      const newOverallValue = targetType === 'percentage'
        ? (newSubtotal > 0 ? (currentOverallAmount / newSubtotal) * 100 : 0)
        : currentOverallAmount

      return {
        ...prev,
        items,
        discountType: targetType,
        discountValue: Math.round(newOverallValue * 100) / 100,
      }
    })
  }, [])

  const removeItem = useCallback((productId: string, variantId?: string) => {
    setDraft((prev) => {
      const next = prev.items.filter(
        (item) => !(getProductId(item) === productId && (item.variantId || undefined) === (variantId || undefined)),
      )
      return {
        ...prev,
        items: next.length > 0 ? next : [createEmptyOrderManualItem()],
      }
    })
  }, [])

  const buildPayload = (status?: 'draft' | 'sent') => {
    const validItems = draft.items.filter(
      (item) => getProductId(item) && item.product.name,
    )
    return {
      supplier: draft.supplier._id,
      orderDate: new Date(draft.orderDate).toISOString(),
      expectedDeliveryDate: draft.expectedDeliveryDate
        ? new Date(draft.expectedDeliveryDate).toISOString()
        : undefined,
      notes: draft.notes,
      termsAndConditions: draft.termsAndConditions,
      discountType: draft.discountType || 'fixed',
      discountValue: Number(draft.discountValue || 0),
      discount: discountAmount,
      tax: Number(draft.tax || 0),
      shippingCost: Number(draft.shippingCost || 0),
      subtotal,
      totalAmount,
      status,
      items: validItems.map((item) => {
        const gross = Number(item.quantity) * Number(item.expectedPrice || 0)
        const itemDiscountAmount = computeDiscountAmount(gross, item.discountType, item.discountValue)
        return {
          product: getProductId(item),
          variantId: item.variantId,
          productName: item.product.name,
          productNameUrdu: item.product.nameUrdu,
          quantity: Number(item.quantity),
          unit: item.unit || item.product.unit || 'pcs',
          expectedPrice: Number(item.expectedPrice || 0),
          expectedSellingPrice:
            item.expectedSellingPrice && item.expectedSellingPrice > 0
              ? Number(item.expectedSellingPrice)
              : undefined,
          discountType: item.discountType || 'fixed',
          discountValue: Number(item.discountValue || 0),
          discountAmount: itemDiscountAmount,
          total: gross - itemDiscountAmount,
        }
      }),
    }
  }

  const handleSave = useCallback(
    async (statusAfterSave: 'draft' | 'sent') => {
      const supplierId = draft.supplier._id
      if (!supplierId) {
        toast.error('Please select a supplier')
        setSupplierSelectOpen(true)
        return
      }

      const validItems = draft.items.filter(
        (item) => getProductId(item) && item.product.name,
      )
      if (validItems.length === 0) {
        toast.error('Add at least one product')
        openProductSelector()
        return
      }

      setSaving(true)
      try {
        if (editing) {
          const id = editing._id || editing.id!
          const payload = buildPayload(undefined)
          delete (payload as { status?: string }).status
          await updatePO({ id, data: payload }).unwrap()
          if (statusAfterSave === 'sent' && editing.status === 'draft') {
            await sendPO(id).unwrap()
          }
          toast.success(`Order ${editing.orderNumber} updated`)
        } else {
          const created = await createPO(buildPayload('draft')).unwrap()
          if (statusAfterSave === 'sent') {
            await sendPO(created._id || created.id!).unwrap()
          }
          toast.success(
            statusAfterSave === 'sent'
              ? `Order ${created.orderNumber} created and sent`
              : `Order ${created.orderNumber} saved as draft`,
          )
        }
        onSaved()
      } catch (e: any) {
        toast.error(e?.data?.message || 'Failed to save purchase order')
      } finally {
        setSaving(false)
      }
    },
    [draft, editing, subtotal, totalAmount, createPO, updatePO, sendPO, onSaved, openProductSelector],
  )

  useInvoiceSaveShortcuts(
    () => handleSave('draft'),
    () => handleSave('sent'),
    () => handleSave('sent'),
    saving,
  )

  const selectSupplier = useCallback((s: (typeof suppliers)[number]) => {
    const sid = s._id || (s as { id?: string }).id || ''
    if (!sid) return
    setDraft((prev) => ({
      ...prev,
      supplier: {
        _id: sid,
        name: s.name,
        nameUrdu: s.nameUrdu,
        phone: s.phone,
        picture: s.picture,
      },
    }))
    setSupplierSelectOpen(false)
    setSupplierSearchQuery('')
    focusField(orderDateRef.current)
  }, [])

  // Auto-select the AI-recommended supplier passed in from the Purchase Suggestions page,
  // once suppliers have loaded. Runs at most once per mount; never overrides an existing order.
  useEffect(() => {
    if (!prefillSupplierId || editing || prefillSupplierAppliedRef.current) return
    if (suppliers.length === 0) return
    const match = suppliers.find((s) => s._id === prefillSupplierId || (s as { id?: string }).id === prefillSupplierId)
    if (!match) return
    selectSupplier(match)
    prefillSupplierAppliedRef.current = true
  }, [prefillSupplierId, editing, suppliers, selectSupplier])

  const supplierId = draft.supplier._id

  return (
    <div
      className={cn(
        !showProductCatalog
          ? 'grid grid-cols-1 gap-4 lg:grid-cols-[minmax(320px,420px)_minmax(0,1fr)] items-start'
          : 'space-y-4',
      )}
    >
      <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', !showProductCatalog && 'lg:col-start-1 lg:col-span-2 lg:row-start-1')}>
        <div className='flex items-center gap-3'>
          <Button variant='ghost' size='sm' onClick={onBack}>
            <ArrowLeft className='h-4 w-4' />
          </Button>
          <div>
            <h1 className='text-xl font-bold tracking-tight flex items-center gap-2'>
              <ClipboardList className='h-5 w-5' />
              {editing ? `Edit ${editing.orderNumber}` : 'New Purchase Order'}
            </h1>
            <p className='text-xs text-muted-foreground mt-0.5'>
              Enter to move fields · Ctrl+D save draft · Ctrl+S save &amp; send · Ctrl+Enter save &amp; send
            </p>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' size='sm' disabled={saving} onClick={() => handleSave('draft')}>
            <Save className='mr-2 h-4 w-4' />
            Save draft
          </Button>
          <Button size='sm' disabled={saving} onClick={() => handleSave('sent')}>
            <Send className='mr-2 h-4 w-4' />
            {editing && editing.status !== 'draft' ? 'Save' : 'Save & send'}
          </Button>
        </div>
      </div>

      <Card className={cn(!showProductCatalog && 'lg:col-start-1 lg:row-start-2')}>
        <CardHeader className='pb-3'>
          <CardTitle className='text-base'>Order details</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div>
            <Label className='mb-2'>
              Supplier <span className='text-red-500'>*</span>
            </Label>
            <Popover open={supplierSelectOpen} onOpenChange={setSupplierSelectOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant='outline'
                  role='combobox'
                  aria-expanded={supplierSelectOpen}
                  className={cn(
                    'w-full justify-between min-h-[2.5rem]',
                    !supplierId && 'border-red-500 bg-red-50 dark:bg-red-950/20',
                  )}
                  onKeyDown={(e) => {
                    if (e.key === 'ArrowDown') {
                      e.preventDefault()
                      setSupplierSelectOpen(true)
                      return
                    }
                    if (!supplierSelectOpen && supplierId) {
                      onEnterAdvance(e, () => focusField(orderDateRef.current))
                    }
                  }}
                >
                  <div className='flex items-center gap-2 flex-1 min-w-0'>
                    <Search className='h-4 w-4 shrink-0 text-muted-foreground' />
                    {supplierId ? (
                      <Badge variant='secondary' className='flex items-center gap-1.5 max-w-full pl-1'>
                        <ContactPhotoCell
                          picture={draft.supplier.picture}
                          name={draft.supplier.name}
                          className='h-5 w-5 shrink-0 rounded-full'
                        />
                        <span className='truncate text-xs'>{draft.supplier.name}</span>
                      </Badge>
                    ) : (
                      <span className='text-muted-foreground truncate'>Select supplier *</span>
                    )}
                  </div>
                  <ChevronDown className='h-4 w-4 opacity-50 shrink-0' />
                </Button>
              </PopoverTrigger>
              <PopoverContent className='w-[calc(100vw-2rem)] max-w-[400px] p-0' align='start'>
                <Command shouldFilter={false}>
                  <div className='relative'>
                    <CommandInput
                      placeholder='Search suppliers...'
                      value={supplierSearchQuery}
                      onValueChange={setSupplierSearchQuery}
                    />
                    <div className='absolute right-2 top-1/2 -translate-y-1/2'>
                      <VoiceInputButton
                        onTranscript={(text) => setSupplierSearchQuery(text)}
                        size='sm'
                      />
                    </div>
                  </div>
                  <CommandList className='max-h-[280px] overflow-y-auto'>
                    {filteredSuppliers.length === 0 ? (
                      <p className='py-6 text-center text-sm text-muted-foreground'>No suppliers found</p>
                    ) : (
                      <CommandGroup>
                        {filteredSuppliers.map((s, index) => {
                          const sid = s._id || (s as { id?: string }).id || `s-${index}`
                          const selected = supplierId === sid
                          return (
                            <CommandItem
                              key={sid}
                              value={`${s.name} ${s.phone || ''} ${sid}`}
                              onSelect={() => selectSupplier(s)}
                              className='flex cursor-pointer items-center gap-3 p-3'
                            >
                              <ContactPhotoCell picture={s.picture} name={s.name} className='h-8 w-8 shrink-0' />
                              <div className='min-w-0 flex-1'>
                                <p className='truncate font-medium text-sm'>{s.name}</p>
                                {s.phone ? (
                                  <p className='text-xs text-muted-foreground'>{s.phone}</p>
                                ) : null}
                              </div>
                              {selected ? <Check className='h-4 w-4 text-primary shrink-0' /> : null}
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

          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
            <div>
              <Label htmlFor='po-order-date'>Order date *</Label>
              <Input
                ref={orderDateRef}
                id='po-order-date'
                type='date'
                value={draft.orderDate}
                onChange={(e) => setDraft((p) => ({ ...p, orderDate: e.target.value }))}
                onKeyDown={(e) => onEnterAdvance(e, () => focusField(expectedDateRef.current))}
                className='mt-2'
              />
            </div>
            <div>
              <Label htmlFor='po-expected-date'>Expected delivery</Label>
              <Input
                ref={expectedDateRef}
                id='po-expected-date'
                type='date'
                value={draft.expectedDeliveryDate}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, expectedDeliveryDate: e.target.value }))
                }
                onKeyDown={(e) => onEnterAdvance(e, openProductSelector)}
                className='mt-2'
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className={cn(!showProductCatalog && 'min-w-0 lg:col-start-2 lg:row-start-2 lg:row-span-2 lg:self-stretch')}>
        <CardHeader className={cn('pb-3', !showProductCatalog && 'py-3')}>
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <CardTitle className={cn('text-base')}>Order items ({draft.items.length})</CardTitle>
            <div className='flex flex-wrap items-center gap-2'>
              {draft.items.length > 0 && (
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  onClick={toggleAllDiscountTypes}
                  className='flex items-center gap-1'
                  title='Switch every discount (all items + overall) to this unit at once'
                >
                  <ArrowLeftRight className='h-4 w-4' />
                  <span className='hidden sm:inline'>Switch All Discounts to</span>
                  <span className='sm:hidden'>Switch to</span>
                  {' '}{draft.discountType === 'percentage' ? 'Rs' : '%'}
                </Button>
              )}
              <Button size='sm' variant='outline' onClick={addNewRowAndOpenProduct} className='gap-1'>
                <Plus className='h-4 w-4' />
                Add item
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className={cn('p-4', !showProductCatalog && 'flex flex-1 flex-col p-2 lg:min-h-0')}>
          <div
            ref={itemsScrollRef}
            className={cn(
              'space-y-2 overflow-y-auto pr-1',
              showProductCatalog ? 'max-h-[420px]' : 'space-y-1.5',
            )}
          >
            {draft.items.map((item, index) => {
              const productId = getProductId(item)
              const compact = !showProductCatalog

              if (item.isManualEntry && !productId) {
                return (
                  <div
                    key={`manual-${index}`}
                    className='overflow-hidden rounded-xl border bg-card shadow-sm'
                  >
                    <div className={cn('flex items-center gap-3', compact ? 'p-2' : 'p-3')}>
                      <div className={cn('flex shrink-0 items-center justify-center rounded-lg bg-muted', compact ? 'h-8 w-8' : 'h-10 w-10')}>
                        <Package className={cn('text-muted-foreground/50', compact ? 'h-4 w-4' : 'h-5 w-5')} />
                      </div>
                      <div className='min-w-0 flex-1'>
                        <Popover
                          open={productSelectOpen === `manual-${index}`}
                          onOpenChange={(open) => {
                            setProductSelectOpen(open ? `manual-${index}` : '')
                            if (!open) setProductSearchQuery('')
                          }}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              variant='outline'
                              className='h-8 w-full justify-start border-dashed text-xs'
                            >
                              <Search className='mr-2 h-3 w-3 shrink-0' />
                              Select product *
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className='w-[calc(100vw-2rem)] max-w-[560px] p-0' align='start'>
                            <Command shouldFilter={false}>
                              <div className='relative'>
                                <CommandInput
                                  placeholder='Search name or barcode...'
                                  value={productSearchQuery}
                                  onValueChange={setProductSearchQuery}
                                />
                                <div className='absolute right-2 top-1/2 -translate-y-1/2'>
                                  <VoiceInputButton
                                    onTranscript={(text) => setProductSearchQuery(text)}
                                    size='sm'
                                  />
                                </div>
                              </div>
                              <CommandList className='max-h-[300px] overflow-y-auto'>
                                {productsLoading && filteredCatalogItems.length === 0 ? (
                                  <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                                    <Loader2 className='h-6 w-6 animate-spin' />
                                    Loading products...
                                  </div>
                                ) : filteredCatalogItems.length === 0 ? (
                                  <p className='py-6 text-center text-sm text-muted-foreground'>
                                    No products found
                                  </p>
                                ) : (
                                  <CommandGroup>
                                    {visibleCatalogItems.map((catalogItem) => (
                                      <CommandItem
                                        key={catalogItem.id}
                                        value={`${catalogItem.id}-${catalogItem.name}`}
                                        onSelect={() => handleCatalogItemSelect(index, catalogItem)}
                                        className='flex cursor-pointer items-center gap-3 p-3'
                                      >
                                        {catalogItem.image?.url ? (
                                          <img
                                            src={catalogItem.image.url}
                                            alt={catalogItem.name}
                                            className='h-8 w-8 shrink-0 rounded-lg object-cover'
                                          />
                                        ) : (
                                          <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted'>
                                            <Package className='h-4 w-4 text-muted-foreground' />
                                          </div>
                                        )}
                                        <div className='min-w-0 flex-1'>
                                          <div className='flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0.5'>
                                            <div className='shrink-0 truncate text-sm font-medium'>{catalogItem.name}</div>
                                            {catalogItem.nameUrdu?.trim() ? (
                                              <span
                                                dir='rtl'
                                                className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(catalogItem.nameUrdu))}
                                              >
                                                {catalogItem.nameUrdu.trim()}
                                              </span>
                                            ) : null}
                                            {catalogItem.brand?.name && (
                                              <Badge variant='secondary' className='shrink-0 px-1.5 py-0 text-[10px]'>
                                                {catalogItem.brand.name}
                                              </Badge>
                                            )}
                                          </div>
                                          <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                                            {catalogItem.barcode && <span>{catalogItem.barcode}</span>}
                                            <span className='text-amber-600'>Purchase Price: Rs{Number(catalogItem.cost || 0).toFixed(2)}</span>
                                            <span className={catalogItem.stockQuantity <= 5 ? 'font-medium text-red-500' : 'text-green-600'}>
                                              Stock: {catalogItem.stockQuantity}
                                            </span>
                                            {catalogItem.trackBatch && (
                                              <span className='text-blue-600'>
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
                              {filteredCatalogItems.length > visibleCatalogItems.length ? (
                                <div className='border-t px-3 py-2 text-center text-xs text-muted-foreground'>
                                  Showing {visibleCatalogItems.length} of {filteredCatalogItems.length} — keep typing to narrow
                                </div>
                              ) : null}
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                      <Button
                        size='sm'
                        variant='ghost'
                        className='h-7 w-7 shrink-0 p-0'
                        onClick={() =>
                          setDraft((p) => ({
                            ...p,
                            items: p.items.filter((_, i) => i !== index),
                          }))
                        }
                        disabled={draft.items.length === 1}
                      >
                        <Trash2 className='h-3.5 w-3.5 text-red-400' />
                      </Button>
                    </div>
                  </div>
                )
              }

              const rk = rowKey(productId, item.variantId)
              const deleteButton = (
                <Button
                  size='sm'
                  variant='ghost'
                  className='h-7 w-7 shrink-0 p-0'
                  onClick={() => removeItem(productId, item.variantId)}
                >
                  <Trash2 className='h-3.5 w-3.5 text-red-400' />
                </Button>
              )

              // Line-level discount (supplier discounting this one product) — net is
              // what actually feeds the order subtotal.
              const itemGross = item.quantity * item.expectedPrice
              const itemDiscountAmount = computeDiscountAmount(itemGross, item.discountType, item.discountValue)
              const itemNet = itemGross - itemDiscountAmount

              return (
                <div
                  key={`${rk}-${index}`}
                  className='overflow-hidden rounded-xl border bg-card shadow-sm'
                >
                  {/* Compact (catalog hidden): row1 + row2 flatten via `contents` into one
                      flex-wrap line, same trick as InvoicePanel's compact item rows. */}
                  <div className={cn(compact && 'flex flex-wrap items-center gap-2 p-2')}>
                  <div className={cn(compact ? 'contents' : 'flex items-start gap-3 p-3')}>
                    <div className={cn('flex shrink-0 items-center justify-center rounded-lg bg-muted', compact ? 'h-8 w-8' : 'mt-0.5 h-10 w-10')}>
                      <Package className={cn('text-muted-foreground/50', compact ? 'h-4 w-4' : 'h-5 w-5')} />
                    </div>
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
                      <div className='mt-0.5 flex flex-wrap items-center gap-2'>
                        {!compact && (
                          <span className='text-xs text-muted-foreground'>{item.unit || item.product.unit || 'pcs'}</span>
                        )}
                        {(() => {
                          const stock = getDisplayStock(item.product)
                          return (
                            <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[11px] font-medium ${
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
                          )
                        })()}
                      </div>
                    </div>
                    {!compact && deleteButton}
                  </div>
                  <div className={cn(compact ? 'contents' : 'flex flex-wrap items-center gap-3 border-t bg-muted/20 px-3 py-2.5')}>
                    <div className='flex items-center gap-1.5 shrink-0'>
                      <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className='h-7 w-7 rounded-none border-r p-0'
                          onClick={() => updateQuantity(productId, Math.max(1, item.quantity - 1), item.variantId)}
                        >
                          <Minus className='h-3.5 w-3.5' />
                        </Button>
                        <Input
                          ref={(el) => {
                            qtyInputRefs.current[rk] = el
                          }}
                          type='number'
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(productId, parseInt(e.target.value, 10) || 1, item.variantId)
                          }
                          onKeyDown={(e) =>
                            onEnterAdvance(e, () => focusField(costInputRefs.current[rk]))
                          }
                          onFocus={(e) => e.target.select()}
                          className='h-7 w-14 border-0 text-center text-sm font-semibold focus-visible:ring-0 [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]'
                        />
                        <Button
                          type='button'
                          size='sm'
                          variant='ghost'
                          className='h-7 w-7 rounded-none border-l p-0'
                          onClick={() => updateQuantity(productId, item.quantity + 1, item.variantId)}
                        >
                          <Plus className='h-3.5 w-3.5' />
                        </Button>
                      </div>
                    </div>
                    <span className='text-sm text-muted-foreground/60'>×</span>
                    <div className='flex flex-col gap-0.5 shrink-0'>
                      <span className='text-[10px] leading-none text-muted-foreground'>Purchase Price</span>
                      <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                        <span className='flex h-7 items-center border-r bg-muted px-2 text-xs'>Rs</span>
                        <Input
                          ref={(el) => {
                            costInputRefs.current[rk] = el
                          }}
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={getNumericDraftValue(`${rk}:expectedPrice`, item.expectedPrice)}
                          onChange={(e) =>
                            handleNumericDraftChange(`${rk}:expectedPrice`, e.target.value, (parsed) =>
                              updateExpectedPrice(productId, parsed, item.variantId),
                            )
                          }
                          onKeyDown={(e) => onEnterAdvance(e, addNewRowAndOpenProduct)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => clearNumericDraft(`${rk}:expectedPrice`)}
                          className='h-7 w-20 border-0 text-sm font-semibold focus-visible:ring-0'
                        />
                      </div>
                    </div>

                    {/* − separator */}
                    <span className='text-sm text-muted-foreground/60'>−</span>

                    {/* Item Discount Input */}
                    <div className='flex flex-col gap-0.5 shrink-0'>
                      <span className='text-[10px] leading-none text-muted-foreground'>Discount</span>
                      <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                        <Input
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={getNumericDraftValue(`${rk}:itemDiscount`, item.discountValue || 0)}
                          onChange={(e) =>
                            handleNumericDraftChange(`${rk}:itemDiscount`, e.target.value, (parsed) =>
                              updateItemDiscount(productId, { value: Math.max(0, parsed) }, item.variantId),
                            )
                          }
                          onFocus={(e) => e.target.select()}
                          onBlur={() => clearNumericDraft(`${rk}:itemDiscount`)}
                          placeholder='0'
                          className='h-7 w-14 border-0 text-sm font-semibold focus-visible:ring-0'
                        />
                        <button
                          type='button'
                          onClick={() =>
                            updateItemDiscount(
                              productId,
                              { type: item.discountType === 'percentage' ? 'fixed' : 'percentage' },
                              item.variantId,
                            )
                          }
                          title='Click to switch between Rs and % discount'
                          className='flex h-7 items-center border-l bg-muted px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95'
                        >
                          {item.discountType === 'percentage' ? '%' : 'Rs'}
                        </button>
                      </div>
                    </div>

                    <span className='text-sm text-muted-foreground/60'>→</span>
                    <div className='flex flex-col gap-0.5 shrink-0'>
                      <span className='text-[10px] font-medium leading-none text-blue-500'>Sale Price</span>
                      <div className='flex items-center overflow-hidden rounded-lg border border-blue-200 bg-blue-50/50'>
                        <span className='flex h-7 items-center border-r border-blue-200 bg-blue-100/60 px-2 text-xs text-blue-600'>
                          Rs
                        </span>
                        <Input
                          type='text'
                          inputMode='decimal'
                          showVoiceInput={false}
                          value={getNumericDraftValue(`${rk}:expectedSellingPrice`, item.expectedSellingPrice ?? 0)}
                          onChange={(e) =>
                            handleNumericDraftChange(`${rk}:expectedSellingPrice`, e.target.value, (parsed) =>
                              updateSellingPrice(productId, parsed, item.variantId),
                            )
                          }
                          onKeyDown={(e) => onEnterAdvance(e, addNewRowAndOpenProduct)}
                          onFocus={(e) => e.target.select()}
                          onBlur={() => clearNumericDraft(`${rk}:expectedSellingPrice`)}
                          placeholder='0'
                          className='h-7 w-20 border-0 bg-transparent text-sm font-semibold text-blue-700 focus-visible:ring-0'
                        />
                      </div>
                    </div>
                    <div className='ml-auto flex flex-col items-end gap-0 shrink-0'>
                      {itemDiscountAmount > 0 && (
                        <span className='text-[10px] leading-none text-muted-foreground line-through'>Rs{itemGross.toFixed(2)}</span>
                      )}
                      <div className='flex items-center gap-1.5'>
                        <span className='text-sm text-muted-foreground/60'>=</span>
                        <p className='text-sm font-bold tabular-nums'>
                          Rs{itemNet.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  {compact && deleteButton}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card className={cn(!showProductCatalog && 'lg:col-start-1 lg:row-start-3')}>
        <CardContent className='space-y-4 p-4'>
          <div>
            <Label htmlFor='po-notes'>Notes</Label>
            <Textarea
              id='po-notes'
              rows={2}
              value={draft.notes}
              onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
              placeholder='Internal notes...'
              className='mt-2'
            />
          </div>
          <Separator />
          <div className='space-y-2'>
            <div className='flex justify-between text-sm'>
              <span className='text-muted-foreground'>Subtotal</span>
              <span className='font-medium tabular-nums'>Rs{grossSubtotal.toFixed(2)}</span>
            </div>
            {itemDiscountTotal > 0 && (
              <div className='flex justify-between text-sm text-green-600'>
                <span>Item Discounts</span>
                <span className='tabular-nums'>-Rs{itemDiscountTotal.toFixed(2)}</span>
              </div>
            )}
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>Discount</span>
              <div className='flex items-center overflow-hidden rounded-lg border bg-background'>
                <Input
                  type='text'
                  inputMode='decimal'
                  showVoiceInput={false}
                  value={getNumericDraftValue('overallDiscount', draft.discountValue || 0)}
                  onChange={(e) =>
                    handleNumericDraftChange('overallDiscount', e.target.value, (parsed) =>
                      setDraft((p) => ({ ...p, discountValue: Math.max(0, parsed) })),
                    )
                  }
                  onFocus={(e) => e.target.select()}
                  onBlur={() => clearNumericDraft('overallDiscount')}
                  placeholder='0'
                  className='h-8 w-20 border-0 text-right focus-visible:ring-0'
                />
                <button
                  type='button'
                  onClick={() =>
                    setDraft((p) => ({
                      ...p,
                      discountType: p.discountType === 'percentage' ? 'fixed' : 'percentage',
                    }))
                  }
                  title='Click to switch between Rs and % discount'
                  className='flex h-8 items-center border-l bg-muted px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary hover:text-primary-foreground active:scale-95'
                >
                  {draft.discountType === 'percentage' ? '%' : 'Rs'}
                </button>
              </div>
            </div>
            {discountAmount > 0 && (
              <div className='flex justify-between text-sm text-green-600'>
                <span>Discount Applied</span>
                <span className='tabular-nums'>-Rs{discountAmount.toFixed(2)}</span>
              </div>
            )}
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>Tax</span>
              <Input
                type='text'
                inputMode='decimal'
                showVoiceInput={false}
                value={getNumericDraftValue('tax', draft.tax || 0)}
                onChange={(e) =>
                  handleNumericDraftChange('tax', e.target.value, (parsed) =>
                    setDraft((p) => ({ ...p, tax: Math.max(0, parsed) })),
                  )
                }
                onFocus={(e) => e.target.select()}
                onBlur={() => clearNumericDraft('tax')}
                placeholder='0'
                className='h-8 w-28 text-right'
              />
            </div>
            <div className='flex items-center justify-between gap-2 text-sm'>
              <span className='text-muted-foreground'>Shipping</span>
              <Input
                type='text'
                inputMode='decimal'
                showVoiceInput={false}
                value={getNumericDraftValue('shippingCost', draft.shippingCost || 0)}
                onChange={(e) =>
                  handleNumericDraftChange('shippingCost', e.target.value, (parsed) =>
                    setDraft((p) => ({ ...p, shippingCost: Math.max(0, parsed) })),
                  )
                }
                onFocus={(e) => e.target.select()}
                onBlur={() => clearNumericDraft('shippingCost')}
                placeholder='0'
                className='h-8 w-28 text-right'
              />
            </div>
            <Separator />
            <div className='flex justify-between text-lg font-bold'>
              <span>Total</span>
              <span className='text-primary tabular-nums'>Rs{totalAmount.toFixed(2)}</span>
            </div>
            {(itemDiscountTotal + discountAmount) > 0 && (
              <div className='flex justify-between text-xs font-medium text-green-600'>
                <span>You Saved</span>
                <span className='tabular-nums'>Rs{(itemDiscountTotal + discountAmount).toFixed(2)}</span>
              </div>
            )}
          </div>
          {/* Save buttons — compact mode (catalog hidden): the sticky bar below and the
              header row above already cover these actions, so this duplicate is hidden. */}
          {showProductCatalog && (
          <div className='flex flex-wrap gap-2 pt-2'>
            <Button variant='outline' disabled={saving} onClick={() => handleSave('draft')}>
              <Save className='mr-2 h-4 w-4' />
              Save draft (Ctrl+D)
            </Button>
            <Button disabled={saving} onClick={() => handleSave('sent')}>
              <Send className='mr-2 h-4 w-4' />
              Save &amp; send (Ctrl+S)
            </Button>
          </div>
          )}
        </CardContent>
      </Card>

      {/* Fast-ordering buttons bar — catalog hidden means the panel is a two-column
          layout (details+totals on the left, items on the right); the primary actions are
          always reachable without scrolling. Portaled into a footer slot the page keeps
          outside the cards' scroll region — see PurchasePanel's identical bar for why. */}
      {!showProductCatalog && (() => {
        const bar = (
          <div className='flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-card/90'>
            <div className='flex items-baseline gap-2 pl-1'>
              <span className='text-xs text-muted-foreground'>
                {draft.items.filter((i) => getProductId(i) && i.product.name).length} items
              </span>
              <span className='text-lg font-bold tabular-nums'>Rs{totalAmount.toFixed(2)}</span>
            </div>
            <div className='flex flex-wrap items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={saving}
                onClick={() => handleSave('draft')}
                className='gap-1.5'
              >
                <Save className='h-4 w-4' />
                Save draft
              </Button>
              <Button type='button' size='sm' disabled={saving} onClick={() => handleSave('sent')} className='gap-1.5'>
                <Send className='h-4 w-4' />
                {editing && editing.status !== 'draft' ? 'Save' : 'Save & send'}
              </Button>
            </div>
          </div>
        )
        return stickyActionsContainer
          ? createPortal(bar, stickyActionsContainer)
          : <div className='sticky bottom-3 z-20 lg:col-span-2'>{bar}</div>
      })()}
    </div>
  )
}

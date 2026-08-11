import type { PurchaseCatalogItem, PurchaseCatalogBatch } from '@/stores/purchaseCatalog.api'
import type { ImeiEntryInput } from '@/stores/imei.api'
import type { BatchAllocation } from '@/lib/batch-allocation'
import type { DiscountType } from '@/lib/discount'

export type CartLine = {
  key: string
  productId: string
  variantId?: string
  name: string
  nameUrdu?: string
  barcode?: string
  unit?: string
  unitPrice: number
  cost: number
  quantity: number
  stockQuantity: number
  image?: { url: string; publicId: string }
  // Line-level discount (e.g. a customer discount on this one product), applied on top
  // of quantity * unitPrice. Mirrors invoice/purchase-invoice's item discount fields.
  discountType?: DiscountType
  discountValue?: number
  // Whether this line's product is IMEI/serial or batch/expiry tracked — copied from the
  // catalog at add-time (these are fixed product properties, unlike batches/stock which
  // are looked up live from the catalog cache elsewhere). Mirrors invoice's InvoiceItem.
  trackImei?: boolean
  trackSerial?: boolean
  trackBatch?: boolean
  trackExpiry?: boolean
  // Picked batch to deplete. Only set when the variant tracks batch/expiry. When the
  // line is split across multiple batches (batchAllocations below has 2+ entries), this
  // mirrors the *first* allocation. See docs/architecture/universal-product-migration.md.
  batchId?: string
  batchNumber?: string
  batchAllocations?: BatchAllocation[]
  // Picked IMEI/serial numbers — required (one per unit) before charging a
  // trackImei/trackSerial line, validated in fast-billing/index.tsx's handleCharge.
  imeis?: ImeiEntryInput[]
}

// The account bucket money actually moves through — mirrors Invoice/Purchase's
// paymentMethod field. 'wallet' always pairs with a walletType (a real Bank Account /
// mobile wallet name); there is no generic 'card'/'bank' placeholder anymore — every
// real account is selectable by its own name via buildMergedPaymentOptions.
export type PaymentMethod = 'cash' | 'wallet'

// Whether the sale is collected now or put on the customer's account — independent of
// PaymentMethod (a credit sale can still take a cash/wallet down payment).
export type SaleType = 'cash' | 'credit'

/**
 * Normalizes a possibly-stale (pre-Bank-Accounts-feature) persisted payment state —
 * old localStorage drafts/held carts may still carry the legacy 3-way
 * `paymentMethod: 'cash' | 'card' | 'credit'` scheme. 'card' folds into plain 'cash'
 * (it was never a real account), 'credit' becomes the new `saleType`.
 */
export function normalizePaymentState(
  storedPaymentMethod?: string,
  storedSaleType?: string,
): { saleType: SaleType; paymentMethod: PaymentMethod } {
  const saleType: SaleType = storedSaleType === 'credit' || storedPaymentMethod === 'credit' ? 'credit' : 'cash'
  const paymentMethod: PaymentMethod = storedPaymentMethod === 'wallet' ? 'wallet' : 'cash'
  return { saleType, paymentMethod }
}

export function cartLineKey(item: Pick<PurchaseCatalogItem, 'productId' | 'variantId'>): string {
  return item.variantId ? `${item.productId}:${item.variantId}` : item.productId
}

/**
 * Default batch for a newly-added line — the earliest-expiring batch that still has
 * stock (the catalog already sorts batches that way), falling back to the first batch if
 * every one is depleted. Mirrors invoice-panel.tsx's handleProductSelect defaulting.
 * Only real variants carry batches; a legacy (non-variant) product never has one.
 */
export function getDefaultBatch(item: PurchaseCatalogItem): PurchaseCatalogBatch | undefined {
  if (!item.variantId || !(item.trackBatch || item.trackExpiry)) return undefined
  return item.batches?.find((b) => b.quantity > 0) ?? item.batches?.[0]
}

export function catalogItemToCartLine(item: PurchaseCatalogItem, quantity = 1, unitPrice?: number): CartLine {
  const batch = getDefaultBatch(item)
  return {
    key: cartLineKey(item),
    productId: item.productId,
    variantId: item.variantId,
    name: item.name,
    nameUrdu: item.nameUrdu,
    barcode: item.barcode,
    unit: item.unit,
    unitPrice: unitPrice ?? batch?.sellingPrice ?? item.price,
    cost: batch?.costPerUnit ?? item.cost ?? 0,
    quantity,
    stockQuantity: item.stockQuantity,
    image: item.image,
    trackImei: item.trackImei,
    trackSerial: item.trackSerial,
    trackBatch: item.trackBatch,
    trackExpiry: item.trackExpiry,
    batchId: batch?.id,
    batchNumber: batch?.batchNumber,
  }
}

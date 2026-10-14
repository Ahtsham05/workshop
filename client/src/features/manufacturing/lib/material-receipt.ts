import type {
  MaterialReceipt,
  MaterialReceiptLine,
  ProductType,
} from '@/stores/manufacturing.api'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import type {
  EntryContext,
  EntryProduct,
  EntryRowBase,
  HeaderField,
  ProductSource,
  TransactionConfig,
} from '@/components/transaction-engine'

/*
 * RMV — Raw Material Receipt Voucher: the entry-grid configuration (columns, line maths,
 * validation, totals) for the transaction engine. The server recomputes and re-validates
 * everything on confirm (services/manufacturing/materialReceipt.service.js); the maths
 * here mirrors it so the screen shows the same figures while typing.
 */

export type ReceiptRow = EntryRowBase & {
  productType: ProductType | null
  discountPercent: number | null
  taxPercent: number | null
  batchNumber: string
  expiryDate: string | null
  location: string
  notes: string
  gross: number
  discountAmount: number
  taxAmount: number
  netAmount: number
}

export type ReceiptHeader = {
  voucherNumber: string
  date: string
  supplierId: string | null
  purchaseOrderId: string | null
  location: string
  branch: string
  reference: string
  notes: string
}

/** Product types a supplier receipt may bring in (unclassified products too). */
export const RECEIVABLE_TYPES: (ProductType | null)[] = [
  null,
  'raw_material',
  'component',
  'packaging_material',
  'sub_assembly',
  'by_product',
]
export const isReceivable = (type: ProductType | null | undefined) =>
  RECEIVABLE_TYPES.includes(type ?? null)

const round2 = (n: number) => Math.round(n * 100) / 100
const clampPct = (n: number | null | undefined) =>
  Math.min(100, Math.max(0, Number(n) || 0))

/** Same formula as the server: discount on gross, tax on (gross − discount). */
export function computeReceiptLine<T extends ReceiptRow>(row: T): T {
  const quantity = row.product?.trackSerial
    ? (row.serials?.length ?? 0) || null
    : row.quantity
  const gross = round2((quantity || 0) * (row.rate || 0))
  const discountAmount = round2((gross * clampPct(row.discountPercent)) / 100)
  const taxAmount = round2(
    ((gross - discountAmount) * clampPct(row.taxPercent)) / 100
  )
  return {
    ...row,
    quantity,
    gross,
    discountAmount,
    taxAmount,
    netAmount: round2(gross - discountAmount + taxAmount),
  }
}

const raw = (p: EntryProduct | null) =>
  (p?.raw as PurchaseCatalogItem & { productType?: ProductType | null }) || null
const trackExpiry = (p: EntryProduct | null) => !!raw(p)?.trackExpiry

export const blankReceiptRow = (): Omit<ReceiptRow, 'id'> => ({
  product: null,
  productType: null,
  quantity: null,
  unit: undefined,
  rate: null,
  discountPercent: null,
  taxPercent: null,
  batchNumber: '',
  expiryDate: null,
  serials: [],
  location: '',
  notes: '',
  gross: 0,
  discountAmount: 0,
  taxAmount: 0,
  netAmount: 0,
})

const TYPE_SHORT: Record<string, string> = {
  raw_material: 'Raw material',
  component: 'Component',
  packaging_material: 'Packaging',
  sub_assembly: 'Sub-assembly',
  by_product: 'By-product',
  finished_good: 'Finished good',
  wip: 'WIP',
  scrap: 'Scrap',
  service: 'Service',
}
export const productTypeLabel = (type: string | null | undefined) =>
  type ? TYPE_SHORT[type] || type : 'Unclassified'

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function createReceiptConfig(opts: {
  headerFields: HeaderField<ReceiptHeader>[]
  locations: string[]
  defaultLocation: string
  formatMoney: (n: number) => string
}): TransactionConfig<ReceiptRow, ReceiptHeader> {
  const { formatMoney } = opts
  return {
    id: 'material-receipt',
    noun: 'Raw material receipt',
    maxRows: 1000,
    initialHeader: () => ({
      voucherNumber: '',
      date: today(),
      supplierId: null,
      purchaseOrderId: null,
      location: opts.defaultLocation,
      branch: '',
      reference: '',
      notes: '',
    }),
    headerFields: opts.headerFields,
    createRow: blankReceiptRow,
    columns: [
      {
        key: 'product',
        label: 'Product',
        kind: 'product',
        width: 'minmax(15rem, 3fr)',
      },
      {
        key: 'productType',
        label: 'Type',
        kind: 'computed',
        width: '6.5rem',
        render: (row) => (row.product ? productTypeLabel(row.productType) : ''),
      },
      {
        key: 'quantity',
        label: 'Qty',
        kind: 'quantity',
        decimals: 3,
        // A serial-tracked item's quantity is how many serials were entered.
        editable: (row) => !row.product?.trackSerial,
      },
      {
        key: 'unit',
        label: 'Unit',
        kind: 'computed',
        width: '4rem',
        render: (row) => row.unit || '',
      },
      { key: 'rate', label: 'Rate', kind: 'rate', decimals: 2 },
      {
        key: 'discountPercent',
        label: 'Disc %',
        kind: 'number',
        width: '5rem',
        decimals: 2,
        skipOnEnter: true,
      },
      {
        key: 'taxPercent',
        label: 'Tax %',
        kind: 'number',
        width: '5rem',
        decimals: 2,
        skipOnEnter: true,
      },
      {
        key: 'netAmount',
        label: 'Net Cost',
        kind: 'computed',
        width: '8rem',
        render: (row) => (row.product ? formatMoney(row.netAmount) : ''),
      },
      {
        key: 'batchNumber',
        label: 'Batch',
        kind: 'text',
        width: '8rem',
        placeholder: 'Batch no.',
        editable: (row) => !!row.product?.trackBatch,
      },
      {
        key: 'expiryDate',
        label: 'Expiry',
        kind: 'date',
        editable: (row) => trackExpiry(row.product),
      },
      {
        key: 'serials',
        label: 'Serials',
        kind: 'serial',
        serialMode: 'enter',
        editable: (row) => !!row.product?.trackSerial,
      },
      {
        key: 'location',
        label: 'Warehouse',
        kind: 'select',
        width: 'minmax(8rem, 1fr)',
        placeholder: 'As voucher',
        skipOnEnter: true,
        options: () => opts.locations.map((l) => ({ value: l, label: l })),
      },
      {
        key: 'notes',
        label: 'Notes',
        kind: 'text',
        width: 'minmax(8rem, 1.2fr)',
        skipOnEnter: true,
      },
    ],
    applyProduct: (row, product) =>
      computeReceiptLine({
        ...row,
        product,
        productType: raw(product)?.productType ?? null,
        unit: product.unit,
        rate:
          row.product?.key === product.key && row.rate !== null
            ? row.rate
            : (product.cost ?? null),
        batchNumber: '',
        expiryDate: null,
        serials: [],
      }),
    computeRow: (row) => computeReceiptLine(row),
    validateRow: (row) => {
      const errors: Record<string, string> = {}
      if (!row.product) {
        errors.product = 'Pick a product'
        return errors
      }
      if (!isReceivable(row.productType)) {
        errors.product = `${productTypeLabel(row.productType)} can't be received here`
      }
      if (row.product.trackSerial) {
        if (!row.serials?.length)
          errors.serials = 'Scan or type the serial numbers'
      } else if (!((row.quantity || 0) > 0)) {
        errors.quantity = 'Enter a quantity above 0'
      }
      if (row.rate === null || row.rate === undefined || row.rate < 0)
        errors.rate = 'Enter the rate'
      if ((row.discountPercent ?? 0) > 100)
        errors.discountPercent = 'At most 100%'
      if ((row.taxPercent ?? 0) > 100) errors.taxPercent = 'At most 100%'
      if (row.product.trackBatch && !row.batchNumber.trim())
        errors.batchNumber = 'Enter the batch number'
      if (trackExpiry(row.product) && !row.expiryDate)
        errors.expiryDate = 'Enter the expiry date'
      return errors
    },
    validateHeader: (h) => ({
      ...(h.supplierId ? {} : { supplierId: 'Choose the supplier' }),
      ...(h.date ? {} : { date: 'Pick the date' }),
    }),
    totals: (rows: ReceiptRow[], _ctx: EntryContext<ReceiptHeader>) => {
      const sum = (f: (r: ReceiptRow) => number) =>
        round2(rows.reduce((s, r) => s + f(r), 0))
      return [
        {
          key: 'subtotal',
          label: 'Subtotal',
          value: formatMoney(sum((r) => r.gross)),
        },
        {
          key: 'discount',
          label: 'Discount',
          value: formatMoney(sum((r) => r.discountAmount)),
        },
        {
          key: 'tax',
          label: 'Tax',
          value: formatMoney(sum((r) => r.taxAmount)),
        },
        {
          key: 'grand',
          label: 'Grand Total',
          value: formatMoney(sum((r) => r.netAmount)),
          emphasis: true,
        },
      ]
    },
    scan: { behavior: 'increment' },
  }
}

/** Row → API line. */
export const rowToLine = (row: ReceiptRow): MaterialReceiptLine => ({
  productId: row.product!.productId,
  variantId: row.product!.variantId || null,
  quantity: row.quantity,
  unit: row.unit,
  rate: row.rate ?? null,
  discountPercent: row.discountPercent ?? 0,
  taxPercent: row.taxPercent ?? 0,
  batchNumber: row.batchNumber,
  expiryDate: row.expiryDate || null,
  serials: row.serials?.length ? row.serials : undefined,
  location: row.location,
  notes: row.notes,
})

/** Stored voucher → editor rows (products re-linked to the live catalog). */
export function receiptToRows(
  voucher: MaterialReceipt,
  products: ProductSource
): Omit<ReceiptRow, 'id'>[] {
  return voucher.lines.map((line) => {
    const product = (line.variantId && products.getByKey?.(line.variantId)) ||
      products.getByKey?.(line.productId) || {
        key: line.variantId || line.productId,
        productId: line.productId,
        variantId: line.variantId ?? null,
        name: line.productName || '',
        unit: line.unit,
      }
    return computeReceiptLine({
      ...blankReceiptRow(),
      id: '',
      product,
      productType: line.productType ?? null,
      quantity: line.quantity,
      unit: line.unit,
      rate: line.rate,
      discountPercent: line.discountPercent ?? null,
      taxPercent: line.taxPercent ?? null,
      batchNumber: line.batchNumber || '',
      expiryDate: line.expiryDate ? String(line.expiryDate).slice(0, 10) : null,
      serials: line.serials || [],
      location: line.location || '',
      notes: line.notes || '',
    })
  })
}

/** Only manufacturing inputs in search; a scanned/typed code still resolves (and is flagged). */
export function receivableSource(source: ProductSource): ProductSource {
  const allowed = (p: EntryProduct) => isReceivable(raw(p)?.productType ?? null)
  return {
    ...source,
    search: (query, limit) => {
      const out = source.search(query, limit * 3)
      return Array.isArray(out)
        ? out.filter(allowed).slice(0, limit)
        : out.then((list) => list.filter(allowed).slice(0, limit))
    },
  }
}

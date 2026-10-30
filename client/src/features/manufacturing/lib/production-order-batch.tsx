import type {
  Bom,
  ManufacturingCatalogProduct,
  OrderBatchLine,
  ProductionPriority,
} from '@/stores/manufacturing.api'
import type {
  EntryProduct,
  EntryRowBase,
  HeaderField,
  ProductSource,
  TransactionConfig,
} from '@/components/transaction-engine'
import { PRODUCT_TYPE_META, fmtQty } from './constants'

/*
 * Several production orders from one entry grid (like an invoice): one row per product,
 * the header's dates / priority / operator / team / locations as defaults a row may
 * override. The server re-checks everything and creates all orders in one transaction
 * (services/manufacturing/productionOrderBatch.service.js).
 */

export type BatchRow = EntryRowBase & {
  bomId: string | null
  priority: ProductionPriority | ''
  plannedStartDate: string | null
  plannedCompletionDate: string | null
  notes: string
  /** Finished-goods batch number; blank = auto. */
  batchNumber: string
}

export type BatchHeader = {
  plannedStartDate: string
  plannedCompletionDate: string
  priority: ProductionPriority
  operatorId: string | null
  teamMemberIds: string[]
  sourceLocation: string
  wipLocation: string
  finishedGoodsLocation: string
  notes: string
}

export const productOf = (p: EntryProduct | null | undefined) =>
  (p?.raw as ManufacturingCatalogProduct | undefined) ?? null

export const blankBatchRow = (): Omit<BatchRow, 'id'> => ({
  product: null,
  quantity: null,
  unit: undefined,
  bomId: null,
  priority: '',
  plannedStartDate: null,
  plannedCompletionDate: null,
  notes: '',
  batchNumber: '',
})

/** Browse order of the buildable types; anything else (sub-assemblies) comes after. */
const BROWSE_RANK: Record<string, number> = { finished_good: 0, by_product: 1 }

/** Manufacturing products → engine products (searched in memory). */
export function buildableSource(list: ManufacturingCatalogProduct[]): ProductSource & {
  products: EntryProduct[]
} {
  const products: EntryProduct[] = list.map((p) => ({
    key: p.id,
    productId: p.id,
    variantId: null,
    name: p.name,
    subtitle: [
      p.sku,
      p.productType ? PRODUCT_TYPE_META[p.productType]?.label : null,
      p.defaultBomId ? null : 'No BOM',
    ]
      .filter(Boolean)
      .join(' · '),
    code: p.barcode || p.sku,
    unit: p.unit,
    cost: p.cost,
    price: p.price,
    stock: p.stockQuantity,
    imageUrl: p.image?.url,
    raw: p,
  }))
  const norm = (s: string) => s.toLowerCase()
  return {
    products,
    search: (query, limit) => {
      const q = norm(query.trim())
      // Browsing (nothing typed): finished goods first, then by-products, then
      // sub-assemblies.
      const rank = (p: EntryProduct) =>
        q ? 0 : (BROWSE_RANK[productOf(p)?.productType ?? ''] ?? 2)
      const scored = products
        .map((p) => {
          const name = norm(p.name)
          const code = norm(p.code || '')
          const score = !q
            ? 1
            : code === q
              ? 100
              : name.startsWith(q)
                ? 50
                : name.includes(q) || code.includes(q)
                  ? 10
                  : 0
          return { p, score }
        })
        .filter((x) => x.score > 0)
        .sort(
          (a, b) =>
            b.score - a.score ||
            rank(a.p) - rank(b.p) ||
            a.p.name.localeCompare(b.p.name)
        )
      return scored.slice(0, limit).map((x) => x.p)
    },
    lookupCode: (code) => {
      const c = norm(code.trim())
      return products.find((p) => p.code && norm(p.code) === c) || null
    },
    lookupName: (name) =>
      products.find((p) => norm(p.name) === norm(name.trim())) || null,
    getByKey: (key) => products.find((p) => p.key === key) || null,
  }
}

const bomLabel = (b: Bom) =>
  `${b.bomNumber} v${b.version}${b.isDefault ? ' (default)' : ''}`

export function createBatchConfig(opts: {
  headerFields: HeaderField<BatchHeader>[]
  bomsByProduct: Map<string, Bom[]>
  requireBom: boolean
  /** The header a fresh list starts with (settings, last used values, today's dates). */
  defaults: () => Partial<BatchHeader>
}): TransactionConfig<BatchRow, BatchHeader> {
  const bomsOf = (row: BatchRow) =>
    row.product ? opts.bomsByProduct.get(row.product.productId) || [] : []
  return {
    id: 'production-order-batch',
    noun: 'Production orders',
    maxRows: 100,
    initialHeader: () => ({
      plannedStartDate: '',
      plannedCompletionDate: '',
      operatorId: null,
      teamMemberIds: [],
      priority: 'normal',
      sourceLocation: '',
      wipLocation: '',
      finishedGoodsLocation: '',
      notes: '',
      ...opts.defaults(),
    }),
    headerFields: opts.headerFields,
    createRow: blankBatchRow,
    keepBlankRow: true,
    // Invoice-style rows: product, its BOM, how many and the stock on hand.
    // Priority and dates come from the header for every row.
    columns: [
      {
        key: 'product',
        label: 'Product',
        kind: 'product',
        width: 'minmax(16rem, 3fr)',
        wide: true,
        openOnFocus: true,
        richResults: true,
        placeholder: 'Select a finished good…',
      },
      {
        key: 'bomId',
        label: 'Bill of materials',
        kind: 'select',
        width: 'minmax(10rem, 1.3fr)',
        placeholder: 'No BOM',
        skipOnEnter: true,
        editable: (row) => bomsOf(row).length > 0,
        options: (row) =>
          bomsOf(row).map((b) => ({ value: b.id, label: bomLabel(b) })),
      },
      {
        key: 'quantity',
        label: 'Qty',
        kind: 'quantity',
        decimals: 3,
        width: '10.5rem',
        align: 'left',
        stepper: true,
      },
      {
        // Finished-goods batch number; blank = numbered on save (Settings → batch).
        key: 'batchNumber',
        label: 'Batch No.',
        kind: 'text',
        width: '8.5rem',
        placeholder: 'Auto',
        skipOnEnter: true,
      },
      {
        key: 'stock',
        label: 'In stock',
        kind: 'computed',
        width: '5.5rem',
        render: (row) =>
          row.product ? (
            <span
              className={
                (row.product.stock ?? 0) <= 0
                  ? 'text-rose-600 dark:text-rose-400'
                  : 'text-muted-foreground'
              }
            >
              {fmtQty(row.product.stock ?? 0)}
            </span>
          ) : (
            ''
          ),
      },
    ],
    applyProduct: (row, product) => {
      const boms = opts.bomsByProduct.get(product.productId) || []
      const def = productOf(product)?.defaultBomId
      const bomId =
        (def && boms.some((b) => b.id === def) ? def : null) ||
        boms.find((b) => b.isDefault)?.id ||
        boms[0]?.id ||
        null
      // A new product starts at one batch of its BOM (or 1), selected in the Qty cell
      // so typing replaces it and Enter accepts it.
      const batch = boms.find((b) => b.id === bomId)?.quantity
      return {
        ...row,
        product,
        unit: product.unit,
        bomId,
        quantity:
          row.product?.key === product.key
            ? row.quantity
            : batch && batch > 0
              ? batch
              : 1,
      }
    },
    validateRow: (row) => {
      const errors: Record<string, string> = {}
      if (!row.product) {
        errors.product = 'Pick the product to make'
        return errors
      }
      if (!((row.quantity || 0) > 0))
        errors.quantity = 'Enter a quantity above 0'
      if (opts.requireBom && !bomsOf(row).length)
        errors.bomId = 'No active BOM — create one first'
      return errors
    },
    validateHeader: (h) => {
      const errors: Partial<Record<string, string>> = {}
      if (!h.plannedStartDate)
        errors.plannedStartDate = 'Pick the planned start'
      if (!h.plannedCompletionDate)
        errors.plannedCompletionDate = 'Pick the planned completion'
      else if (
        h.plannedStartDate &&
        h.plannedCompletionDate < h.plannedStartDate
      )
        errors.plannedCompletionDate =
          'Planned completion cannot be before the planned start'
      return errors
    },
    scan: { behavior: 'new-row' },
  }
}

/** Row → API line ('' = use the header's value). */
export const rowToBatchLine = (row: BatchRow): OrderBatchLine => ({
  productId: row.product?.productId || null,
  variantId: row.product?.variantId || null,
  bomId: row.bomId || null,
  plannedQuantity: row.quantity,
  priority: row.priority || null,
  plannedStartDate: row.plannedStartDate || null,
  plannedCompletionDate: row.plannedCompletionDate || null,
  notes: row.notes || undefined,
  batchNumber: row.batchNumber?.trim() || undefined,
})

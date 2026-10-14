import type { ReactNode } from 'react'
import type {
  IssueVoucherLine,
  PendingMaterial,
  PendingOrderNeed,
  RequirementLine,
} from '@/stores/manufacturing.api'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import type {
  EntryBatch,
  EntryProduct,
  EntryRowBase,
  HeaderField,
  ProductSource,
  StockSource,
  TransactionConfig,
} from '@/components/transaction-engine'
import { fmtQty } from './constants'

/*
 * MIV — Material Issue Voucher: the entry-grid configuration for the transaction engine.
 * Rows are the production order's material lines (or their listed alternatives). The
 * server re-checks everything (services/manufacturing/materialIssueVoucher.service.js);
 * the status column here mirrors its rules so problems show while typing.
 */

/** What a product in this voucher's search stands for: one material line of the order. */
export interface OrderMaterialRef {
  materialLineId: string
  alternativeProductId: string | null
  /** Physical units of the alternative that replace one unit of the line. */
  ratio: number
  line: RequirementLine
  catalog?: PurchaseCatalogItem
}

export type IssueRow = EntryRowBase & {
  /** mode 'material': the open orders that still need it (queue order), and the one chosen. */
  pendingOrders: PendingOrderNeed[] | null
  orderId: string | null
  materialLineId: string | null
  alternativeProductId: string | null
  ratio: number
  required: number
  available: number
  reserved: number
  issued: number
  remaining: number
  isOptional: boolean
}

/**
 * What the voucher issues for: 'product' — a finished good and how many to make (posting
 * creates and releases its production order); 'order' — an order that is already open.
 */
export type IssueMode = 'product' | 'order' | 'material'

/** A material some open order still needs (mode 'material'). */
export type PendingRef = { kind: 'pending'; material: PendingMaterial }

export const pendingOf = (p: EntryProduct | null | undefined) => {
  const raw = p?.raw as PendingRef | undefined
  return raw?.kind === 'pending' ? raw.material : null
}

export type IssueHeader = {
  mode: IssueMode
  voucherNumber: string
  date: string
  /** mode 'product': the finished good, its BOM version and how many to make. */
  productId: string | null
  productName: string
  productUnit: string
  bomId: string | null
  produceQuantity: number | null
  /** mode 'order': issue for this many units of output (empty = everything still open). */
  issueForQuantity: number | null
  productionOrderId: string | null
  sourceLocation: string
  wipLocation: string
  branch: string
  requestedById: string | null
  issuedById: string | null
  reference: string
  notes: string
  /** Editing a posted voucher: why (kept in its history). */
  editNote: string
}

const round = (n: number) => Math.round(n * 1e6) / 1e6
/** The material line behind a product — null for anything else (e.g. a finished good). */
export const refOf = (p: EntryProduct | null | undefined) => {
  const raw = p?.raw as OrderMaterialRef | undefined
  return raw && raw.materialLineId ? raw : null
}

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const isExpiredDate = (date?: string | null) =>
  !!date && String(date).slice(0, 10) < todayIso()

/** Batches of the product in a row (from the catalog record behind it). */
export const batchesOf = (p: EntryProduct | null | undefined): EntryBatch[] =>
  (refOf(p)?.catalog?.batches || [])
    .filter((b) => b.quantity > 0)
    .map((b) => ({
      id: b.id,
      batchNumber: b.batchNumber,
      quantity: b.quantity,
      expiryDate: b.expiryDate ?? null,
      cost: b.costPerUnit ?? null,
    }))

/** Suggested issue: what's still needed, capped at what's on hand ("Issue Available"). */
export const suggestedQty = (
  row: Pick<IssueRow, 'remaining' | 'available' | 'ratio'>
) => Math.max(0, round(Math.min(row.remaining * row.ratio, row.available)))

export const blankIssueRow = (): Omit<IssueRow, 'id'> => ({
  pendingOrders: null,
  orderId: null,
  product: null,
  quantity: null,
  unit: undefined,
  batchId: null,
  batchNumber: null,
  serials: [],
  materialLineId: null,
  alternativeProductId: null,
  ratio: 1,
  required: 0,
  available: 0,
  reserved: 0,
  issued: 0,
  remaining: 0,
  isOptional: false,
})

/** The order's material lines (+ alternatives) as engine products, matched to the catalog. */
export function orderMaterialProducts(
  lines: RequirementLine[],
  catalog: ProductSource
): EntryProduct[] {
  const out: EntryProduct[] = []
  lines.forEach((line) => {
    if (!line.materialLineId) return
    const entries: {
      productId: string
      variantId?: string | null
      alt: string | null
      ratio: number
      name: string
    }[] = [
      {
        productId: line.productId,
        variantId: line.variantId,
        alt: null,
        ratio: 1,
        name: line.productName,
      },
      ...(line.alternatives || []).map((a) => ({
        productId: a.productId,
        variantId: a.variantId,
        alt: a.productId,
        ratio: a.ratio || 1,
        name: a.productName || 'Alternative',
      })),
    ]
    entries.forEach((e) => {
      const live =
        (e.variantId && catalog.getByKey?.(e.variantId)) ||
        catalog.getByKey?.(e.productId) ||
        null
      const ref: OrderMaterialRef = {
        materialLineId: line.materialLineId!,
        alternativeProductId: e.alt,
        ratio: e.ratio,
        line,
        catalog: (live?.raw as PurchaseCatalogItem) || undefined,
      }
      out.push({
        key: `${line.materialLineId}:${e.alt || ''}`,
        productId: e.productId,
        variantId: e.variantId ?? null,
        name: live?.name || e.name,
        subtitle: [
          // What this voucher still has to issue of it, first — that's why it's listed.
          !e.alt && (line.outstandingQuantity ?? line.requiredQuantity) > 0
            ? `Needs ${fmtQty(line.outstandingQuantity ?? line.requiredQuantity)} ${line.unit}`
            : null,
          e.alt
            ? `Alternative for ${line.productName}${e.ratio !== 1 ? ` (×${e.ratio})` : ''}`
            : line.isOptional
              ? 'Optional'
              : null,
          live?.code,
        ]
          .filter(Boolean)
          .join(' · '),
        code: live?.code,
        unit: live?.unit || line.unit,
        cost: live?.cost ?? null,
        stock: live?.stock ?? line.availableQuantity,
        trackBatch: !!live?.trackBatch,
        trackSerial: !!live?.trackSerial,
        imageUrl: live?.imageUrl,
        raw: ref,
      })
    })
  })
  return out
}

/** Search limited to this order's materials. */
export function orderMaterialSource(products: EntryProduct[]): ProductSource {
  const norm = (s: string) => s.toLowerCase()
  return {
    search: (query, limit) => {
      const q = norm(query.trim())
      return products
        .filter(
          (p) =>
            !q ||
            norm(p.name).includes(q) ||
            norm(p.code || '').includes(q) ||
            norm(p.subtitle || '').includes(q)
        )
        .slice(0, limit)
    },
    lookupCode: (code) => {
      const c = norm(code.trim())
      return (
        products.find(
          (p) => p.code && norm(p.code) === c && !refOf(p)?.alternativeProductId
        ) ||
        products.find((p) => p.code && norm(p.code) === c) ||
        null
      )
    },
    lookupName: (name) =>
      products.find((p) => norm(p.name) === norm(name.trim())) || null,
    getByKey: (key) => products.find((p) => p.key === key) || null,
  }
}

/** Batches / serials: from the catalog record behind each material. */
export function orderStockSource(base: StockSource): StockSource {
  return { ...base, getBatches: (product) => batchesOf(product) }
}

/** A material product → a filled row (quantities from the order's requirement line). */
export function rowFromProduct<T extends IssueRow>(
  row: T,
  product: EntryProduct,
  quantity?: number | null
): T {
  const ref = refOf(product)
  if (!ref) return { ...row, product }
  const { line } = ref
  const alt = !!ref.alternativeProductId
  const available = alt
    ? Number(ref.catalog?.stockQuantity ?? product.stock ?? 0)
    : line.availableQuantity
  const base = {
    ...row,
    product,
    unit: product.unit,
    materialLineId: ref.materialLineId,
    alternativeProductId: ref.alternativeProductId,
    ratio: ref.ratio,
    required: line.requiredQuantity,
    available,
    reserved: alt ? 0 : line.reservedQuantity || 0,
    issued: line.issuedQuantity || 0,
    remaining: line.outstandingQuantity || 0,
    isOptional: !!line.isOptional,
    batchId: null,
    batchNumber: null,
    serials: [],
  }
  const q =
    quantity !== undefined
      ? quantity
      : product.trackSerial
        ? null
        : suggestedQty(base) || null
  return { ...base, quantity: q }
}

/** Still to issue: of the chosen order (mode 'material'), else of the row's line(s). */
export const remainingOf = (row: IssueRow) =>
  row.pendingOrders && row.orderId
    ? (row.pendingOrders.find((o) => o.orderId === row.orderId)?.outstanding ??
      0)
    : row.remaining

/**
 * Where a by-material row's quantity goes — the server's rule: queue order, each order up
 * to what it needs, any excess to the first.
 */
export function allocationOf(
  row: IssueRow
): { order: PendingOrderNeed; quantity: number }[] {
  const orders = (row.pendingOrders || []).filter(
    (o) => !row.orderId || o.orderId === row.orderId
  )
  let left = row.quantity || 0
  const parts: { order: PendingOrderNeed; quantity: number }[] = []
  orders.forEach((order) => {
    if (left <= 1e-9) return
    const quantity = round(Math.min(left, order.outstanding))
    if (quantity > 0) parts.push({ order, quantity })
    left = round(left - quantity)
  })
  if (left > 1e-9 && orders.length) {
    if (parts[0]?.order === orders[0])
      parts[0].quantity = round(parts[0].quantity + left)
    else parts.unshift({ order: orders[0], quantity: round(left) })
  }
  return parts
}

/** A pending material → a filled row: what's needed, capped at stock on hand. */
export function rowFromPending<T extends IssueRow>(
  row: T,
  product: EntryProduct,
  material: PendingMaterial
): T {
  return {
    ...row,
    product,
    unit: product.unit,
    pendingOrders: material.orders,
    orderId: null,
    materialLineId: null,
    alternativeProductId: null,
    ratio: 1,
    required: material.outstanding,
    available: material.available,
    reserved: 0,
    issued: 0,
    remaining: material.outstanding,
    isOptional: false,
    batchId: null,
    batchNumber: null,
    serials: [],
    quantity:
      Math.max(0, round(Math.min(material.outstanding, material.available))) ||
      null,
  }
}

/** Pending materials as grid products (photo, what's needed, stock). */
export function pendingProducts(materials: PendingMaterial[]): EntryProduct[] {
  return materials.map((m) => ({
    key: `pending:${m.productId}:${m.variantId || ''}`,
    productId: m.productId,
    variantId: m.variantId,
    name: m.productName,
    subtitle: [
      `Needs ${fmtQty(m.outstanding)} ${m.unit}`,
      `${m.orders.length} order${m.orders.length === 1 ? '' : 's'}`,
      m.sku || null,
    ]
      .filter(Boolean)
      .join(' · '),
    code: m.sku || undefined,
    unit: m.unit,
    cost: null,
    stock: m.available,
    trackBatch: false,
    trackSerial: false,
    imageUrl: m.imageUrl || undefined,
    raw: { kind: 'pending', material: m } satisfies PendingRef,
  }))
}

export type RowStatus = {
  tone: 'ok' | 'warn' | 'error' | 'muted'
  text: string
}

/** The same rules as the server check, for the status column and the summary. */
export function rowStatus(row: IssueRow): RowStatus {
  if (!row.product) return { tone: 'muted', text: '' }
  if (!row.materialLineId && !row.pendingOrders)
    return { tone: 'error', text: 'Not on this order' }
  const qty = row.product.trackSerial
    ? row.serials?.length || 0
    : row.quantity || 0
  if (!(qty > 0))
    return row.remaining > 0 && row.available <= 0
      ? { tone: 'error', text: 'Out of stock' }
      : { tone: 'muted', text: 'Not issued' }
  const batch = row.batchId
    ? batchesOf(row.product).find((b) => b.id === row.batchId)
    : null
  if (batch && batch.quantity < qty)
    return { tone: 'error', text: `Batch has ${fmtQty(batch.quantity)}` }
  if (qty > row.available + 1e-9)
    return { tone: 'error', text: `Short ${fmtQty(qty - row.available)}` }
  // Capped at what's on hand while more is needed: postable, but the floor will be short.
  const needed = remainingOf(row) * (row.ratio || 1)
  if (
    !row.alternativeProductId &&
    needed > row.available + 1e-9 &&
    qty >= row.available - 1e-9
  )
    return {
      tone: 'warn',
      text: `Stock short ${fmtQty(needed - row.available)}`,
    }
  if (batch && isExpiredDate(batch.expiryDate))
    return { tone: 'warn', text: 'Expired batch' }
  const credited = qty / (row.ratio || 1)
  if (credited > remainingOf(row) + 1e-9)
    return {
      tone: 'warn',
      text: `Over by ${fmtQty(credited - remainingOf(row))}`,
    }
  if (row.product.trackBatch && !row.batchId)
    return { tone: 'ok', text: 'FEFO' }
  return { tone: 'ok', text: 'OK' }
}

export const toneClass: Record<RowStatus['tone'], string> = {
  ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  warn: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  error: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300',
  muted: 'border-border text-muted-foreground',
}

const issueQty = (r: IssueRow) =>
  r.product?.trackSerial ? r.serials?.length || 0 : r.quantity || 0

/** Rows that will actually be posted (a quantity, or serials). */
export const rowsToIssue = (rows: IssueRow[]) =>
  rows.filter((r) => r.product && issueQty(r) > 0)

export function createIssueConfig(opts: {
  /** Read whenever the entry starts afresh (Save & New), so it keeps the chosen mode. */
  initialMode: () => IssueMode
  headerFields: HeaderField<IssueHeader>[]
  defaultSourceLocation: string
  defaultWipLocation: string
  formatMoney: (n: number) => string
  renderStatus: (row: IssueRow) => ReactNode
  /** The product cell's prompt and empty-list message (they depend on the mode). */
  productPlaceholder?: string
  productEmptyText?: string
}): TransactionConfig<IssueRow, IssueHeader> {
  const num = (key: keyof IssueRow, label: string, width = '5.25rem') => ({
    key: key as string,
    label,
    kind: 'computed' as const,
    width,
    render: (row: IssueRow) => (row.product ? fmtQty(row[key] as number) : ''),
  })
  return {
    id: 'material-issue',
    noun: 'Material issue',
    maxRows: 500,
    initialHeader: () => ({
      mode: opts.initialMode(),
      voucherNumber: '',
      date: todayIso(),
      productId: null,
      productName: '',
      productUnit: '',
      bomId: null,
      produceQuantity: null,
      issueForQuantity: null,
      productionOrderId: null,
      sourceLocation: opts.defaultSourceLocation,
      wipLocation: opts.defaultWipLocation,
      branch: '',
      requestedById: null,
      issuedById: null,
      reference: '',
      notes: '',
      editNote: '',
    }),
    headerFields: opts.headerFields,
    createRow: blankIssueRow,
    columns: [
      {
        key: 'product',
        label: 'Product',
        kind: 'product',
        width: 'minmax(14rem, 3fr)',
        wide: true,
        // Invoice-style: the list opens on focus, with photos and colour-coded stock.
        openOnFocus: true,
        richResults: true,
        placeholder: opts.productPlaceholder,
        emptyText: opts.productEmptyText,
      },
      num('required', 'Required'),
      {
        key: 'available',
        label: 'Available',
        kind: 'computed',
        width: '5.25rem',
        render: (row) =>
          row.product ? (
            <span
              className={
                row.available < suggestedQty({ ...row, available: Infinity })
                  ? 'font-medium text-rose-600 dark:text-rose-400'
                  : undefined
              }
            >
              {fmtQty(row.available)}
            </span>
          ) : (
            ''
          ),
      },
      // A new order has nothing reserved or issued yet.
      {
        ...num('reserved', 'Reserved'),
        visible: ({ header }) => header.mode === 'order',
      },
      {
        ...num('issued', 'Issued'),
        visible: ({ header }) => header.mode === 'order',
      },
      {
        ...num('remaining', 'Remaining'),
        visible: ({ header }) => header.mode === 'order',
      },
      {
        key: 'quantity',
        label: 'Issue Qty',
        kind: 'quantity',
        decimals: 3,
        min: 0,
        // − / + to step a line up or down; the unit shows after the field.
        stepper: true,
        width: '10.5rem',
        // A serial item's quantity is how many serials are picked.
        editable: (row) => !row.product?.trackSerial,
      },
      {
        key: 'orderId',
        label: 'Goes To',
        kind: 'select',
        width: 'minmax(12rem, 1.6fr)',
        visible: ({ header }) => header.mode === 'material',
        skipOnEnter: true,
        options: (row) => {
          const auto = allocationOf({ ...row, orderId: null })
          return [
            {
              value: '',
              label: auto.length
                ? `Auto · ${auto.map((a) => `${a.order.orderNumber} ×${fmtQty(a.quantity)}`).join(', ')}`
                : 'Auto — oldest order first',
            },
            ...(row.pendingOrders || []).map((o) => ({
              value: o.orderId,
              label: `${o.orderNumber} · ${o.productName} · needs ${fmtQty(o.outstanding)}`,
            })),
          ]
        },
        editable: (row) => !!row.pendingOrders?.length,
      },
      {
        key: 'batchId',
        label: 'Batch',
        visible: ({ header }) => header.mode !== 'material',
        kind: 'batch',
        width: 'minmax(7.5rem, 1.2fr)',
        placeholder: 'Auto (FEFO)',
        skipOnEnter: true,
        editable: (row) => !!row.product?.trackBatch,
      },
      {
        key: 'serials',
        label: 'Serial',
        visible: ({ header }) => header.mode !== 'material',
        kind: 'serial',
        serialMode: 'pick',
        width: 'minmax(6.5rem, 1fr)',
        editable: (row) => !!row.product?.trackSerial,
      },
      {
        key: 'status',
        label: 'Status',
        kind: 'computed',
        width: '7rem',
        render: opts.renderStatus,
      },
    ],
    applyProduct: (row, product) => {
      const pending = pendingOf(product)
      return pending
        ? rowFromPending(row, product, pending)
        : rowFromProduct(row, product)
    },
    computeRow: (row) =>
      row.product?.trackSerial
        ? { ...row, quantity: row.serials?.length || null }
        : row,
    validateRow: (row) => {
      const errors: Record<string, string> = {}
      if (!row.product) {
        errors.product = 'Pick a material of this order'
        return errors
      }
      if (!row.materialLineId && !row.pendingOrders)
        errors.product = 'Not a material of this order'
      if (row.quantity !== null && row.quantity < 0)
        errors.quantity = 'Quantity cannot be negative'
      const batch = row.batchId
        ? batchesOf(row.product).find((b) => b.id === row.batchId)
        : null
      if (batch && (row.quantity || 0) > batch.quantity)
        errors.batchId = `Batch ${batch.batchNumber} has only ${fmtQty(batch.quantity)}`
      return errors
    },
    validateHeader: (h) => ({
      ...(h.mode === 'product'
        ? {
            ...(h.productId ? {} : { productId: 'Choose the finished good' }),
            ...((h.produceQuantity || 0) > 0
              ? {}
              : { produceQuantity: 'Enter how many to make' }),
          }
        : h.mode === 'material' || h.productionOrderId
          ? {}
          : { productionOrderId: 'Choose the production order' }),
      ...(h.sourceLocation.trim()
        ? {}
        : { sourceLocation: 'Choose the source warehouse' }),
      ...(h.wipLocation.trim()
        ? {}
        : { wipLocation: 'Choose the WIP location' }),
      ...(h.sourceLocation.trim() &&
      h.sourceLocation.trim().toLowerCase() ===
        h.wipLocation.trim().toLowerCase()
        ? { wipLocation: 'Must differ from the source warehouse' }
        : {}),
      ...(h.date ? {} : { date: 'Pick the date' }),
    }),
    totals: (rows) => {
      const issuing = rowsToIssue(rows)
      const short = rows.filter(
        (r) => r.product && r.remaining * r.ratio > r.available + 1e-9
      ).length
      const cost = issuing.reduce(
        (s, r) => s + issueQty(r) * Number(r.product?.cost || 0),
        0
      )
      return [
        { key: 'issuing', label: 'Lines to issue', value: issuing.length },
        {
          key: 'short',
          label: 'Shortages',
          value: (
            <span
              className={short ? 'text-rose-600 dark:text-rose-400' : undefined}
            >
              {short}
            </span>
          ),
        },
        {
          key: 'cost',
          label: 'Est. cost',
          value: opts.formatMoney(cost),
          emphasis: true,
        },
      ]
    },
    scan: { behavior: 'increment' },
  }
}

/** The same config with every row cell read-only (a locked voucher being edited). */
export const lockRows = (
  config: TransactionConfig<IssueRow, IssueHeader>
): TransactionConfig<IssueRow, IssueHeader> => ({
  ...config,
  columns: config.columns.map((c) =>
    c.kind === 'computed' ? c : { ...c, editable: () => false }
  ),
})

/** Row → API line. */
export const rowToLine = (row: IssueRow): IssueVoucherLine => ({
  materialLineId: row.materialLineId!,
  productId: refOf(row.product)?.line.productId ?? null,
  alternativeProductId: row.alternativeProductId,
  quantity: row.product?.trackSerial ? row.serials?.length || 0 : row.quantity,
  batchId: row.batchId || null,
  serialNumbers: row.serials?.length ? row.serials : undefined,
})

/** Requirement lines → rows ("Issue Available": what's needed, capped at stock). */
export function requirementRows(
  lines: RequirementLine[],
  products: EntryProduct[]
): Omit<IssueRow, 'id'>[] {
  return lines
    .filter((l) => (l.outstandingQuantity || 0) > 0)
    .map((l) => {
      const product = products.find((p) => p.key === `${l.materialLineId}:`)
      return product
        ? rowFromProduct({ ...blankIssueRow(), id: '' } as IssueRow, product)
        : null
    })
    .filter((r): r is IssueRow => !!r)
    .map(({ id: _id, ...r }) => r)
}

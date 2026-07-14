/**
 * Client-side POS draft storage — survives refresh, browser close, and crashes.
 * Manual "hold" queues named drafts; workspace autosave backs up the active form.
 */

const STORAGE_V = 1

const KEY_SALE_WS = `workshop_pos_sale_workspace_v${STORAGE_V}`
const KEY_SALE_HELD = `workshop_pos_sale_held_v${STORAGE_V}`
const KEY_PURCHASE_WS = `workshop_pos_purchase_workspace_v${STORAGE_V}`
const KEY_PURCHASE_HELD = `workshop_pos_purchase_held_v${STORAGE_V}`
const KEY_FASTBILL_WS = `workshop_pos_fastbill_workspace_v${STORAGE_V}`
const KEY_FASTBILL_HELD = `workshop_pos_fastbill_held_v${STORAGE_V}`

export const POS_HOLD_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000
export const POS_HOLD_MAX_QUEUE = 25

export type SaleWorkspaceSnapshot = {
  invoice: Record<string, unknown>
  taxRate: number
  showImages: boolean
  showProductCost: boolean
  searchTerm: string
  showProductCatalog: boolean
  updatedAt: number
}

export type SaleHeldRecord = {
  id: string
  label: string
  savedAt: number
  snapshot: Omit<SaleWorkspaceSnapshot, 'updatedAt'>
}

export type PurchaseWorkspaceSnapshot = {
  purchase: Record<string, unknown>
  showImages: boolean
  searchTerm: string
  showProductCatalog: boolean
  updatedAt: number
}

export type PurchaseHeldRecord = {
  id: string
  label: string
  savedAt: number
  snapshot: Omit<PurchaseWorkspaceSnapshot, 'updatedAt'>
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota / private mode */
  }
}

function removeKey(key: string) {
  try {
    localStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}

// ── Sale workspace (autosave) ─────────────────────────────────────────────

export function loadSaleWorkspace(): SaleWorkspaceSnapshot | null {
  return readJson<SaleWorkspaceSnapshot>(KEY_SALE_WS)
}

export function saveSaleWorkspace(snapshot: Omit<SaleWorkspaceSnapshot, 'updatedAt'> & { updatedAt?: number }) {
  const full: SaleWorkspaceSnapshot = {
    ...snapshot,
    updatedAt: snapshot.updatedAt ?? Date.now(),
  }
  writeJson(KEY_SALE_WS, full)
}

export function clearSaleWorkspace() {
  removeKey(KEY_SALE_WS)
}

// ── Sale held queue ────────────────────────────────────────────────────────

export function listSaleHeld(): SaleHeldRecord[] {
  return readJson<SaleHeldRecord[]>(KEY_SALE_HELD) ?? []
}

export function pushSaleHeld(record: SaleHeldRecord) {
  const list = [record, ...listSaleHeld()].slice(0, POS_HOLD_MAX_QUEUE)
  writeJson(KEY_SALE_HELD, list)
}

export function removeSaleHeld(id: string) {
  const next = listSaleHeld().filter((r) => r.id !== id)
  writeJson(KEY_SALE_HELD, next)
}

// ── Purchase workspace ──────────────────────────────────────────────────────

export function loadPurchaseWorkspace(): PurchaseWorkspaceSnapshot | null {
  return readJson<PurchaseWorkspaceSnapshot>(KEY_PURCHASE_WS)
}

export function savePurchaseWorkspace(
  snapshot: Omit<PurchaseWorkspaceSnapshot, 'updatedAt'> & { updatedAt?: number },
) {
  const full: PurchaseWorkspaceSnapshot = {
    ...snapshot,
    updatedAt: snapshot.updatedAt ?? Date.now(),
  }
  writeJson(KEY_PURCHASE_WS, full)
}

export function clearPurchaseWorkspace() {
  removeKey(KEY_PURCHASE_WS)
}

export function listPurchaseHeld(): PurchaseHeldRecord[] {
  return readJson<PurchaseHeldRecord[]>(KEY_PURCHASE_HELD) ?? []
}

export function pushPurchaseHeld(record: PurchaseHeldRecord) {
  const list = [record, ...listPurchaseHeld()].slice(0, POS_HOLD_MAX_QUEUE)
  writeJson(KEY_PURCHASE_HELD, list)
}

export function removePurchaseHeld(id: string) {
  const next = listPurchaseHeld().filter((r) => r.id !== id)
  writeJson(KEY_PURCHASE_HELD, next)
}

// ── Fast Billing workspace (autosave) ───────────────────────────────────────

export type FastBillWorkspaceSnapshot = {
  cart: Record<string, unknown>[]
  customerId: string | null
  customerName: string
  paymentMethod: string
  discount: number
  paidAmount: number
  updatedAt: number
}

export type FastBillHeldRecord = {
  id: string
  label: string
  savedAt: number
  snapshot: Omit<FastBillWorkspaceSnapshot, 'updatedAt'>
}

export function loadFastBillWorkspace(): FastBillWorkspaceSnapshot | null {
  return readJson<FastBillWorkspaceSnapshot>(KEY_FASTBILL_WS)
}

export function saveFastBillWorkspace(
  snapshot: Omit<FastBillWorkspaceSnapshot, 'updatedAt'> & { updatedAt?: number },
) {
  const full: FastBillWorkspaceSnapshot = {
    ...snapshot,
    updatedAt: snapshot.updatedAt ?? Date.now(),
  }
  writeJson(KEY_FASTBILL_WS, full)
}

export function clearFastBillWorkspace() {
  removeKey(KEY_FASTBILL_WS)
}

export function listFastBillHeld(): FastBillHeldRecord[] {
  return readJson<FastBillHeldRecord[]>(KEY_FASTBILL_HELD) ?? []
}

export function pushFastBillHeld(record: FastBillHeldRecord) {
  const list = [record, ...listFastBillHeld()].slice(0, POS_HOLD_MAX_QUEUE)
  writeJson(KEY_FASTBILL_HELD, list)
}

export function removeFastBillHeld(id: string) {
  const next = listFastBillHeld().filter((r) => r.id !== id)
  writeJson(KEY_FASTBILL_HELD, next)
}

export function newHoldId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `hold-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** True when there are no real line items (empty manual row only = empty) */
export function isSaleDraftSnapshotEmpty(inv: Record<string, unknown>): boolean {
  const items = inv.items as Array<{ productId?: string; name?: string }> | undefined
  if (!items?.length) return true
  return !items.some((it) => {
    if (it.productId && String(it.productId).trim()) return true
    if (it.name?.trim()) return true
    return false
  })
}

export function isPurchaseDraftSnapshotEmpty(p: Record<string, unknown>): boolean {
  const items = p.items as Array<{ product?: { name?: string; _id?: string; id?: string } }> | undefined
  if (!items?.length) return true
  return !items.some((it) => {
    const pid = it.product?.id || it.product?._id
    if (pid && String(pid).trim()) return true
    if (it.product?.name?.trim()) return true
    return false
  })
}

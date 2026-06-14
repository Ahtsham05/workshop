import { isApiUnreachable, isNetworkError } from '@/lib/auth-cache'
import { getElectronAPI, isElectronApp } from '@/lib/sync/electron'
import { matchesBilingualSearch } from '@/utils/urdu-text-utils'

type PaginatedParams = {
  page?: number | string
  limit?: number | string
  sortBy?: string
  search?: string
  fieldName?: string
}

type PaginatedResult = {
  results: Record<string, unknown>[]
  page: number
  limit: number
  totalPages: number
  totalResults: number
  offline?: boolean
}

function isOfflineContext(): boolean {
  return typeof navigator !== 'undefined' && !navigator.onLine
}

export async function withOfflineCatalogFallback<T>(
  onlineFetch: () => Promise<T>,
  offlineFetch: () => Promise<T>,
): Promise<T> {
  if (!isElectronApp()) {
    return onlineFetch()
  }

  if (isOfflineContext()) {
    return offlineFetch()
  }

  try {
    return await onlineFetch()
  } catch (error) {
    if (isNetworkError(error) || isApiUnreachable(error)) {
      return offlineFetch()
    }
    throw error
  }
}

function sortItems(items: Record<string, unknown>[], sortBy?: string): Record<string, unknown>[] {
  if (!sortBy) return items

  const [field, direction = 'desc'] = sortBy.split(':')
  const factor = direction === 'asc' ? 1 : -1

  return [...items].sort((a, b) => {
    const left = a[field]
    const right = b[field]
    if (left == null && right == null) return 0
    if (left == null) return 1
    if (right == null) return -1
    if (left === right) return 0
    return left > right ? factor : -factor
  })
}

function filterBySearch(
  items: Record<string, unknown>[],
  search?: string,
  fieldName?: string,
): Record<string, unknown>[] {
  const query = search?.trim()
  if (!query) return items

  const fields = (fieldName || 'name,nameUrdu,phone,barcode')
    .split(',')
    .map((field) => field.trim())
    .filter(Boolean)

  return items.filter((item) =>
    matchesBilingualSearch(query, ...fields.map((field) => item[field] as string | undefined)),
  )
}

function paginateLocal(items: Record<string, unknown>[], params: PaginatedParams = {}): PaginatedResult {
  const page = Math.max(1, Number(params.page) || 1)
  const limit = Math.max(1, Number(params.limit) || 50)
  const sorted = sortItems(items, params.sortBy)
  const filtered = filterBySearch(sorted, params.search, params.fieldName)
  const totalResults = filtered.length
  const totalPages = Math.max(1, Math.ceil(totalResults / limit))
  const start = (page - 1) * limit

  return {
    results: filtered.slice(start, start + limit),
    page,
    limit,
    totalPages,
    totalResults,
    offline: true,
  }
}

async function readLocalRecords(
  loader?: () => Promise<Record<string, unknown>[]>,
  normalize?: (rows: Record<string, unknown>[]) => Record<string, unknown>[],
): Promise<Record<string, unknown>[]> {
  if (!loader) return []
  try {
    const rows = await loader()
    return normalize ? normalize(rows) : rows
  } catch {
    return []
  }
}

function normalizeLocalProductRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    ...row,
    name: row.name || row.nameUrdu || 'Unnamed product',
    price: Number(row.price ?? row.salePrice ?? 0),
    cost: Number(row.cost ?? row.purchasePrice ?? 0),
    stockQuantity: Number(row.stockQuantity ?? row.stock ?? 0),
  }))
}

function normalizeLocalCategoryRows(rows: Record<string, unknown>[]) {
  return rows.map((row) => ({
    ...row,
    name: row.name || row.nameUrdu || 'Unnamed category',
  }))
}

export async function getLocalCustomersPage(params: PaginatedParams = {}) {
  const electron = getElectronAPI()
  const rows = await readLocalRecords(() => electron?.db.customers() ?? Promise.resolve([]))
  return paginateLocal(rows, params)
}

export async function getLocalProductsPage(params: PaginatedParams = {}) {
  const electron = getElectronAPI()
  const rows = await readLocalRecords(
    () => electron?.db.products() ?? Promise.resolve([]),
    normalizeLocalProductRows,
  )
  return paginateLocal(rows, params)
}

export async function getLocalCategoriesPage(params: PaginatedParams = {}) {
  const electron = getElectronAPI()
  const rows = await readLocalRecords(
    () => electron?.db.categories?.() ?? Promise.resolve([]),
    normalizeLocalCategoryRows,
  )
  return paginateLocal(rows, params)
}

export async function getAllLocalCustomers() {
  const electron = getElectronAPI()
  return readLocalRecords(() => electron?.db.customers() ?? Promise.resolve([]))
}

export async function getAllLocalProducts() {
  const electron = getElectronAPI()
  return readLocalRecords(
    () => electron?.db.products() ?? Promise.resolve([]),
    normalizeLocalProductRows,
  )
}

export async function getAllLocalCategories() {
  const electron = getElectronAPI()
  return readLocalRecords(
    () => electron?.db.categories?.() ?? Promise.resolve([]),
    normalizeLocalCategoryRows,
  )
}

export async function getLocalSuppliersPage(params: PaginatedParams = {}) {
  const electron = getElectronAPI()
  const rows = await readLocalRecords(() => electron?.db.suppliers?.() ?? Promise.resolve([]))
  return paginateLocal(rows, params)
}

export async function getAllLocalSuppliers() {
  const electron = getElectronAPI()
  return readLocalRecords(() => electron?.db.suppliers?.() ?? Promise.resolve([]))
}

/**
 * Multi-entry transaction engine — one fast, keyboard-first entry grid for every
 * transaction screen (purchases, sales, returns, receipts, issues, transfers, scrap,
 * adjustments, opening stock). See README.md for the configuration guide.
 */
export {
  TransactionEntry,
  type TransactionEntryProps,
  type SaveResult,
} from './transaction-entry'
export {
  useCatalogProductSource,
  useCatalogStockSource,
  catalogItemToProduct,
} from './sources'
export { createEntryStore, type EntryStore, type EntryState } from './store'
export {
  parsePasted,
  parseNumber,
  buildProductIndex,
  rankProducts,
} from './search'
export type * from './types'
export {
  allocationFields,
  allocationTotal,
  daysToExpiry,
  fefoOrder,
  isExpiredBatch,
  planFefo,
  planFrom,
  refitAllocations,
  sameAllocations,
  type BatchPlan,
} from './batch-allocation'

/**
 * Server errors shaped `{ errorCode: 'ROW_ERRORS', details: { rows: [{ line, field, message }] } }`
 * (line = 1-based position among the saved rows) → the engine's per-row errors.
 */
export function rowErrorsFromApi(
  err: unknown,
  rows: { id: string }[],
  fieldMap: Record<string, string> = {}
): Record<string, Record<string, string>> | null {
  const data = (
    err as {
      data?: {
        errorCode?: string
        details?: { rows?: { line: number; field: string; message: string }[] }
      }
    }
  )?.data
  if (data?.errorCode !== 'ROW_ERRORS' || !data.details?.rows?.length)
    return null
  const out: Record<string, Record<string, string>> = {}
  data.details.rows.forEach(({ line, field, message }) => {
    const row = rows[line - 1]
    if (!row) return
    const key = fieldMap[field] || field
    out[row.id] = {
      ...out[row.id],
      [key]: out[row.id]?.[key] ? `${out[row.id][key]} · ${message}` : message,
    }
  })
  return Object.keys(out).length ? out : null
}

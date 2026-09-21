import type * as XLSX from 'xlsx'
import {
  parseNumeric,
  parseText,
  parseSheet,
  pickBestSheet,
  readWorkbook,
  summarizeSheets,
  type ImportFieldSpec,
  type ParsedSheet,
  type SheetSummary,
} from '@/lib/excel-import'
import type { StructuredRow } from '@/stores/priceUpdate.api'
import type { ListType } from '@/lib/price-update-rules'

/**
 * Spreadsheet price lists, read with the same engine every other import in the app uses (header
 * row anywhere, "Dealer Price" / "MRP" style headings, the right sheet picked automatically).
 *
 * A generic "Price" / "Rate" column in a SUPPLIER's file is the supplier's selling price — which
 * is our cost — so those headings map to cost. Only explicit retail wording maps to selling price.
 */
export const PRICE_LIST_FIELDS: ImportFieldSpec[] = [
  { key: 'name', label: 'Product name', type: 'text', required: true, aliases: ['Name', 'Product', 'Item', 'Item Name', 'Description', 'Model', 'Particulars', 'Article', 'Title', 'نام'] },
  { key: 'code', label: 'Barcode / SKU', type: 'code', aliases: ['Barcode', 'SKU', 'Code', 'Item Code', 'Product Code', 'Part No', 'Model No', 'Bar Code'] },
  {
    key: 'cost',
    label: 'Cost (dealer price)',
    type: 'number',
    aliases: ['Cost', 'Cost Price', 'Dealer', 'Dealer Price', 'DP', 'Wholesale', 'Wholesale Price', 'Trade', 'Trade Price', 'TP', 'Purchase Price', 'Buy Price', 'Net', 'Net Price', 'Price', 'Rate', 'Amount', 'قیمت'],
  },
  {
    key: 'price',
    label: 'Selling price (retail)',
    type: 'number',
    aliases: ['Retail', 'Retail Price', 'MRP', 'RP', 'Sale Price', 'Selling Price', 'Sale', 'SP', 'Market Price', 'Consumer Price', 'Shop Price'],
  },
]

// Short on purpose: these fill a narrow dropdown next to each column heading.
export const FIELD_CHOICES: Array<{ value: string; label: string }> = [
  { value: 'name', label: 'Product name' },
  { value: 'code', label: 'Barcode / SKU' },
  { value: 'cost', label: 'Cost price' },
  { value: 'price', label: 'Selling price' },
]

export interface LoadedSpreadsheet {
  fileName: string
  workbook: XLSX.WorkBook
  sheets: SheetSummary[]
}

export async function loadSpreadsheet(file: File): Promise<LoadedSpreadsheet> {
  const workbook = await readWorkbook(file)
  const sheets = summarizeSheets(workbook, PRICE_LIST_FIELDS)
  return { fileName: file.name, workbook, sheets }
}

export function bestSheetName(loaded: LoadedSpreadsheet): string | null {
  return pickBestSheet(loaded.sheets)
}

export function parsePriceSheet(loaded: LoadedSpreadsheet, sheetName: string, overrides?: Record<number, string | null>): ParsedSheet {
  return parseSheet(loaded.workbook, sheetName, PRICE_LIST_FIELDS, overrides)
}

export interface SheetRows {
  rows: StructuredRow[]
  /** What the list's numbers mean, judged from which columns were found. */
  listType: ListType
  hasName: boolean
  hasPrice: boolean
}

/** Mapped sheet → structured rows. Numbers are tagged cost/price by their column, not by position. */
export function sheetToRows(parsed: ParsedSheet): SheetRows {
  const fields = new Set(parsed.columns.map((c) => c.field).filter(Boolean) as string[])
  const hasCost = fields.has('cost')
  const hasPrice = fields.has('price')
  const rows: StructuredRow[] = []

  parsed.rows.forEach((row) => {
    const name = parseText(row.values.name ?? null)
    if (!name) return
    const values: StructuredRow['values'] = []
    const cost = parseNumeric(row.values.cost ?? null)
    const price = parseNumeric(row.values.price ?? null)
    if (cost.ok && !cost.empty && typeof cost.value === 'number' && cost.value > 0) values.push({ value: cost.value, kind: 'cost' })
    if (price.ok && !price.empty && typeof price.value === 'number' && price.value > 0) values.push({ value: price.value, kind: 'price' })
    if (!values.length) return
    const code = parseText(row.values.code ?? null, { code: true })
    rows.push({ name, code: code || undefined, line: row.excelRow, raw: name, values })
  })

  return {
    rows,
    listType: hasCost && hasPrice ? 'cost_price' : hasPrice ? 'price' : 'cost',
    hasName: fields.has('name'),
    hasPrice: hasCost || hasPrice,
  }
}

/**
 * Spreadsheet import engine — shared by every "Import from Excel" dialog
 * (products, customers, suppliers, brands, categories, sub-categories).
 *
 * Why this exists: each dialog used to call `XLSX.utils.sheet_to_json(ws)` directly and
 * read `row.name` / `row.price` off the result. That only works when the uploaded file
 * is byte-for-byte shaped like the downloaded template — the header must be the very
 * first row and each header cell must match the internal field name exactly. Real files
 * people upload almost never are:
 *
 *   - a shop name / "Price List 2026" title row sits above the header, so sheet_to_json
 *     uses the TITLE row as the keys and every field comes back undefined;
 *   - headers are written the human way — "Product Name", "Sale Price", "Qty", "Mobile #",
 *     "قیمت" — none of which equal `name` / `price` / `stockQuantity`;
 *   - the data is on the second sheet, the first one holding notes or nothing at all;
 *   - numbers arrive as "Rs 1,250.50", "(500)", "2,999/-", or in Urdu/Arabic digits;
 *   - the file ends with a "Total" row, or has blank spacer rows in the middle.
 *
 * Every one of those surfaced to the user as a wall of "<field> is required" validation
 * errors with no way forward. This module handles all of them: it locates the header row
 * wherever it is, matches header text to fields through an alias table (accent-, case-,
 * space- and punctuation-insensitive), picks the sheet that actually holds data, and
 * coerces messy cells into clean values — while exposing the column mapping it chose so
 * the UI can show it and let the user correct it.
 */

import * as XLSX from 'xlsx'

export type CellValue = string | number | boolean | Date | null

/** How a field's cells should be coerced. `code` is text that must survive Excel's
 *  number formatting intact — barcodes, SKUs, phone numbers. */
export type ImportFieldType = 'text' | 'code' | 'number' | 'integer' | 'boolean' | 'date'

export interface ImportFieldSpec {
  /** Canonical name used by the rest of the app (and sent to the API). */
  key: string
  /** Human label shown in the column-mapping UI and in the generated template. */
  label: string
  /** Extra header spellings that should map to this field, in any language. */
  aliases?: string[]
  type?: ImportFieldType
  /** Only affects how the mapping is scored/labelled — row validation lives in the
   *  feature's own row builder, which can give a far better message than "required". */
  required?: boolean
  /** Sample value used by the generated template. */
  sample?: string | number
  /** Column width (characters) in the generated template. */
  width?: number
}

export interface ColumnMapping {
  /** 0-based column index within the sheet's used range. */
  column: number
  /** Spreadsheet column letter (A, B, ... ) for display. */
  letter: string
  /** Header text exactly as it appears in the file. */
  header: string
  /** Field this column feeds, or null when the column is ignored. */
  field: string | null
  /** True when the mapping was guessed positionally because no header row was found. */
  positional?: boolean
}

export interface ParsedRow {
  /** 1-based row number as shown in Excel, so error messages point at the real row. */
  excelRow: number
  /** Mapped cells, keyed by field. Columns not present in the file are absent. */
  values: Record<string, CellValue>
}

export interface ParsedSheet {
  sheetName: string
  /** 1-based Excel row the header was found on, or null when none was detected. */
  headerRow: number | null
  columns: ColumnMapping[]
  rows: ParsedRow[]
  /** Headers present in the file that don't correspond to any known field. */
  unmappedHeaders: string[]
  /** Fields marked `required` that no column feeds. */
  missingFields: ImportFieldSpec[]
  /** Rows skipped as blank, repeated headers, or "Total" footers. */
  skippedRowCount: number
}

export interface SheetSummary {
  name: string
  /** Rows of data below the detected header (blank rows excluded). */
  rowCount: number
  /** How well this sheet's header matches the expected fields — used to auto-select. */
  score: number
}

/** A file the engine could read but that can't be imported, with a message written for
 *  the person holding the file rather than for a developer. */
export class SpreadsheetError extends Error {}

// ─── Header matching ─────────────────────────────────────────────────────────

/**
 * Reduces a header cell to a comparison key: case-folded, accent-stripped, with every
 * separator and punctuation mark removed. "Sale Price", "sale_price", "SALE-PRICE" and
 * "Sale price:" all collapse to "saleprice", so an alias table only needs one entry per
 * genuinely different wording instead of one per spelling.
 */
export function normalizeHeader(raw: unknown): string {
  if (raw === null || raw === undefined) return ''
  return String(raw)
    .normalize('NFKD')
    .replace(/[\u0300-\u036F]/g, '') // combining accents
    .replace(/[\uFEFF\u200B-\u200F\u202A-\u202E]/g, '') // BOM + bidi marks
    .toLowerCase()
    .replace(/\(.*?\)/g, '') // "price (required)" → "price"
    .replace(/[^\p{L}\p{N}]/gu, '')
    .trim()
}

/** alias key → field key. Later fields never overwrite an earlier field's alias, so the
 *  order fields are declared in decides who wins an ambiguous header. */
function buildAliasIndex(fields: ImportFieldSpec[]): Map<string, string> {
  const index = new Map<string, string>()
  fields.forEach((field) => {
    const candidates = [field.key, field.label, ...(field.aliases || [])]
    candidates.forEach((candidate) => {
      const normalized = normalizeHeader(candidate)
      if (normalized && !index.has(normalized)) index.set(normalized, field.key)
    })
  })
  return index
}

/**
 * Aliases every entity shares — contact details, names, money columns. Feature specs
 * add their own on top. Kept here so a fix for one dialog ("Mobile No" should map to
 * phone) is a fix for all of them.
 */
export const COMMON_ALIASES: Record<string, string[]> = {
  name: ['Name', 'Full Name', 'Title', 'Party Name', 'Account Name', 'Naam', 'نام'],
  nameUrdu: ['Name Urdu', 'Urdu Name', 'Urdu', 'اردو نام', 'نام اردو'],
  email: ['Email', 'E-mail', 'Email Address', 'Mail', 'ای میل'],
  phone: ['Phone', 'Phone No', 'Phone Number', 'Mobile', 'Mobile No', 'Mobile Number', 'Contact', 'Contact No', 'Cell', 'Cell No', 'Tel', 'Telephone', 'Number', 'فون', 'موبائل'],
  whatsapp: ['WhatsApp', 'Whatsapp No', 'WhatsApp Number', 'WA', 'واٹس ایپ'],
  address: ['Address', 'Location', 'City', 'Street', 'پتہ', 'ایڈریس'],
  balance: ['Balance', 'Opening Balance', 'Previous Balance', 'Old Balance', 'Due', 'Amount', 'Udhaar', 'Udhar', 'Baqaya', 'بیلنس', 'بقایا'],
  description: ['Description', 'Details', 'Notes', 'Remarks', 'تفصیل'],
}

/** Convenience: attach the shared aliases for `key` to a field spec's own list. */
export function withCommonAliases(field: ImportFieldSpec): ImportFieldSpec {
  const shared = COMMON_ALIASES[field.key]
  if (!shared) return field
  return { ...field, aliases: [...(field.aliases || []), ...shared] }
}

// ─── Value coercion ──────────────────────────────────────────────────────────

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g

/** "۱۲۳" / "١٢٣" → "123". Urdu and Arabic keyboards produce these routinely. */
function normalizeDigits(input: string): string {
  return input.replace(ARABIC_INDIC_DIGITS, (char) => {
    const code = char.charCodeAt(0)
    return String(code >= 0x06f0 ? code - 0x06f0 : code - 0x0660)
  })
}

/**
 * Renders a number the way it was typed rather than the way JS prints it: a 13-digit
 * barcode read as a number must come back as "8901234567890", never "8.90123456789e+12".
 */
export function numberToPlainString(value: number): string {
  if (!Number.isFinite(value)) return ''
  if (Number.isInteger(value) && Math.abs(value) >= 1e21) return BigInt(value).toString()
  const text = String(value)
  if (!text.includes('e') && !text.includes('E')) return text
  // Small magnitudes only reach exponential form below 1e-7; 20 decimals covers it.
  return value.toFixed(20).replace(/0+$/, '').replace(/\.$/, '')
}

export interface NumericResult {
  /** Cell held no value at all — distinct from "held something unusable". */
  empty: boolean
  ok: boolean
  value: number
  /** What was in the cell, for the error message. */
  raw: string
}

/**
 * Parses a number out of whatever the cell actually contains: currency prefixes,
 * thousands separators in either the 1,250.50 or the 1.250,50 convention, accounting
 * negatives in parentheses, the local "2,999/-" suffix, stray non-breaking spaces, and
 * Urdu/Arabic digits. Returns a flag instead of throwing so one unusable cell becomes
 * one skipped row rather than a failed import.
 */
export function parseNumeric(input: CellValue): NumericResult {
  if (input === null || input === undefined || input === '') {
    return { empty: true, ok: true, value: 0, raw: '' }
  }
  if (typeof input === 'number') {
    return { empty: false, ok: Number.isFinite(input), value: input, raw: numberToPlainString(input) }
  }
  if (typeof input === 'boolean' || input instanceof Date) {
    return { empty: false, ok: false, value: 0, raw: String(input) }
  }

  const raw = String(input).trim()
  if (raw === '') return { empty: true, ok: true, value: 0, raw: '' }

  let text = normalizeDigits(raw)
    .replace(/[\u00A0\u202F\u2007\s]/g, '')
    .replace(/\u066B/g, '.') // Arabic decimal separator
    .replace(/\u066C/g, ',') // Arabic thousands separator

  // Accounting negatives: (500) and -500. A trailing "-" or "/-" is the local
  // "rupees only" suffix, not a sign, so it's stripped rather than negated.
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text)
  text = text.replace(/^\(|\)$/g, '').replace(/^[-+]/, '').replace(/\/?-$/, '')
  text = text.replace(/[^0-9.,]/g, '')

  if (text === '' || text === '.' || text === ',') {
    return { empty: false, ok: false, value: 0, raw }
  }

  const lastComma = text.lastIndexOf(',')
  const lastDot = text.lastIndexOf('.')
  if (lastComma !== -1 && lastDot !== -1) {
    // Whichever separator comes last is the decimal point; the other groups thousands.
    const decimalSep = lastComma > lastDot ? ',' : '.'
    const groupSep = decimalSep === ',' ? '.' : ','
    text = text.split(groupSep).join('')
    const parts = text.split(decimalSep)
    text = `${parts.slice(0, -1).join('')}.${parts[parts.length - 1]}`
  } else if (lastComma !== -1) {
    const groups = text.split(',')
    // "1,250" and "12,345,678" group thousands; "12,5" is a decimal comma.
    const isThousands = groups.length > 2 || groups[groups.length - 1].length === 3
    text = isThousands ? groups.join('') : `${groups.slice(0, -1).join('')}.${groups[groups.length - 1]}`
  } else if (lastDot !== -1) {
    const groups = text.split('.')
    if (groups.length > 2) text = groups.join('') // 1.250.000
  }

  const value = Number(text)
  if (!Number.isFinite(value)) return { empty: false, ok: false, value: 0, raw }
  return { empty: false, ok: true, value: negative ? -value : value, raw }
}

/** Trimmed text, with Excel's formatting artefacts removed. */
export function parseText(input: CellValue, options: { code?: boolean } = {}): string {
  if (input === null || input === undefined) return ''
  if (typeof input === 'number') return numberToPlainString(input)
  if (typeof input === 'boolean') return input ? 'true' : 'false'
  if (input instanceof Date) return formatDateCell(input)
  let text = String(input).replace(/[\uFEFF\u200B]/g, '').trim()
  // Excel marks "treat this number as text" with a leading apostrophe, which some
  // exports leave in the value itself. It's never part of a real code.
  if (options.code) text = text.replace(/^'+/, '').trim()
  return text
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', '1', 'on', 'haan', 'ہاں', 'جی'])
const FALSE_WORDS = new Set(['false', 'no', 'n', '0', 'off', 'nahi', 'نہیں'])

export function parseBoolean(input: CellValue): { empty: boolean; ok: boolean; value: boolean } {
  if (input === null || input === undefined || input === '') return { empty: true, ok: true, value: false }
  if (typeof input === 'boolean') return { empty: false, ok: true, value: input }
  if (typeof input === 'number') return { empty: false, ok: true, value: input !== 0 }
  const text = normalizeDigits(String(input)).trim().toLowerCase()
  if (TRUE_WORDS.has(text)) return { empty: false, ok: true, value: true }
  if (FALSE_WORDS.has(text)) return { empty: false, ok: true, value: false }
  return { empty: false, ok: false, value: false }
}

function formatDateCell(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Accepts a real date cell, an Excel serial number, or text in the formats people
 * actually type (2026-09-16, 16/09/2026, 16-09-2026, 09/16/2026). Day-first is assumed
 * for ambiguous slash dates, matching the region this app is used in.
 */
export function parseDate(input: CellValue): { empty: boolean; ok: boolean; value: Date | null } {
  if (input === null || input === undefined || input === '') return { empty: true, ok: true, value: null }
  if (input instanceof Date) return { empty: false, ok: !Number.isNaN(input.getTime()), value: input }
  if (typeof input === 'number') {
    // Excel serial: days since 1899-12-30 (the 1900 leap-year bug is baked into that epoch).
    const parsed = new Date(Math.round((input - 25569) * 86400 * 1000))
    return { empty: false, ok: !Number.isNaN(parsed.getTime()), value: parsed }
  }
  const text = normalizeDigits(String(input)).trim()
  if (!text) return { empty: true, ok: true, value: null }

  const iso = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (iso) {
    const parsed = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]))
    return { empty: false, ok: !Number.isNaN(parsed.getTime()), value: parsed }
  }
  const dmy = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (dmy) {
    const [, first, second, yearText] = dmy
    let day = Number(first)
    let month = Number(second)
    // 09/16/2026 can only be month-first — fall back to it when day-first is impossible.
    if (day > 12 && month <= 12) {
      /* already day-first */
    } else if (month > 12 && day <= 12) {
      ;[day, month] = [month, day]
    }
    const year = yearText.length === 2 ? 2000 + Number(yearText) : Number(yearText)
    const parsed = new Date(year, month - 1, day)
    return { empty: false, ok: !Number.isNaN(parsed.getTime()), value: parsed }
  }
  const parsed = new Date(text)
  return { empty: false, ok: !Number.isNaN(parsed.getTime()), value: Number.isNaN(parsed.getTime()) ? null : parsed }
}

// ─── Reading the file ────────────────────────────────────────────────────────

const ACCEPTED_EXTENSIONS = ['.xlsx', '.xlsm', '.xlsb', '.xls', '.csv', '.txt', '.ods']

/** What the file input should advertise — kept next to the list it's validated against. */
export const IMPORT_FILE_ACCEPT = ACCEPTED_EXTENSIONS.join(',')

/** Extension check, case-insensitive — ".XLSX" off a phone or an email attachment is a
 *  perfectly good workbook and used to be rejected as an invalid file type. */
export function isSupportedSpreadsheet(file: File): boolean {
  const name = file.name.toLowerCase()
  return ACCEPTED_EXTENSIONS.some((extension) => name.endsWith(extension))
}

/** 25 MB — comfortably above any real product list, below the point where parsing in
 *  the browser tab becomes a freeze the user reads as a crash. */
const MAX_FILE_BYTES = 25 * 1024 * 1024

export async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  if (!isSupportedSpreadsheet(file)) {
    throw new SpreadsheetError(
      `"${file.name}" isn't a spreadsheet this app can read. Save it as .xlsx or .csv and try again.`
    )
  }
  if (file.size === 0) {
    throw new SpreadsheetError(`"${file.name}" is empty — there's nothing in the file to import.`)
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new SpreadsheetError(
      `"${file.name}" is larger than 25 MB. Split it into smaller files, or remove images and extra sheets, then try again.`
    )
  }

  let buffer: ArrayBuffer
  try {
    buffer = await file.arrayBuffer()
  } catch {
    throw new SpreadsheetError('The file could not be read. If it is open in Excel, close it and try again.')
  }

  try {
    // codepage 65001 (UTF-8) keeps Urdu/Arabic text in CSVs from being read through a
    // legacy codepage and turned into mojibake. cellDates gives real Date objects
    // instead of serial numbers.
    return XLSX.read(buffer, { type: 'array', codepage: 65001, cellDates: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/password|encrypt/i.test(message)) {
      throw new SpreadsheetError('This file is password protected. Remove the password in Excel, save it, and upload again.')
    }
    throw new SpreadsheetError(
      `"${file.name}" could not be opened. Open it in Excel and use File → Save As → Excel Workbook (.xlsx), then try again.`
    )
  }
}

// ─── Sheet parsing ───────────────────────────────────────────────────────────

/** Header rows sit within the first few rows of any real-world file; past this we'd
 *  start matching stray text inside the data itself. */
const HEADER_SEARCH_DEPTH = 25

function columnLetter(index: number): string {
  return XLSX.utils.encode_col(index)
}

function isBlankCell(value: CellValue): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

/** Sheet → array of rows, preserving the sheet's true first row so `excelRow` numbers
 *  match what the user sees in Excel even when the used range starts at, say, B7. */
function sheetToMatrix(sheet: XLSX.WorkSheet): { matrix: CellValue[][]; firstRow: number } {
  const ref = sheet['!ref']
  const firstRow = ref ? XLSX.utils.decode_range(ref).s.r : 0
  const matrix = XLSX.utils.sheet_to_json<CellValue[]>(sheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: true,
  })
  return { matrix, firstRow }
}

function scoreHeaderRow(row: CellValue[], aliasIndex: Map<string, string>, fields: ImportFieldSpec[]): number {
  const requiredKeys = new Set(fields.filter((field) => field.required).map((field) => field.key))
  const matched = new Set<string>()
  let score = 0
  row.forEach((cell) => {
    if (isBlankCell(cell)) return
    // A header cell is text. A row of numbers is data, however well it lines up.
    if (typeof cell === 'number' || cell instanceof Date) return
    const field = aliasIndex.get(normalizeHeader(cell))
    if (!field || matched.has(field)) return
    matched.add(field)
    score += requiredKeys.has(field) ? 3 : 1
  })
  return score
}

function detectHeaderRow(
  matrix: CellValue[][],
  aliasIndex: Map<string, string>,
  fields: ImportFieldSpec[]
): { index: number; score: number } {
  let best = { index: -1, score: 0 }
  const depth = Math.min(matrix.length, HEADER_SEARCH_DEPTH)
  for (let i = 0; i < depth; i += 1) {
    const row = matrix[i]
    if (!row || row.every(isBlankCell)) continue
    const score = scoreHeaderRow(row, aliasIndex, fields)
    if (score > best.score) best = { index: i, score }
  }
  return best
}

/** Footer rows people add under their data — "Total", "Grand Total", "End". Importing
 *  them would either create a junk record or show up as a confusing failed row. */
function looksLikeSummaryRow(values: Record<string, CellValue>, fields: ImportFieldSpec[]): boolean {
  const nameField = fields.find((field) => field.key === 'name') || fields[0]
  if (!nameField) return false
  const label = parseText(values[nameField.key] ?? null).toLowerCase()
  if (!label) return false
  return /^(total|grand total|sub ?total|sum|end|میزان|کل)\b/.test(label)
}

/**
 * Turns one sheet into mapped rows. `overrides` lets the UI re-run the parse with the
 * user's own column choices (column index → field key, or null to ignore the column).
 */
export function parseSheet(
  workbook: XLSX.WorkBook,
  sheetName: string,
  fields: ImportFieldSpec[],
  overrides?: Record<number, string | null>
): ParsedSheet {
  const sheet = workbook.Sheets[sheetName]
  if (!sheet) throw new SpreadsheetError(`Sheet "${sheetName}" was not found in this file.`)

  const aliasIndex = buildAliasIndex(fields)
  const { matrix, firstRow } = sheetToMatrix(sheet)
  const detected = detectHeaderRow(matrix, aliasIndex, fields)

  const headerIndex = detected.index
  const headerCells: CellValue[] = headerIndex >= 0 ? matrix[headerIndex] || [] : []
  const width = matrix.reduce((max, row) => Math.max(max, row?.length || 0), headerCells.length)

  // No recognisable header: fall back to the template's column order. The mapping is
  // surfaced in the UI as a guess, so a wrong guess is one dropdown away from fixed
  // instead of an unexplained wall of "required" errors.
  const positional = headerIndex < 0

  const claimed = new Set<string>()
  const columns: ColumnMapping[] = []
  for (let column = 0; column < width; column += 1) {
    const headerText = positional ? '' : parseText(headerCells[column] ?? null)
    let field: string | null
    if (overrides && Object.prototype.hasOwnProperty.call(overrides, column)) {
      field = overrides[column]
    } else if (positional) {
      field = fields[column]?.key ?? null
    } else {
      field = aliasIndex.get(normalizeHeader(headerText)) ?? null
    }
    // Two columns feeding one field would have the second silently overwrite the first.
    if (field && claimed.has(field)) field = null
    if (field) claimed.add(field)
    columns.push({ column, letter: columnLetter(column), header: headerText, field, positional })
  }

  const mappedColumns = columns.filter((column) => column.field)
  const rows: ParsedRow[] = []
  let skippedRowCount = 0

  // Positional fallback: the file's own header row wasn't recognised, so the first row
  // may still BE a header (spelled in a way the alias table doesn't know). If a column
  // that must hold a number holds text there, it's a header, not data — skipping it
  // beats reporting "Sale price is not a number" on row 1 of every such file.
  let positionalHeaderRows = 0
  if (positional && matrix.length) {
    const firstRow = matrix[0] || []
    const numericMismatch = columns.some((column) => {
      if (!column.field) return false
      const spec = fields.find((field) => field.key === column.field)
      if (!spec || (spec.type !== 'number' && spec.type !== 'integer')) return false
      const cell = firstRow[column.column]
      if (isBlankCell(cell)) return false
      return !parseNumeric(cell).ok
    })
    if (numericMismatch) positionalHeaderRows = 1
  }

  const startIndex = positional ? positionalHeaderRows : headerIndex + 1
  for (let i = startIndex; i < matrix.length; i += 1) {
    const row = matrix[i] || []
    if (row.every(isBlankCell)) {
      skippedRowCount += 1
      continue
    }

    const values: Record<string, CellValue> = {}
    mappedColumns.forEach((column) => {
      values[column.field as string] = row[column.column] ?? null
    })

    // A header repeated mid-file (common when a long list is printed page by page).
    const repeatsHeader =
      !positional &&
      mappedColumns.length > 0 &&
      mappedColumns.every((column) => {
        const cell = row[column.column]
        return isBlankCell(cell) || normalizeHeader(cell as CellValue) === normalizeHeader(column.header)
      })
    if (repeatsHeader || looksLikeSummaryRow(values, fields)) {
      skippedRowCount += 1
      continue
    }

    if (mappedColumns.every((column) => isBlankCell(values[column.field as string]))) {
      skippedRowCount += 1
      continue
    }

    rows.push({ excelRow: firstRow + i + 1, values })
  }

  const unmappedHeaders = columns
    .filter((column) => !column.field && column.header)
    .map((column) => column.header)

  const missingFields = fields.filter(
    (field) => field.required && !columns.some((column) => column.field === field.key)
  )

  return {
    sheetName,
    headerRow: positional ? null : firstRow + headerIndex + 1,
    columns,
    rows,
    unmappedHeaders,
    missingFields,
    skippedRowCount,
  }
}

/**
 * Ranks the workbook's sheets so the dialog can open on the one that actually holds the
 * data — a template's "Instructions" or "Sheet3" first tab used to read as "the file is
 * empty".
 */
export function summarizeSheets(workbook: XLSX.WorkBook, fields: ImportFieldSpec[]): SheetSummary[] {
  const aliasIndex = buildAliasIndex(fields)
  return workbook.SheetNames.map((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) return { name, rowCount: 0, score: 0 }
    const { matrix } = sheetToMatrix(sheet)
    const detected = detectHeaderRow(matrix, aliasIndex, fields)
    const dataStart = detected.index >= 0 ? detected.index + 1 : 0
    const rowCount = matrix.slice(dataStart).filter((row) => row && !row.every(isBlankCell)).length
    return { name, rowCount, score: detected.score }
  })
}

/** The sheet the dialog should open on: best header match, then most rows. */
export function pickBestSheet(summaries: SheetSummary[]): string | null {
  const withData = summaries.filter((summary) => summary.rowCount > 0)
  const candidates = withData.length ? withData : summaries
  if (!candidates.length) return null
  return [...candidates].sort((a, b) => b.score - a.score || b.rowCount - a.rowCount)[0].name
}

// ─── Workbook output ─────────────────────────────────────────────────────────

function autoWidths(fields: ImportFieldSpec[]): XLSX.ColInfo[] {
  return fields.map((field) => ({ wch: field.width ?? Math.max(14, field.label.length + 4) }))
}

/**
 * Builds the download template from the same field specs the parser matches against, so
 * the template and the accepted headers can never drift apart. Required columns are
 * marked in the header text — `normalizeHeader` strips the "(required)" suffix, so the
 * file still re-imports cleanly if the user hands the template straight back.
 */
export function downloadTemplate(
  fields: ImportFieldSpec[],
  sampleRows: Record<string, string | number>[],
  fileName: string,
  sheetName: string
): void {
  const headers = fields.map((field) => (field.required ? `${field.label} (required)` : field.label))
  const rows = sampleRows.map((sample) => fields.map((field) => sample[field.key] ?? ''))
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  sheet['!cols'] = autoWidths(fields)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, sheetName)
  XLSX.writeFile(workbook, fileName)
}

export interface IssueReportRow {
  excelRow: number
  reason: string
  values: Record<string, CellValue>
}

/**
 * Exports the rows that didn't import, with the reason alongside the original values, so
 * a 4000-row file with 30 problems becomes a 30-row file to fix and re-upload instead of
 * a hunt through the original.
 */
export function downloadIssueReport(
  fields: ImportFieldSpec[],
  issues: IssueReportRow[],
  fileName: string
): void {
  const headers = ['Row', 'Problem', ...fields.map((field) => field.label)]
  const rows = issues.map((issue) => [
    issue.excelRow,
    issue.reason,
    ...fields.map((field) => {
      const value = issue.values[field.key]
      return value instanceof Date ? formatDateCell(value) : (value ?? '')
    }),
  ])
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows])
  sheet['!cols'] = [{ wch: 8 }, { wch: 60 }, ...autoWidths(fields)]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Rows to fix')
  XLSX.writeFile(workbook, fileName)
}

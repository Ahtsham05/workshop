import * as XLSX from 'xlsx'
import { nativeFieldLabel } from '@/lib/native-language'
import { withCommonAliases, type ImportFieldSpec } from '@/lib/excel-import'

/**
 * The customer spreadsheet layout, shared by Import Excel and Export Excel so an exported
 * file goes straight back in: edit Credit Limit / Payment Terms / Credit Hold in Excel,
 * then import with "Update their details" — a bulk edit without touching the app.
 * The server reads these columns in customer.service.js#bulkAddCustomers.
 */

export const PAYMENT_TERM_LABELS: Record<string, string> = {
  cash: 'Cash',
  due_on_receipt: 'Due on receipt',
  net_15: 'Net 15',
  net_30: 'Net 30',
  net_60: 'Net 60',
}

export const CUSTOMER_IMPORT_FIELDS: ImportFieldSpec[] = [
  withCommonAliases({
    key: 'name',
    label: 'Customer Name',
    required: true,
    width: 28,
    aliases: ['Customer', 'Client', 'Client Name', 'Buyer', 'گاہک'],
  }),
  withCommonAliases({ key: 'nameUrdu', label: nativeFieldLabel('Name'), width: 24 }),
  withCommonAliases({ key: 'phone', label: 'Phone', type: 'code', width: 18 }),
  withCommonAliases({ key: 'whatsapp', label: 'WhatsApp', type: 'code', width: 18 }),
  withCommonAliases({ key: 'email', label: 'Email', width: 28 }),
  withCommonAliases({ key: 'address', label: 'Address', width: 36 }),
  withCommonAliases({
    key: 'balance',
    label: 'Opening Balance',
    type: 'number',
    width: 16,
    aliases: ['Old Balance', 'Previous Balance', 'Udhaar', 'Udhar', 'Receivable'],
  }),
  { key: 'customerType', label: 'Customer Type', width: 16, aliases: ['Type', 'Category'] },
  {
    key: 'creditLimit',
    label: 'Credit Limit',
    type: 'number',
    width: 16,
    aliases: ['Limit', 'Max Credit', 'Credit', 'Udhaar Limit', 'Udhar Limit', 'Credit Line'],
  },
  {
    key: 'paymentTerms',
    label: 'Payment Terms',
    width: 16,
    aliases: ['Terms', 'Credit Days', 'Credit Period', 'Due Days', 'Payment Days'],
  },
  { key: 'creditHold', label: 'Credit Hold', width: 12, aliases: ['On Hold', 'Hold', 'Block Credit', 'Blocked'] },
  { key: 'creditHoldReason', label: 'Hold Reason', width: 26, aliases: ['Credit Hold Reason', 'Block Reason'] },
  { key: 'taxNumber', label: 'Tax Number', type: 'code', width: 18, aliases: ['NTN', 'GST No', 'Tax ID', 'Sales Tax No'] },
  withCommonAliases({ key: 'notes', label: 'Notes', width: 30 }),
]

export const CUSTOMER_SAMPLE_ROWS = [
  {
    name: 'Sample Customer 1',
    nameUrdu: 'سیمپل گاہک 1',
    phone: '+923001234567',
    whatsapp: '+923001234567',
    email: 'customer1@example.com',
    address: '123 Main Street, City',
    balance: 0,
    customerType: 'retail',
    creditLimit: 0,
    paymentTerms: 'Cash',
    creditHold: 'No',
    creditHoldReason: '',
    taxNumber: '',
    notes: '',
  },
  {
    name: 'Sample Customer 2',
    nameUrdu: '',
    phone: '03007654321',
    whatsapp: '',
    email: '',
    address: '456 Park Avenue, City',
    balance: 1500,
    customerType: 'wholesale',
    creditLimit: 50000,
    paymentTerms: 'Net 30',
    creditHold: 'No',
    creditHoldReason: '',
    taxNumber: '',
    notes: 'Pays at month end',
  },
]

/** Accepted spellings, mirrored from the server (creditControl.service.js#parsePaymentTerms). */
export function parsePaymentTermsText(raw: string): { empty?: boolean; value?: string; invalid?: boolean } {
  const text = raw.trim().toLowerCase()
  if (!text) return { empty: true }
  if (text in PAYMENT_TERM_LABELS) return { value: text }
  if (/^(cash|cod|cash only)$/.test(text)) return { value: 'cash' }
  if (/^(due on receipt|on receipt|receipt|immediate|0 ?days?|0)$/.test(text)) return { value: 'due_on_receipt' }
  const days = (text.match(/\d+/) || [])[0]
  if (days === '15') return { value: 'net_15' }
  if (days === '30') return { value: 'net_30' }
  if (days === '60') return { value: 'net_60' }
  return { invalid: true }
}

export function parseYesNoText(raw: string): boolean | undefined | null {
  const text = raw.trim().toLowerCase()
  if (!text) return undefined
  if (['yes', 'y', 'true', '1', 'on', 'hold', 'on hold', 'haan', 'ha'].includes(text)) return true
  if (['no', 'n', 'false', '0', 'off', 'release', 'nahi'].includes(text)) return false
  return null
}

export interface CustomerExportRow {
  id: string
  name: string
  nameUrdu: string
  phone: string
  whatsapp: string
  email: string
  address: string
  customerType: string
  taxNumber: string
  notes: string
  isActive: boolean
  balance: number
  creditLimit: number
  paymentTerms: string
  creditHold: boolean
  creditHoldReason: string
  temporaryLimit: number | null
  temporaryUntil: string | null
  creditUsed: number
  creditAvailable: number | null
  creditStatus: string
  overdueAmount: number
  overdueDays: number
}

const STATUS_LABELS: Record<string, string> = {
  ok: 'Within limit',
  near: 'Near limit',
  over: 'Over limit',
  hold: 'On hold',
  no_limit: 'No limit',
}

/**
 * Writes the customer workbook: the import columns first (editable, re-importable), then
 * live figures marked "(read only)" — the bracket is stripped by the importer's header
 * matcher, and none of those names is an import column, so they are simply ignored.
 */
export function downloadCustomersWorkbook(rows: CustomerExportRow[], fileName: string) {
  const editable = CUSTOMER_IMPORT_FIELDS.filter((field) => field.key !== 'balance')
  const readOnly: { label: string; width: number; get: (row: CustomerExportRow) => string | number }[] = [
    { label: 'Current Balance (read only)', width: 18, get: (r) => r.balance },
    { label: 'Credit Used (read only)', width: 18, get: (r) => r.creditUsed },
    { label: 'Credit Available (read only)', width: 20, get: (r) => (r.creditAvailable === null ? '' : r.creditAvailable) },
    { label: 'Credit Status (read only)', width: 18, get: (r) => STATUS_LABELS[r.creditStatus] || '' },
    { label: 'Temporary Limit (read only)', width: 20, get: (r) => r.temporaryLimit ?? '' },
    { label: 'Temporary Until (read only)', width: 20, get: (r) => (r.temporaryUntil ? r.temporaryUntil.slice(0, 10) : '') },
    { label: 'Overdue Amount (read only)', width: 20, get: (r) => r.overdueAmount || '' },
    { label: 'Days Overdue (read only)', width: 18, get: (r) => r.overdueDays || '' },
    { label: 'Active (read only)', width: 12, get: (r) => (r.isActive ? 'Yes' : 'No') },
  ]
  const cell = (row: CustomerExportRow, key: string): string | number => {
    switch (key) {
      case 'paymentTerms':
        return PAYMENT_TERM_LABELS[row.paymentTerms] || ''
      case 'creditHold':
        return row.creditHold ? 'Yes' : 'No'
      default:
        return (row as unknown as Record<string, string | number>)[key] ?? ''
    }
  }
  const headers = [...editable.map((field) => (field.required ? `${field.label} (required)` : field.label)), ...readOnly.map((c) => c.label)]
  const body = rows.map((row) => [...editable.map((field) => cell(row, field.key)), ...readOnly.map((c) => c.get(row))])
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...body])
  sheet['!cols'] = [...editable.map((field) => ({ wch: field.width ?? 16 })), ...readOnly.map((c) => ({ wch: c.width }))]
  sheet['!autofilter'] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(body.length, 1), c: headers.length - 1 } }) }
  sheet['!freeze'] = { xSplit: 1, ySplit: 1 }

  const help = XLSX.utils.aoa_to_sheet([
    ['How to bulk-edit customers with this file'],
    [''],
    ['1. Change Credit Limit, Payment Terms, Credit Hold (Yes/No), Hold Reason or contact details in the Customers sheet.'],
    ['2. In the app: Customers → Import Excel → choose this file.'],
    ['3. Under "If a customer is already saved" pick "Update their details". Customers are matched by phone, then email, then name.'],
    [''],
    ['Credit Limit: 0 = no limit (unlimited credit).'],
    ['Payment Terms: Cash, Due on receipt, Net 15, Net 30 or Net 60 (also "30 days", "30").'],
    ['Credit Hold: Yes = no new credit sales until released.'],
    ['Columns marked (read only) are live figures for your reference — they are ignored on import.'],
    ['Empty cells leave the saved value unchanged.'],
  ])
  help['!cols'] = [{ wch: 110 }]

  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, 'Customers')
  XLSX.utils.book_append_sheet(workbook, help, 'How to update')
  XLSX.writeFile(workbook, fileName)
}

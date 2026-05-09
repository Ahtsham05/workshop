/** When false, receipts show English names only (no Urdu subtitle lines). Labels still follow invoice language. */
export const INVOICE_PRINT_URDU_NAMES_KEY = 'invoicePrintIncludeUrduNames'

export function getInvoicePrintIncludeUrduNames(): boolean {
  try {
    return localStorage.getItem(INVOICE_PRINT_URDU_NAMES_KEY) !== 'false'
  } catch {
    return true
  }
}

export function setInvoicePrintIncludeUrduNames(value: boolean): void {
  try {
    if (value) localStorage.removeItem(INVOICE_PRINT_URDU_NAMES_KEY)
    else localStorage.setItem(INVOICE_PRINT_URDU_NAMES_KEY, 'false')
  } catch {
    /* ignore */
  }
}

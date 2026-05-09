/** Persisted preference: sales invoice receipt/A4 print uses Urdu labels + Urdu names when true. */
export const INVOICE_PRINT_IN_URDU_KEY = 'invoicePrintInUrdu'

export function getInvoicePrintInUrdu(): boolean {
  try {
    return localStorage.getItem(INVOICE_PRINT_IN_URDU_KEY) === 'true'
  } catch {
    return false
  }
}

export function setInvoicePrintInUrdu(value: boolean): void {
  try {
    localStorage.setItem(INVOICE_PRINT_IN_URDU_KEY, value ? 'true' : 'false')
  } catch {
    /* ignore */
  }
}

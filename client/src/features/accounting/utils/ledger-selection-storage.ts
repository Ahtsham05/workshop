// Remembers the last customer/supplier ledger a user drilled into so that
// navigating away (e.g. to Invoices) and back to the Accounts page reopens
// that ledger instead of resetting to the list. Session-scoped since it's a
// UI convenience, not data that should outlive the browser tab.
const CUSTOMER_KEY = 'accounting:selected-customer'
const SUPPLIER_KEY = 'accounting:selected-supplier'

function readEntity(key: string): any | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function writeEntity(key: string, value: any | null) {
  if (typeof window === 'undefined') return
  try {
    if (value) sessionStorage.setItem(key, JSON.stringify(value))
    else sessionStorage.removeItem(key)
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

export const getStoredSelectedCustomer = () => readEntity(CUSTOMER_KEY)
export const storeSelectedCustomer = (customer: any | null) => writeEntity(CUSTOMER_KEY, customer)

export const getStoredSelectedSupplier = () => readEntity(SUPPLIER_KEY)
export const storeSelectedSupplier = (supplier: any | null) => writeEntity(SUPPLIER_KEY, supplier)

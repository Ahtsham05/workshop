import { customerApi } from '@/stores/customer.api'
import { store } from '@/stores/store'
import './invoice-print-whatsapp-bridge'
import './invoice-print-pdf-bridge'

export type PrintWindowContact = {
  customerId?: string
  phone?: string
  whatsapp?: string
}

declare global {
  interface Window {
    __invoicePrintContactById?: Record<string, { phone?: string; whatsapp?: string }>
    __fetchCustomerContactForInvoicePrint?: (
      customerId: string,
    ) => Promise<{ phone?: string; whatsapp?: string }>
  }
}

export function resolveCustomerIdString(customerId: unknown): string | undefined {
  if (!customerId || customerId === 'walk-in') return undefined
  if (typeof customerId === 'string') return customerId.trim() || undefined
  if (typeof customerId === 'object' && customerId !== null) {
    const o = customerId as { _id?: string; id?: string }
    return String(o._id || o.id || '').trim() || undefined
  }
  return undefined
}

export function stashPrintContact(contact: PrintWindowContact): void {
  const id = contact.customerId
  if (!id) return
  const phone = contact.phone?.trim() || ''
  const whatsapp = (contact.whatsapp || contact.phone)?.trim() || ''
  window.__invoicePrintContactById = window.__invoicePrintContactById || {}
  window.__invoicePrintContactById[id] = { phone, whatsapp }
}

/** Fetch customer phone/WhatsApp from API and cache on opener window for print popup. */
export async function fetchAndStashPrintContact(customerId: string): Promise<{
  phone?: string
  whatsapp?: string
}> {
  const result = await store
    .dispatch(customerApi.endpoints.getCustomerById.initiate(customerId, { forceRefetch: true }))
    .unwrap()
  const phone = result.phone?.trim()
  const whatsapp = (result.whatsapp || result.phone)?.trim()
  stashPrintContact({ customerId, phone, whatsapp })
  return { phone, whatsapp }
}

export function ensureInvoicePrintContactBridge(): void {
  if (window.__fetchCustomerContactForInvoicePrint) return
  window.__fetchCustomerContactForInvoicePrint = async (customerId: string) => {
    return fetchAndStashPrintContact(customerId)
  }
}

ensureInvoicePrintContactBridge()

import { whatsappApi } from '@/stores/whatsapp.api'
import { store } from '@/stores/store'

export type SendInvoicePdfPayload = {
  phone: string
  pdfBase64: string
  filename?: string
  caption?: string
  invoiceNumber?: string
}

export type SendInvoicePdfResult = {
  success: boolean
  message?: string
  error?: string
}

declare global {
  interface Window {
    __sendInvoicePdfViaWhatsApp?: (payload: SendInvoicePdfPayload) => Promise<SendInvoicePdfResult>
  }
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Failed to send invoice on WhatsApp'
  const e = err as { data?: { message?: string }; message?: string }
  return e.data?.message || e.message || 'Failed to send invoice on WhatsApp'
}

/** Lets print popup windows POST invoice PDFs through the main app's authenticated API. */
export function ensureInvoiceWhatsAppSendBridge(): void {
  if (window.__sendInvoicePdfViaWhatsApp) return
  window.__sendInvoicePdfViaWhatsApp = async (payload) => {
    try {
      const result = await store
        .dispatch(whatsappApi.endpoints.sendInvoicePdfWhatsApp.initiate(payload))
        .unwrap()
      return { success: true, message: result.message }
    } catch (err) {
      return { success: false, error: extractErrorMessage(err) }
    }
  }
}

ensureInvoiceWhatsAppSendBridge()

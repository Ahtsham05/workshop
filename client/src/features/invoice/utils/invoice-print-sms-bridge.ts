import { store } from '@/stores/store'
import { smsGatewayApi } from '@/stores/smsGateway.api'

export type SendInvoiceSmsPayload = {
  to: string
  message: string
  source?: string
}

export type SendInvoiceSmsResult = {
  success: boolean
  message?: string
  error?: string
}

declare global {
  interface Window {
    __sendInvoiceSmsViaGateway?: (payload: SendInvoiceSmsPayload) => Promise<SendInvoiceSmsResult>
  }
}

function extractErrorMessage(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Failed to send SMS'
  const e = err as { data?: { message?: string }; message?: string }
  return e.data?.message || e.message || 'Failed to send SMS'
}

/** Lets print popup windows send SMS through the main app's connected SIM gateway. */
export function ensureInvoiceSmsSendBridge(): void {
  if (window.__sendInvoiceSmsViaGateway) return
  window.__sendInvoiceSmsViaGateway = async (payload) => {
    try {
      const result = await store
        .dispatch(smsGatewayApi.endpoints.sendSms.initiate(payload))
        .unwrap()
      return { success: true, message: (result as any).message }
    } catch (err) {
      return { success: false, error: extractErrorMessage(err) }
    }
  }
}

ensureInvoiceSmsSendBridge()

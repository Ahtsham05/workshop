import type { SyncQueueOperation } from '@/types/electron'

let localInvoiceSeq = 0

function nextLocalInvoiceNumber(deviceId: string) {
  localInvoiceSeq += 1
  const shortId = deviceId.slice(0, 8)
  return `LOCAL-INV-${shortId}-${String(localInvoiceSeq).padStart(5, '0')}`
}

export function buildOfflineInvoicePayload(
  invoiceData: Record<string, unknown>,
  deviceId: string,
): { clientId: string; localInvoiceNumber: string; operation: SyncQueueOperation } {
  const clientId = crypto.randomUUID()
  const localInvoiceNumber = nextLocalInvoiceNumber(deviceId)

  return {
    clientId,
    localInvoiceNumber,
    operation: {
      clientId,
      entity: 'invoice',
      operation: 'create',
      payload: {
        ...invoiceData,
        type: 'cash',
        localInvoiceNumber,
        offlineCreatedAt: new Date().toISOString(),
      },
    },
  }
}

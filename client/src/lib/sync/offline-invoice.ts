import type { SyncQueueOperation } from '@/types/electron'
import { nextOfflineSequence } from '@/lib/sync/offline-sequence'

export function buildOfflineInvoicePayload(
  invoiceData: Record<string, unknown>,
  deviceId: string,
): { clientId: string; localInvoiceNumber: string; operation: SyncQueueOperation } {
  const clientId = crypto.randomUUID()
  const localInvoiceNumber = nextOfflineSequence('invoice', 'LOCAL-INV', deviceId)

  return {
    clientId,
    localInvoiceNumber,
    operation: {
      clientId,
      entity: 'invoice',
      operation: 'create',
      payload: {
        ...invoiceData,
        localInvoiceNumber,
        offlineCreatedAt: new Date().toISOString(),
      },
    },
  }
}

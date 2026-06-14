import type { SyncQueueOperation } from '@/types/electron'
import { nextOfflineSequence } from '@/lib/sync/offline-sequence'

export function buildOfflinePurchasePayload(
  purchaseData: Record<string, unknown>,
  deviceId: string,
): { clientId: string; localPurchaseNumber: string; operation: SyncQueueOperation } {
  const clientId = crypto.randomUUID()
  const localPurchaseNumber = nextOfflineSequence('purchase', 'LOCAL-PO', deviceId)

  return {
    clientId,
    localPurchaseNumber,
    operation: {
      clientId,
      entity: 'purchase',
      operation: 'create',
      payload: {
        ...purchaseData,
        localPurchaseNumber,
        offlineCreatedAt: new Date().toISOString(),
      },
    },
  }
}

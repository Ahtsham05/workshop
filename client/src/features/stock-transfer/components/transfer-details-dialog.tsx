import type { ReactNode } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetTransferQuery, type InventoryTransfer } from '@/stores/inventoryTransfer.api'
import { useLanguage } from '@/context/language-context'
import { formatDateSafe } from '@/lib/utils'
import { TransferStatusBadge } from './transfer-status-badge'

interface TransferDetailsDialogProps {
  transferId: string | null
  onClose: () => void
}

function branchLabel(ref: InventoryTransfer['fromBranchId']): string {
  if (typeof ref === 'string') return ref
  return ref?.name || '—'
}

function personLabel(ref: InventoryTransfer['decidedBy']): string {
  if (!ref) return '—'
  return typeof ref === 'string' ? ref : ref.name || '—'
}

function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className='text-xs text-muted-foreground mb-1'>{label}</p>
      <p className='text-sm font-medium'>{value}</p>
    </div>
  )
}

export function TransferDetailsDialog({ transferId, onClose }: TransferDetailsDialogProps) {
  const { t } = useLanguage()
  const { data: tr, isFetching } = useGetTransferQuery(transferId!, { skip: !transferId })

  if (!transferId) return null

  const formatDate = (value?: string | null) => formatDateSafe(value, 'MMM dd, yyyy hh:mm a')

  return (
    <Dialog open={!!transferId} onOpenChange={onClose}>
      <DialogContent className='max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>{t('Transfer Details')}</DialogTitle>
        </DialogHeader>

        {isFetching || !tr ? (
          <div className='space-y-2'>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='bg-muted/50 rounded-lg p-4'>
              <p className='mb-1 font-semibold'>{tr.productName}</p>
              {tr.imeis && tr.imeis.length > 0 && (
                <p className='text-xs text-muted-foreground'>{t('IMEI/Serial')}: {tr.imeis.join(', ')}</p>
              )}
              {tr.batchSnapshot?.batchNumber && (
                <p className='text-xs text-blue-600'>{t('Batch')}: {tr.batchSnapshot.batchNumber}</p>
              )}
            </div>

            <div className='grid grid-cols-2 gap-4'>
              <DetailField label={t('From')} value={branchLabel(tr.fromBranchId)} />
              <DetailField label={t('To')} value={branchLabel(tr.toBranchId)} />
              <DetailField label={t('Qty')} value={tr.quantity} />
              <DetailField label={t('Status')} value={<TransferStatusBadge status={tr.status} />} />
              <DetailField label={t('Transfer Date')} value={formatDate(tr.suggestedAt)} />
              <DetailField label={t('Completed At')} value={formatDate(tr.completedAt)} />
              <DetailField label={t('Decided By')} value={personLabel(tr.decidedBy)} />
              <DetailField label={t('Decided At')} value={formatDate(tr.decidedAt)} />
            </div>

            {tr.reason && <DetailField label={t('Reason')} value={tr.reason} />}
            {tr.notes && <DetailField label={t('Notes')} value={tr.notes} />}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

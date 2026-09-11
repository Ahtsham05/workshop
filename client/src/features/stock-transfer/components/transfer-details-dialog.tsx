import type { ReactNode } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowDownToLine, Ban, Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  useGetTransferGroupQuery,
  useCompleteTransferMutation,
  useCancelTransferMutation,
  type InventoryTransfer,
} from '@/stores/inventoryTransfer.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useLanguage } from '@/context/language-context'
import { formatDateSafe } from '@/lib/utils'
import type { RootState } from '@/stores/store'
import { TransferStatusBadge } from './transfer-status-badge'
import { buildTransferPrintData, generateTransferHTML, openTransferPrintWindow } from '../utils/print-utils'

interface TransferDetailsDialogProps {
  groupId: string | null
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

export function TransferDetailsDialog({ groupId, onClose }: TransferDetailsDialogProps) {
  const { t, language } = useLanguage()
  const { data: items, isFetching } = useGetTransferGroupQuery(groupId!, { skip: !groupId })
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  const [completeTransfer, { isLoading: completing }] = useCompleteTransferMutation()
  const [cancelTransfer, { isLoading: cancelling }] = useCancelTransferMutation()
  const busy = completing || cancelling

  if (!groupId) return null

  const formatDate = (value?: string | null) => formatDateSafe(value, 'MMM dd, yyyy hh:mm a')

  const first = items?.[0]
  const isSource = first ? branchIdOf(first.fromBranchId) === activeBranchId : false
  const isDest = first ? branchIdOf(first.toBranchId) === activeBranchId : false
  const totalQuantity = items?.reduce((sum, i) => sum + i.quantity, 0) || 0
  const receivableIds = items?.filter((i) => i.status === 'in_transit' && isDest).map((i) => i.id) || []
  const cancellableIds = items?.filter((i) => ['suggested', 'approved', 'in_transit'].includes(i.status) && (isSource || isDest)).map((i) => i.id) || []

  const runLineAction = async (action: () => Promise<unknown>, successMsg: string) => {
    try {
      await action()
      toast.success(t(successMsg))
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Action failed'))
    }
  }

  const runBulkAction = async (ids: string[], action: (id: string) => Promise<unknown>, successMsg: string) => {
    const results = await Promise.allSettled(ids.map((id) => action(id)))
    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed === 0) toast.success(t(successMsg))
    else if (failed < ids.length) toast.warning(t('{{ok}} of {{total}} succeeded — {{failed}} failed', { ok: String(ids.length - failed), total: String(ids.length), failed: String(failed) }))
    else toast.error(t('Action failed for all products'))
  }

  const handlePrint = () => {
    if (!items || items.length === 0) return
    try {
      const printData = buildTransferPrintData(items, {
        companyName: orgData?.name,
        companyAddress: [orgData?.address, orgData?.city].filter(Boolean).join(', '),
        companyPhone: orgData?.phone,
        companyLogo: orgData?.logo?.url,
        language: language === 'ur' ? 'ur' : 'en',
      })
      openTransferPrintWindow(generateTransferHTML(printData))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('Failed to open print window'))
    }
  }

  return (
    <Dialog open={!!groupId} onOpenChange={onClose}>
      <DialogContent className='max-h-[90vh] w-[calc(100vw-1.5rem)] overflow-y-auto sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle className='flex flex-wrap items-center gap-2'>
            {t('Transfer Details')}
            {first?.transferNumber && <span className='text-sm font-normal text-muted-foreground'>{first.transferNumber}</span>}
          </DialogTitle>
        </DialogHeader>

        {isFetching || !items ? (
          <div className='space-y-2'>
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className='h-8 w-full' />
            ))}
          </div>
        ) : (
          <div className='space-y-4'>
            <div className='grid grid-cols-2 gap-4 sm:grid-cols-3'>
              <DetailField label={t('From')} value={branchLabel(first!.fromBranchId)} />
              <DetailField label={t('To')} value={branchLabel(first!.toBranchId)} />
              <DetailField label={t('Products')} value={items.length} />
              <DetailField label={t('Total Qty')} value={totalQuantity} />
              <DetailField label={t('Transfer Date')} value={formatDate(first!.suggestedAt)} />
              <DetailField label={t('Decided By')} value={personLabel(first!.decidedBy)} />
            </div>

            <div className='rounded-lg border overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('Product')}</TableHead>
                    <TableHead className='text-right'>{t('Qty')}</TableHead>
                    <TableHead>{t('Status')}</TableHead>
                    <TableHead className='text-right'>{t('Actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell className='max-w-[220px]'>
                        <div className='truncate font-medium' title={line.productName}>{line.productName}</div>
                        {line.imeis && line.imeis.length > 0 && (
                          <div className='truncate text-xs text-muted-foreground' title={line.imeis.join(', ')}>
                            {t('IMEI/Serial')}: {line.imeis.join(', ')}
                          </div>
                        )}
                        {line.batchSnapshot?.batchNumber && (
                          <div className='text-xs text-blue-600'>{t('Batch')}: {line.batchSnapshot.batchNumber}</div>
                        )}
                      </TableCell>
                      <TableCell className='text-right'>{line.quantity}</TableCell>
                      <TableCell><TransferStatusBadge status={line.status} /></TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1.5'>
                          {line.status === 'in_transit' && isDest && (
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={busy}
                              onClick={() => runLineAction(() => completeTransfer(line.id).unwrap(), 'Stock received')}
                            >
                              <ArrowDownToLine className='mr-1 h-3.5 w-3.5' />
                              {t('Receive')}
                            </Button>
                          )}
                          {['suggested', 'approved', 'in_transit'].includes(line.status) && (isSource || isDest) && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive hover:text-destructive'
                              disabled={busy}
                              onClick={() => runLineAction(() => cancelTransfer(line.id).unwrap(), 'Transfer cancelled')}
                            >
                              <Ban className='mr-1 h-3.5 w-3.5' />
                              {t('Cancel')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {first!.reason && <DetailField label={t('Reason')} value={first!.reason} />}
            {first!.notes && <DetailField label={t('Notes')} value={first!.notes} />}

            <DialogFooter className='flex-wrap gap-2 sm:justify-between'>
              <div className='flex flex-wrap gap-2'>
                {receivableIds.length > 1 && (
                  <Button
                    size='sm'
                    disabled={busy}
                    onClick={() => runBulkAction(receivableIds, (id) => completeTransfer(id).unwrap(), 'All remaining products received')}
                  >
                    <ArrowDownToLine className='mr-2 h-4 w-4' />
                    {t('Receive all remaining ({{count}})', { count: String(receivableIds.length) })}
                  </Button>
                )}
                {cancellableIds.length > 1 && (
                  <Button
                    size='sm'
                    variant='outline'
                    className='text-destructive hover:text-destructive'
                    disabled={busy}
                    onClick={() => runBulkAction(cancellableIds, (id) => cancelTransfer(id).unwrap(), 'All remaining products cancelled')}
                  >
                    <Ban className='mr-2 h-4 w-4' />
                    {t('Cancel all remaining ({{count}})', { count: String(cancellableIds.length) })}
                  </Button>
                )}
              </div>
              <Button variant='outline' onClick={handlePrint}>
                <Printer className='mr-2 h-4 w-4' />
                {t('Print')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function branchIdOf(ref: InventoryTransfer['fromBranchId']): string {
  return typeof ref === 'string' ? ref : ref?.id || ''
}

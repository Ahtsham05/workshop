import { useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowLeftRight, ArrowDownToLine, ArrowUpFromLine, Ban, Plus } from 'lucide-react'

import type { RootState } from '@/stores/store'
import {
  useGetTransfersQuery,
  useApproveTransferMutation,
  useCompleteTransferMutation,
  useCancelTransferMutation,
  type InventoryTransfer,
  type TransferStatus,
} from '@/stores/inventoryTransfer.api'
import { useLanguage } from '@/context/language-context'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'

import { TransferStatusBadge } from './components/transfer-status-badge'
import { CreateTransferDialog, type TransferPrefill } from './components/create-transfer-dialog'
import { SuggestedTransfersPanel } from './components/suggested-transfers-panel'

const LIMIT = 15

function branchName(ref: InventoryTransfer['fromBranchId']): string {
  if (typeof ref === 'string') return ref
  return ref?.name || '—'
}
function branchId(ref: InventoryTransfer['fromBranchId']): string {
  return typeof ref === 'string' ? ref : ref?.id || ''
}

export default function StockTransfer() {
  const { t } = useLanguage()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)

  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<TransferPrefill | null>(null)

  const { data, isFetching } = useGetTransfersQuery({
    page,
    limit: LIMIT,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(directionFilter !== 'all' ? { direction: directionFilter } : {}),
  })

  const [approveTransfer, { isLoading: approving }] = useApproveTransferMutation()
  const [completeTransfer, { isLoading: completing }] = useCompleteTransferMutation()
  const [cancelTransfer, { isLoading: cancelling }] = useCancelTransferMutation()

  const busy = approving || completing || cancelling

  const runAction = async (action: () => Promise<unknown>, successMsg: string) => {
    try {
      await action()
      toast.success(t(successMsg))
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || t('Action failed'))
    }
  }

  const transfers = data?.results || []

  const openCreateDialog = () => {
    setPrefill(null)
    setDialogOpen(true)
  }

  return (
    <div className='space-y-6 p-4 md:p-6'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='flex items-center gap-2'>
          <ArrowLeftRight className='h-6 w-6 text-primary' />
          <div>
            <h1 className='text-2xl font-bold tracking-tight'>{t('Stock Transfer')}</h1>
            <p className='text-sm text-muted-foreground'>
              {t('Move inventory between branches and keep stock levels accurate everywhere')}
            </p>
          </div>
        </div>
        <Button onClick={openCreateDialog}>
          <Plus className='mr-2 h-4 w-4' />
          {t('New Transfer')}
        </Button>
      </div>

      <SuggestedTransfersPanel
        onUseSuggestion={(p) => {
          setPrefill(p)
          setDialogOpen(true)
        }}
      />

      <Card>
        <CardHeader className='flex flex-row flex-wrap items-center justify-between gap-3 space-y-0'>
          <div>
            <CardTitle className='text-base'>{t('Transfers')}</CardTitle>
            <CardDescription>{t('Outgoing and incoming transfers for this branch')}</CardDescription>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Select value={directionFilter} onValueChange={(v) => { setDirectionFilter(v as typeof directionFilter); setPage(1) }}>
              <SelectTrigger className='h-9 w-36'>
                <SelectValue placeholder={t('Direction')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All directions')}</SelectItem>
                <SelectItem value='outgoing'>{t('Outgoing')}</SelectItem>
                <SelectItem value='incoming'>{t('Incoming')}</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as typeof statusFilter); setPage(1) }}>
              <SelectTrigger className='h-9 w-36'>
                <SelectValue placeholder={t('Status')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>{t('All statuses')}</SelectItem>
                <SelectItem value='suggested'>{t('Suggested')}</SelectItem>
                <SelectItem value='in_transit'>{t('In transit')}</SelectItem>
                <SelectItem value='completed'>{t('Completed')}</SelectItem>
                <SelectItem value='cancelled'>{t('Cancelled')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isFetching ? (
            <div className='space-y-2'>
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('Product')}</TableHead>
                  <TableHead>{t('From')}</TableHead>
                  <TableHead>{t('To')}</TableHead>
                  <TableHead className='text-right'>{t('Qty')}</TableHead>
                  <TableHead>{t('Status')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transfers.map((tr) => {
                  const isSource = branchId(tr.fromBranchId) === activeBranchId
                  const isDest = branchId(tr.toBranchId) === activeBranchId
                  return (
                    <TableRow key={tr.id}>
                      <TableCell className='font-medium'>{tr.productName}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{branchName(tr.fromBranchId)}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{branchName(tr.toBranchId)}</TableCell>
                      <TableCell className='text-right'>{tr.quantity}</TableCell>
                      <TableCell><TransferStatusBadge status={tr.status} /></TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1.5'>
                          {tr.status === 'suggested' && isSource && (
                            <Button
                              size='sm'
                              variant='outline'
                              disabled={busy}
                              onClick={() => runAction(() => approveTransfer(tr.id).unwrap(), 'Transfer approved and sent')}
                            >
                              <ArrowUpFromLine className='mr-1 h-3.5 w-3.5' />
                              {t('Send')}
                            </Button>
                          )}
                          {tr.status === 'in_transit' && isDest && (
                            <Button
                              size='sm'
                              disabled={busy}
                              onClick={() => runAction(() => completeTransfer(tr.id).unwrap(), 'Stock received')}
                            >
                              <ArrowDownToLine className='mr-1 h-3.5 w-3.5' />
                              {t('Receive')}
                            </Button>
                          )}
                          {(tr.status === 'in_transit' || tr.status === 'suggested') && (isSource || isDest) && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive hover:text-destructive'
                              disabled={busy}
                              onClick={() => runAction(() => cancelTransfer(tr.id).unwrap(), 'Transfer cancelled')}
                            >
                              <Ban className='mr-1 h-3.5 w-3.5' />
                              {t('Cancel')}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {transfers.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className='text-center text-muted-foreground'>
                      {t('No transfers found')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
          <SimplePagination
            currentPage={page}
            totalPages={data?.totalPages || 1}
            totalResults={data?.totalResults}
            limit={LIMIT}
            onPageChange={setPage}
            className='mt-3'
          />
        </CardContent>
      </Card>

      <CreateTransferDialog open={dialogOpen} onOpenChange={setDialogOpen} prefill={prefill} />
    </div>
  )
}

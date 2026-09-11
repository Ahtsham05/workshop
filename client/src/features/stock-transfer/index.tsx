import { useState } from 'react'
import { useSelector } from 'react-redux'
import { toast } from 'sonner'
import { ArrowLeftRight, ArrowDownToLine, Ban, Plus, Layers, Eye, Printer } from 'lucide-react'
import { formatDateSafe } from '@/lib/utils'

import type { RootState } from '@/stores/store'
import {
  useGetTransfersQuery,
  useLazyGetTransferGroupQuery,
  useCompleteTransferMutation,
  useCancelTransferMutation,
  type GroupedTransferRow,
  type TransferStatus,
} from '@/stores/inventoryTransfer.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { TransferSuggestion } from '@/stores/purchaseSuggestions.api'
import { useLanguage } from '@/context/language-context'
import { buildTransferPrintData, generateTransferHTML, openTransferPrintWindow } from './utils/print-utils'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Skeleton } from '@/components/ui/skeleton'

import { TransferStatusBadge } from './components/transfer-status-badge'
import { CreateTransferDialog, type TransferPrefill } from './components/create-transfer-dialog'
import { BulkTransferPanel } from './components/bulk-transfer-panel'
import { SuggestedTransfersPanel } from './components/suggested-transfers-panel'
import { TransferDetailsDialog } from './components/transfer-details-dialog'

const LIMIT = 15

function branchName(ref: GroupedTransferRow['fromBranchId']): string {
  if (typeof ref === 'string') return ref
  return ref?.name || '—'
}
function branchId(ref: GroupedTransferRow['fromBranchId']): string {
  return typeof ref === 'string' ? ref : ref?.id || ''
}

export default function StockTransfer() {
  const { t, language } = useLanguage()
  const activeBranchId = useSelector((s: RootState) => s.auth.activeBranchId)
  const user = useSelector((s: RootState) => s.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })

  const [view, setView] = useState<'list' | 'bulk'>('list')
  const [statusFilter, setStatusFilter] = useState<TransferStatus | 'all'>('all')
  const [directionFilter, setDirectionFilter] = useState<'all' | 'incoming' | 'outgoing'>('all')
  const [page, setPage] = useState(1)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prefill, setPrefill] = useState<TransferPrefill | null>(null)
  const [detailsGroupId, setDetailsGroupId] = useState<string | null>(null)
  // Seeds the bulk panel when it's opened from selected suggestions instead of manually —
  // a suggestion group is already scoped to one destination branch, matching what a single
  // bulk transfer submission can send to.
  const [bulkSeed, setBulkSeed] = useState<{ toBranchId: string; suggestions: TransferSuggestion[] } | null>(null)

  const { data, isFetching } = useGetTransfersQuery({
    page,
    limit: LIMIT,
    ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
    ...(directionFilter !== 'all' ? { direction: directionFilter } : {}),
  })

  const [completeTransfer, { isLoading: completing }] = useCompleteTransferMutation()
  const [cancelTransfer, { isLoading: cancelling }] = useCancelTransferMutation()
  const [fetchGroup] = useLazyGetTransferGroupQuery()

  const busy = completing || cancelling

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

  const handlePrint = async (groupId: string) => {
    try {
      const items = await fetchGroup(groupId).unwrap()
      const printData = buildTransferPrintData(items, {
        companyName: orgData?.name,
        companyAddress: [orgData?.address, orgData?.city].filter(Boolean).join(', '),
        companyPhone: orgData?.phone,
        companyLogo: orgData?.logo?.url,
        language: language === 'ur' ? 'ur' : 'en',
      })
      openTransferPrintWindow(generateTransferHTML(printData))
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || (err instanceof Error ? err.message : t('Failed to open print window')))
    }
  }

  const openCreateDialog = () => {
    setPrefill(null)
    setDialogOpen(true)
  }

  const closeBulkView = () => {
    setView('list')
    setBulkSeed(null)
  }

  if (view === 'bulk') {
    return (
      <div className='space-y-6 p-4 md:p-6'>
        <BulkTransferPanel
          onDone={closeBulkView}
          onCancel={closeBulkView}
          initialToBranchId={bulkSeed?.toBranchId}
          initialSuggestions={bulkSeed?.suggestions}
        />
      </div>
    )
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
        <div className='flex gap-2'>
          <Button variant='outline' onClick={() => setView('bulk')}>
            <Layers className='mr-2 h-4 w-4' />
            {t('Bulk Transfer')}
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className='mr-2 h-4 w-4' />
            {t('New Transfer')}
          </Button>
        </div>
      </div>

      <SuggestedTransfersPanel
        onTransferSelected={(toBranchId, suggestions) => {
          setBulkSeed({ toBranchId, suggestions })
          setView('bulk')
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
                  <TableHead>{t('Date')}</TableHead>
                  <TableHead>{t('Transfer #')}</TableHead>
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
                  const isSingle = tr.itemCount === 1 && !!tr.singleItemId
                  return (
                    <TableRow key={tr.groupId}>
                      <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>
                        {formatDateSafe(tr.suggestedAt, 'MMM dd, yyyy hh:mm a')}
                      </TableCell>
                      <TableCell className='whitespace-nowrap text-sm text-muted-foreground'>
                        {tr.transferNumber || '—'}
                      </TableCell>
                      <TableCell className='font-medium max-w-[220px]'>
                        <div className='flex items-center gap-1.5'>
                          <span className='truncate' title={tr.productNames.join(', ')}>{tr.productNames[0] || '—'}</span>
                          {tr.itemCount > 1 && (
                            <Badge variant='secondary' className='shrink-0 text-[10px]'>
                              +{tr.itemCount - 1} {t('more')}
                            </Badge>
                          )}
                        </div>
                        {isSingle && tr.singleItemImeis && tr.singleItemImeis.length > 0 && (
                          <div className='truncate text-xs font-normal text-muted-foreground' title={tr.singleItemImeis.join(', ')}>
                            IMEI/Serial: {tr.singleItemImeis.join(', ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{branchName(tr.fromBranchId)}</TableCell>
                      <TableCell className='text-sm text-muted-foreground'>{branchName(tr.toBranchId)}</TableCell>
                      <TableCell className='text-right'>{tr.totalQuantity}</TableCell>
                      <TableCell><TransferStatusBadge status={tr.status} /></TableCell>
                      <TableCell className='text-right'>
                        <div className='flex justify-end gap-1.5'>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => setDetailsGroupId(tr.groupId)}
                          >
                            <Eye className='mr-1 h-3.5 w-3.5' />
                            {t('View')}
                          </Button>
                          <Button
                            size='sm'
                            variant='ghost'
                            onClick={() => handlePrint(tr.groupId)}
                          >
                            <Printer className='mr-1 h-3.5 w-3.5' />
                            {t('Print')}
                          </Button>
                          {isSingle && tr.status === 'in_transit' && isDest && (
                            <Button
                              size='sm'
                              disabled={busy}
                              onClick={() => runAction(() => completeTransfer(tr.singleItemId!).unwrap(), 'Stock received')}
                            >
                              <ArrowDownToLine className='mr-1 h-3.5 w-3.5' />
                              {t('Receive')}
                            </Button>
                          )}
                          {isSingle && tr.status === 'in_transit' && (isSource || isDest) && (
                            <Button
                              size='sm'
                              variant='ghost'
                              className='text-destructive hover:text-destructive'
                              disabled={busy}
                              onClick={() => runAction(() => cancelTransfer(tr.singleItemId!).unwrap(), 'Transfer cancelled')}
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
                    <TableCell colSpan={8} className='text-center text-muted-foreground'>
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
      <TransferDetailsDialog groupId={detailsGroupId} onClose={() => setDetailsGroupId(null)} />
    </div>
  )
}

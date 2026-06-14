import { useState, useEffect, useMemo } from 'react'
import { formatBusinessDate } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Plus,
  Search,
  Eye,
  Edit,
  Trash2,
  Send,
  X,
  PackageOpen,
  PackageCheck,
  Filter,
  FileText,
  ClipboardList,
  RefreshCw,
} from 'lucide-react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Progress } from '@/components/ui/progress'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

import {
  useGetPurchaseOrdersQuery,
  useGetPurchaseOrderStatsQuery,
  useDeletePurchaseOrderMutation,
  useSendPurchaseOrderMutation,
  useCancelPurchaseOrderMutation,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '@/stores/purchaseOrder.api'
import { LIST_SEARCH_FIELDS } from '@/lib/list-search-fields'

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 hover:bg-slate-100',
  sent: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
  partial: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  completed: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  cancelled: 'bg-rose-100 text-rose-700 hover:bg-rose-100',
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

interface Props {
  onCreate: () => void
  onEdit: (po: PurchaseOrder) => void
  onView: (po: PurchaseOrder) => void
  onReceive: (po: PurchaseOrder) => void
}

export default function PurchaseOrderList({
  onCreate,
  onEdit,
  onView,
  onReceive,
}: Props) {
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)
  const [poToCancel, setPoToCancel] = useState<PurchaseOrder | null>(null)
  const [poToDelete, setPoToDelete] = useState<PurchaseOrder | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  useEffect(() => {
    const id = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(id)
  }, [search])

  const params = useMemo(() => {
    const out: Record<string, any> = { page, limit }
    if (debouncedSearch) {
      out.search = debouncedSearch
      out.fieldName = LIST_SEARCH_FIELDS.purchaseOrder
    }
    if (status && status !== 'all') out.status = status
    return out
  }, [page, limit, debouncedSearch, status])

  const { data, isLoading, isFetching, refetch } = useGetPurchaseOrdersQuery(params)
  const { data: stats } = useGetPurchaseOrderStatsQuery()

  const [deletePO] = useDeletePurchaseOrderMutation()
  const [sendPO, { isLoading: isSending }] = useSendPurchaseOrderMutation()
  const [cancelPO, { isLoading: isCancelling }] = useCancelPurchaseOrderMutation()

  const orders: PurchaseOrder[] = data?.results || []
  const totalResults = data?.totalResults || 0
  const totalPages = data?.totalPages || 1

  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, status, limit])

  const handleSend = async (po: PurchaseOrder) => {
    try {
      await sendPO(po._id || po.id!).unwrap()
      toast.success(`Order ${po.orderNumber} marked as sent`)
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to send order')
    }
  }

  const handleConfirmCancel = async () => {
    if (!poToCancel) return
    try {
      await cancelPO({
        id: poToCancel._id || poToCancel.id!,
        cancellationReason: cancelReason || undefined,
      }).unwrap()
      toast.success(`Order ${poToCancel.orderNumber} cancelled`)
      setPoToCancel(null)
      setCancelReason('')
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to cancel order')
    }
  }

  const handleConfirmDelete = async () => {
    if (!poToDelete) return
    try {
      await deletePO(poToDelete._id || poToDelete.id!).unwrap()
      toast.success(`Order ${poToDelete.orderNumber} deleted`)
      setPoToDelete(null)
    } catch (e: any) {
      toast.error(e?.data?.message || 'Failed to delete order')
    }
  }

  const computeProgress = (po: PurchaseOrder) => {
    const items = po.items || []
    const ordered = items.reduce((s, i) => s + Number(i.quantity || 0), 0)
    const received = items.reduce(
      (s, i) => s + Math.min(Number(i.quantity || 0), Number(i.receivedQuantity || 0)),
      0
    )
    return {
      ordered,
      received,
      pct: ordered === 0 ? 0 : Math.min(100, Math.round((received / ordered) * 100)),
    }
  }

  const handleCardFilter = (filter: string) => {
    setStatus((prev) => (prev === filter ? 'all' : filter))
  }

  const isCardActive = (filter: string) => status === filter

  return (
    <div className='space-y-6'>
      {/* Header */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>Purchase Orders</h1>
          <p className='text-sm text-muted-foreground mt-1'>
            Track outstanding orders, partial deliveries, and goods receipts.
          </p>
        </div>
        <div className='flex flex-wrap items-center gap-2'>
          <Button variant='outline' size='sm' onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={onCreate}>
            <Plus className='mr-2 h-4 w-4' />
            New Purchase Order
          </Button>
        </div>
      </div>

      {/* Stats — click a card to filter the table */}
      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'>
        <StatCard
          label='Total'
          value={stats?.counts.total ?? 0}
          accent='bg-slate-100 text-slate-700'
          icon={ClipboardList}
          active={isCardActive('all')}
          onClick={() => handleCardFilter('all')}
        />
        <StatCard
          label='Draft'
          value={stats?.counts.draft ?? 0}
          accent={STATUS_STYLES.draft}
          icon={FileText}
          active={isCardActive('draft')}
          onClick={() => handleCardFilter('draft')}
        />
        <StatCard
          label='Sent'
          value={stats?.counts.sent ?? 0}
          accent={STATUS_STYLES.sent}
          icon={Send}
          active={isCardActive('sent')}
          onClick={() => handleCardFilter('sent')}
        />
        <StatCard
          label='Partial'
          value={stats?.counts.partial ?? 0}
          accent={STATUS_STYLES.partial}
          icon={PackageOpen}
          active={isCardActive('partial')}
          onClick={() => handleCardFilter('partial')}
        />
        <StatCard
          label='Completed'
          value={stats?.counts.completed ?? 0}
          accent={STATUS_STYLES.completed}
          icon={PackageCheck}
          active={isCardActive('completed')}
          onClick={() => handleCardFilter('completed')}
        />
        <StatCard
          label='Open Value'
          value={`Rs ${(stats?.openValue || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`}
          accent='bg-indigo-100 text-indigo-700'
          icon={ClipboardList}
          active={isCardActive('open')}
          onClick={() => handleCardFilter('open')}
        />
      </div>

      {/* Filters */}
      <Card>
        <CardContent className='pt-6'>
          <div className='grid grid-cols-1 gap-4 md:grid-cols-4'>
            <div className='md:col-span-2'>
              <Label htmlFor='po-search'>Search</Label>
              <div className='relative mt-2'>
                <Search className='absolute left-3 top-3 h-4 w-4 text-muted-foreground' />
                <Input
                  id='po-search'
                  placeholder='Search by order number or supplier...'
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className='pl-10'
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className='mt-2'>
                  <SelectValue placeholder='All statuses' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All statuses</SelectItem>
                  <SelectItem value='open'>Open (draft / sent / partial)</SelectItem>
                  <SelectItem value='draft'>Draft</SelectItem>
                  <SelectItem value='sent'>Sent</SelectItem>
                  <SelectItem value='partial'>Partial</SelectItem>
                  <SelectItem value='completed'>Completed</SelectItem>
                  <SelectItem value='cancelled'>Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-end'>
              <Button
                variant='outline'
                onClick={() => {
                  setSearch('')
                  setStatus('all')
                }}
                className='w-full'
              >
                <Filter className='mr-2 h-4 w-4' />
                Clear filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader className='flex flex-row items-center justify-between'>
          <CardTitle>Orders ({totalResults})</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className='py-12 text-center text-muted-foreground'>Loading purchase orders...</div>
          ) : orders.length === 0 ? (
            <div className='py-12 text-center text-muted-foreground'>
              <ClipboardList className='mx-auto h-10 w-10 opacity-40' />
              <p className='mt-3'>No purchase orders found.</p>
              <Button variant='outline' className='mt-4' onClick={onCreate}>
                <Plus className='mr-2 h-4 w-4' /> Create your first order
              </Button>
            </div>
          ) : (
            <div className='overflow-x-auto'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order #</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Order date</TableHead>
                    <TableHead>Expected</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Progress</TableHead>
                    <TableHead className='text-right'>Total</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map((po) => {
                    const id = po._id || po.id!
                    const progress = computeProgress(po)
                    const canEdit = po.status === 'draft' || po.status === 'sent'
                    const canSend = po.status === 'draft'
                    const canCancel =
                      po.status !== 'cancelled' && po.status !== 'completed' &&
                      (!po.receipts || po.receipts.length === 0)
                    const canDelete = po.status === 'draft' || po.status === 'cancelled'
                    const canReceive =
                      po.status === 'sent' || po.status === 'partial' || po.status === 'draft'
                    return (
                      <TableRow key={id}>
                        <TableCell className='font-mono text-sm font-medium'>
                          {po.orderNumber}
                        </TableCell>
                        <TableCell>
                          <div className='font-medium leading-tight'>{po.supplier?.name || 'N/A'}</div>
                          {po.supplier?.phone ? (
                            <div className='text-xs text-muted-foreground'>{po.supplier.phone}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className='whitespace-nowrap text-sm'>
                          {formatBusinessDate(po.orderDate)}
                        </TableCell>
                        <TableCell className='whitespace-nowrap text-sm'>
                          {po.expectedDeliveryDate
                            ? formatBusinessDate(po.expectedDeliveryDate)
                            : '—'}
                        </TableCell>
                        <TableCell>
                          <Badge variant='outline'>{(po.items || []).length}</Badge>
                        </TableCell>
                        <TableCell className='min-w-[140px]'>
                          <div className='flex items-center gap-2'>
                            <Progress value={progress.pct} className='h-2 flex-1' />
                            <span className='text-xs text-muted-foreground tabular-nums'>
                              {progress.received}/{progress.ordered}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className='text-right tabular-nums'>
                          Rs {Number(po.totalAmount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </TableCell>
                        <TableCell>
                          <Badge className={STATUS_STYLES[po.status]} variant='secondary'>
                            {STATUS_LABELS[po.status]}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className='flex items-center justify-end gap-1'>
                            <Button variant='ghost' size='sm' onClick={() => onView(po)} title='View'>
                              <Eye className='h-4 w-4' />
                            </Button>
                            {canReceive ? (
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => onReceive(po)}
                                title='Receive items'
                                className='text-emerald-600 hover:text-emerald-700'
                              >
                                <PackageCheck className='h-4 w-4' />
                              </Button>
                            ) : null}
                            {canEdit ? (
                              <Button variant='ghost' size='sm' onClick={() => onEdit(po)} title='Edit'>
                                <Edit className='h-4 w-4' />
                              </Button>
                            ) : null}
                            {canSend ? (
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => handleSend(po)}
                                disabled={isSending}
                                title='Mark as sent'
                                className='text-blue-600 hover:text-blue-700'
                              >
                                <Send className='h-4 w-4' />
                              </Button>
                            ) : null}
                            {canCancel ? (
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setPoToCancel(po)}
                                title='Cancel'
                                className='text-amber-600 hover:text-amber-700'
                              >
                                <X className='h-4 w-4' />
                              </Button>
                            ) : null}
                            {canDelete ? (
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setPoToDelete(po)}
                                title='Delete'
                                className='text-destructive hover:text-destructive'
                              >
                                <Trash2 className='h-4 w-4' />
                              </Button>
                            ) : null}
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Pagination */}
          {totalResults > 0 ? (
            <div className='mt-4 flex flex-col gap-3 border-t px-2 pt-4 sm:flex-row sm:items-center sm:justify-between'>
              <div className='text-sm text-muted-foreground'>
                Page {page} of {totalPages} · {totalResults} orders
              </div>
              <div className='flex items-center gap-2'>
                <Label htmlFor='po-page-size' className='whitespace-nowrap text-sm'>
                  Rows:
                </Label>
                <Select value={String(limit)} onValueChange={(v) => setLimit(Number(v))}>
                  <SelectTrigger id='po-page-size' className='w-20'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='10'>10</SelectItem>
                    <SelectItem value='20'>20</SelectItem>
                    <SelectItem value='50'>50</SelectItem>
                    <SelectItem value='100'>100</SelectItem>
                  </SelectContent>
                </Select>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Previous
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* Cancel dialog */}
      <AlertDialog open={!!poToCancel} onOpenChange={(o) => !o && setPoToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel purchase order</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel order {poToCancel?.orderNumber}? You can optionally
              record a reason. Cancelled orders cannot be reopened.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className='py-2'>
            <Label htmlFor='po-cancel-reason'>Reason (optional)</Label>
            <Input
              id='po-cancel-reason'
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder='e.g. supplier out of stock'
              className='mt-2'
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmCancel}
              disabled={isCancelling}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {isCancelling ? 'Cancelling...' : 'Cancel order'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete dialog */}
      <AlertDialog open={!!poToDelete} onOpenChange={(o) => !o && setPoToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete purchase order</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete order {poToDelete?.orderNumber}. This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({
  label,
  value,
  accent,
  icon: Icon,
  active = false,
  onClick,
}: {
  label: string
  value: string | number
  accent: string
  icon: React.ComponentType<{ className?: string }>
  active?: boolean
  onClick?: () => void
}) {
  return (
    <Card
      role='button'
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.()
        }
      }}
      className={cn(
        'cursor-pointer transition-all hover:shadow-md hover:border-primary/40',
        active && 'border-primary ring-2 ring-primary/30 shadow-md',
      )}
    >
      <CardContent className='flex items-center gap-3 p-4'>
        <div className={`flex h-10 w-10 items-center justify-center rounded-md ${accent}`}>
          <Icon className='h-5 w-5' />
        </div>
        <div className='min-w-0'>
          <p className='text-xs text-muted-foreground truncate'>{label}</p>
          <p className='text-lg font-semibold leading-tight tabular-nums truncate'>{value}</p>
        </div>
      </CardContent>
    </Card>
  )
}

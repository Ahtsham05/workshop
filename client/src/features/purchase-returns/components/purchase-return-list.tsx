import { useState, useEffect } from 'react'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { Plus, Search, Eye, Trash2, CheckCircle, XCircle, ArrowRightLeft } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
  useGetPurchaseReturnsQuery,
  useUpdatePurchaseReturnStatusMutation,
  useDeletePurchaseReturnMutation,
  useGetSalesReturnsQuery,
  type PurchaseReturn,
  type SalesReturn,
} from '@/stores/returns.api'

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-800',
}

const refundColors: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800',
  bank: 'bg-blue-100 text-blue-800',
  adjustment: 'bg-purple-100 text-purple-800',
}

interface PurchaseReturnListProps {
  onCreateNew: () => void
  onConvertSalesReturn: (sr: SalesReturn) => void
}

export default function PurchaseReturnList({ onCreateNew, onConvertSalesReturn }: PurchaseReturnListProps) {
  const [activeTab, setActiveTab] = useState<'purchase-returns' | 'pending-customer-returns'>('purchase-returns')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [selectedReturn, setSelectedReturn] = useState<PurchaseReturn | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<PurchaseReturn | null>(null)

  // ── Pending customer returns ──────────────────────────────────────────
  const [srSearch, setSrSearch] = useState('')
  const [debouncedSrSearch, setDebouncedSrSearch] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSrSearch(srSearch), 400)
    return () => clearTimeout(t)
  }, [srSearch])

  const { data: pendingSalesReturns, isLoading: srLoading } = useGetSalesReturnsQuery(
    { status: 'approved', convertedToPurchaseReturn: false, search: debouncedSrSearch, limit: 20 },
    { skip: activeTab !== 'pending-customer-returns' }
  )

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 400)
    return () => clearTimeout(t)
  }, [search])

  const queryParams: Record<string, unknown> = {
    page: currentPage,
    limit: 10,
    ...(debouncedSearch && { search: debouncedSearch }),
    ...(statusFilter !== 'all' && { status: statusFilter }),
  }

  const { data, isLoading } = useGetPurchaseReturnsQuery(queryParams)
  const [updateStatus] = useUpdatePurchaseReturnStatusMutation()
  const [deleteReturn, { isLoading: isDeleting }] = useDeletePurchaseReturnMutation()

  const handleApprove = async (id: string) => {
    try {
      await updateStatus({ id, status: 'approved' }).unwrap()
      toast.success('Return approved')
    } catch {
      toast.error('Failed to approve return')
    }
  }

  const handleReject = async (id: string) => {
    try {
      await updateStatus({ id, status: 'rejected' }).unwrap()
      toast.success('Return rejected')
    } catch {
      toast.error('Failed to reject return')
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteReturn(deleteTarget._id || deleteTarget.id).unwrap()
      toast.success('Return deleted')
      setDeleteTarget(null)
    } catch {
      toast.error('Failed to delete return')
    }
  }

  const returns = data?.results ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <div className='space-y-4'>
      <div className='flex items-center justify-between'>
        <h2 className='text-2xl font-bold'>Purchase Returns</h2>
        <Button onClick={onCreateNew}>
          <Plus className='mr-2 h-4 w-4' />
          New Return
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as typeof activeTab)}>
        <TabsList>
          <TabsTrigger value='purchase-returns'>Purchase Returns</TabsTrigger>
          <TabsTrigger value='pending-customer-returns'>
            Pending Customer Returns
            {pendingSalesReturns?.totalResults
              ? ` (${pendingSalesReturns.totalResults})`
              : ''}
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Purchase Returns ─────────────────────────────────────── */}
        <TabsContent value='purchase-returns' className='space-y-4 mt-4'>
      <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-sm text-muted-foreground'>Total Returns</p>
            <p className='text-2xl font-bold'>{data?.totalResults ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-sm text-muted-foreground'>Total Amount</p>
            <p className='text-2xl font-bold'>
              PKR{' '}
              {returns
                .reduce((sum, r) => sum + r.totalAmount, 0)
                .toLocaleString()}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className='pt-6'>
            <p className='text-sm text-muted-foreground'>Items Returned</p>
            <p className='text-2xl font-bold'>
              {returns.reduce((sum, r) => sum + r.items.reduce((s, i) => s + i.quantity, 0), 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className='pt-4'>
          <div className='flex flex-col gap-3 sm:flex-row'>
            <div className='relative flex-1'>
              <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                className='pl-9'
                placeholder='Search returns...'
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={statusFilter}
              onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}
            >
              <SelectTrigger className='w-40'>
                <SelectValue placeholder='Status' />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='all'>All Status</SelectItem>
                <SelectItem value='pending'>Pending</SelectItem>
                <SelectItem value='approved'>Approved</SelectItem>
                <SelectItem value='rejected'>Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardContent className='p-0'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Return #</TableHead>
                <TableHead>Purchase</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Items</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Refund</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={9} className='py-8 text-center text-muted-foreground'>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : returns.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className='py-8 text-center text-muted-foreground'>
                    No purchase returns found
                  </TableCell>
                </TableRow>
              ) : (
                returns.map((ret) => (
                  <TableRow key={ret._id || ret.id}>
                    <TableCell className='font-medium'>{ret.returnNumber}</TableCell>
                    <TableCell>
                      {typeof ret.purchaseId === 'object'
                        ? (ret.purchaseId as any)?.purchaseNumber ||
                          (ret.purchaseId as any)?.invoiceNumber
                        : ret.purchaseId}
                    </TableCell>
                    <TableCell>
                      {typeof ret.supplierId === 'object'
                        ? (ret.supplierId as any)?.name
                        : '—'}
                    </TableCell>
                    <TableCell>{ret.items.reduce((s, i) => s + i.quantity, 0)}</TableCell>
                    <TableCell>PKR {ret.totalAmount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={refundColors[ret.refundMethod] ?? ''}>
                        {ret.refundMethod}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={statusColors[ret.status ?? 'approved'] ?? ''}>
                        {ret.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {ret.date ? format(new Date(ret.date), 'dd MMM yyyy') : '—'}
                    </TableCell>
                    <TableCell>
                      <div className='flex items-center gap-1'>
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7'
                          onClick={() => setSelectedReturn(ret)}
                          title='View'
                        >
                          <Eye className='h-3 w-3' />
                        </Button>
                        {ret.status === 'pending' && (
                          <>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-7 w-7 text-green-600'
                              onClick={() => handleApprove(ret._id || ret.id)}
                              title='Approve'
                            >
                              <CheckCircle className='h-3 w-3' />
                            </Button>
                            <Button
                              variant='ghost'
                              size='icon'
                              className='h-7 w-7 text-destructive'
                              onClick={() => handleReject(ret._id || ret.id)}
                              title='Reject'
                            >
                              <XCircle className='h-3 w-3' />
                            </Button>
                          </>
                        )}
                        <Button
                          variant='ghost'
                          size='icon'
                          className='h-7 w-7 text-destructive'
                          onClick={() => setDeleteTarget(ret)}
                          title='Delete'
                        >
                          <Trash2 className='h-3 w-3' />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className='flex items-center justify-between'>
          <p className='text-sm text-muted-foreground'>
            Page {currentPage} of {totalPages}
          </p>
          <div className='flex gap-2'>
            <Button
              variant='outline'
              size='sm'
              disabled={currentPage === 1}
              onClick={() => setCurrentPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              variant='outline'
              size='sm'
              disabled={currentPage === totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
        </TabsContent>

        {/* ── Tab: Pending Customer Returns ─────────────────────────────── */}
        <TabsContent value='pending-customer-returns' className='space-y-4 mt-4'>
          <Card>
            <CardContent className='pt-4'>
              <p className='text-sm text-muted-foreground mb-3'>
                These are <strong>approved sales returns</strong> from customers that need to be
                sent back to the supplier. Click <strong>Convert</strong> to create a purchase
                return.
              </p>
              <div className='relative'>
                <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  className='pl-9'
                  placeholder='Search by return number or customer...'
                  value={srSearch}
                  onChange={(e) => setSrSearch(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className='p-0'>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Return #</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Items</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {srLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className='py-8 text-center text-muted-foreground'>
                        Loading...
                      </TableCell>
                    </TableRow>
                  ) : (pendingSalesReturns?.results ?? []).length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className='py-8 text-center text-muted-foreground'>
                        No approved customer returns pending supplier return
                      </TableCell>
                    </TableRow>
                  ) : (
                    (pendingSalesReturns?.results ?? []).map((sr) => (
                      <TableRow key={sr._id || sr.id}>
                        <TableCell className='font-medium'>{sr.returnNumber}</TableCell>
                        <TableCell>
                          {sr.customerName ||
                            (typeof sr.customerId === 'object'
                              ? (sr.customerId as any)?.name
                              : '—')}
                        </TableCell>
                        <TableCell>
                          {sr.items.reduce((s, i) => s + i.quantity, 0)}
                        </TableCell>
                        <TableCell>PKR {sr.totalAmount.toLocaleString()}</TableCell>
                        <TableCell className='max-w-[160px] truncate text-muted-foreground'>
                          {sr.reason || '—'}
                        </TableCell>
                        <TableCell>
                          {sr.date ? format(new Date(sr.date), 'dd MMM yyyy') : '—'}
                        </TableCell>
                        <TableCell>
                          <Button
                            size='sm'
                            variant='outline'
                            className='gap-1 text-primary border-primary hover:bg-primary/5'
                            onClick={() => onConvertSalesReturn(sr)}
                          >
                            <ArrowRightLeft className='h-3 w-3' />
                            Convert
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Detail Dialog */}
      <Dialog open={!!selectedReturn} onOpenChange={() => setSelectedReturn(null)}>
        <DialogContent className='max-w-2xl'>
          <DialogHeader>
            <DialogTitle>Return Details — {selectedReturn?.returnNumber}</DialogTitle>
          </DialogHeader>
          {selectedReturn && (
            <div className='space-y-4'>
              <div className='grid grid-cols-2 gap-3 text-sm'>
                <div>
                  <p className='text-muted-foreground'>Supplier</p>
                  <p className='font-medium'>
                    {typeof selectedReturn.supplierId === 'object'
                      ? (selectedReturn.supplierId as any)?.name
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Refund Method</p>
                  <p className='font-medium capitalize'>{selectedReturn.refundMethod}</p>
                </div>
                <div>
                  <p className='text-muted-foreground'>Status</p>
                  <Badge className={statusColors[selectedReturn.status ?? 'approved'] ?? ''}>
                    {selectedReturn.status}
                  </Badge>
                </div>
                <div>
                  <p className='text-muted-foreground'>Date</p>
                  <p className='font-medium'>
                    {selectedReturn.date
                      ? format(new Date(selectedReturn.date), 'dd MMM yyyy')
                      : '—'}
                  </p>
                </div>
                {selectedReturn.reason && (
                  <div className='col-span-2'>
                    <p className='text-muted-foreground'>Reason</p>
                    <p>{selectedReturn.reason}</p>
                  </div>
                )}
                {selectedReturn.damageDescription && (
                  <div className='col-span-2'>
                    <p className='text-muted-foreground'>Damage Description</p>
                    <p>{selectedReturn.damageDescription}</p>
                  </div>
                )}
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Cost Price</TableHead>
                    <TableHead>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedReturn.items.map((item, i) => (
                    <TableRow key={i}>
                      <TableCell>{item.name}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>
                        PKR {(item.costPrice ?? 0).toLocaleString()}
                      </TableCell>
                      <TableCell>PKR {item.total.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className='text-right font-semibold'>
                Total: PKR {selectedReturn.totalAmount.toLocaleString()}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Return</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete return{' '}
              <strong>{deleteTarget?.returnNumber}</strong>? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className='bg-destructive hover:bg-destructive/90'
              onClick={handleDelete}
              disabled={isDeleting}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

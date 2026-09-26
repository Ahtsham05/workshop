import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, ExternalLink, FileText, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import {
  billingErrorMessage,
  METHOD_LABELS,
  useAdminApproveManualPaymentMutation,
  useAdminGetManualPaymentQuery,
  useAdminListManualPaymentsQuery,
  useAdminRejectManualPaymentMutation,
  type ManualPayment,
} from '@/stores/billing.api'
import { formatDate, formatPkr, formatUsd } from '@/features/settings/billing/format'

const STATUS_TONE: Record<ManualPayment['status'], string> = {
  pending: 'bg-amber-600 text-white',
  approved: 'bg-emerald-600 text-white',
  rejected: 'bg-red-600 text-white',
}

const orgName = (p: ManualPayment) => (typeof p.organizationId === 'object' ? p.organizationId?.name : '—') || '—'
const submitterEmail = (p: ManualPayment) => (typeof p.submittedBy === 'object' ? p.submittedBy?.email : '') || ''

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <p className='text-muted-foreground text-xs'>{label}</p>
      <div className='text-sm break-words'>{children}</div>
    </div>
  )
}

function ReviewDialog({ id, onClose }: { id: string; onClose: () => void }) {
  // Fetched fresh each time the dialog opens: the proof URL is signed and expires.
  const { data: p, isFetching, refetch } = useAdminGetManualPaymentQuery(id, { refetchOnMountOrArgChange: true })
  const [approve, { isLoading: approving }] = useAdminApproveManualPaymentMutation()
  const [reject, { isLoading: rejecting }] = useAdminRejectManualPaymentMutation()
  const [showReject, setRejecting] = useState(false)
  const [reason, setReason] = useState('')

  const handleApprove = async () => {
    try {
      const res = await approve(id).unwrap()
      toast.success(`Approved — receipt ${res.receiptNumber}`)
      onClose()
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const handleReject = async () => {
    if (reason.trim().length < 5) {
      toast.error('Give the customer a clear reason (at least 5 characters)')
      return
    }
    try {
      await reject({ id, reason: reason.trim() }).unwrap()
      toast.success('Rejected — the customer has been emailed the reason')
      onClose()
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const isPdf = p?.proof?.mimeType === 'application/pdf'

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className='max-h-[92vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>Review payment {p?.reference ?? ''}</DialogTitle>
          <DialogDescription>Check the proof against your bank / wallet statement before approving.</DialogDescription>
        </DialogHeader>
        {!p || isFetching ? (
          <Skeleton className='h-80 w-full' />
        ) : (
          <div className='grid grid-cols-1 gap-4 md:grid-cols-2'>
            <div className='space-y-3'>
              <div className='grid grid-cols-2 gap-3'>
                <Field label='Organization'>{orgName(p)}</Field>
                <Field label='Submitted by'>{submitterEmail(p)}</Field>
                <Field label='Plan'>
                  <span className='capitalize'>{p.planKey}</span> × {p.months} mo ({formatUsd(p.usdAmount)})
                </Field>
                <Field label='Method'>{METHOD_LABELS[p.method]}</Field>
                <Field label='Expected'>{formatPkr(p.amountPkr)}</Field>
                <Field label='Customer says paid'>
                  <span className={p.amountMismatch ? 'font-semibold text-red-600' : ''}>{formatPkr(p.paidAmountPkr)}</span>
                </Field>
                <Field label='Transaction ID'>
                  <span className='font-mono'>{p.transactionId}</span>
                </Field>
                <Field label='Payer name'>{p.payerName}</Field>
                <Field label='Paid on'>{formatDate(p.paidOn)}</Field>
                <Field label='Submitted'>{formatDate(p.createdAt)}</Field>
                <Field label='Rate used'>PKR {p.pkrPerUsd}/USD</Field>
                <Field label='Status'>
                  <Badge className={STATUS_TONE[p.status]}>{p.status}</Badge>
                </Field>
              </div>
              {p.amountMismatch && (
                <p className='flex items-start gap-1.5 text-sm text-red-600'>
                  <AlertTriangle className='mt-0.5 h-4 w-4 shrink-0' /> Paid amount is less than the quoted amount.
                </p>
              )}
              {p.status === 'approved' && (
                <p className='text-sm'>
                  Receipt <span className='font-mono'>{p.receiptNumber}</span> · applied as {p.appliedAs} · paid through{' '}
                  {formatDate(p.appliedPeriodEnd)}
                </p>
              )}
              {p.status === 'rejected' && <p className='text-destructive text-sm'>Rejected: {p.rejectionReason}</p>}
              {showReject && (
                <div className='space-y-1.5'>
                  <Label htmlFor='reject-reason'>Reason (sent to the customer)</Label>
                  <Textarea
                    id='reject-reason'
                    rows={3}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder='e.g. The amount has not arrived in our account. Please check the transaction ID.'
                  />
                </div>
              )}
            </div>
            <div className='space-y-2'>
              <div className='flex items-center justify-between gap-2'>
                <p className='text-sm font-medium'>Proof</p>
                <div className='flex gap-1'>
                  <Button variant='ghost' size='sm' onClick={() => refetch()}>
                    Refresh link
                  </Button>
                  {p.proofUrl && (
                    <Button variant='outline' size='sm' asChild>
                      <a href={p.proofUrl} target='_blank' rel='noreferrer noopener'>
                        <ExternalLink className='mr-1 h-3.5 w-3.5' /> Open
                      </a>
                    </Button>
                  )}
                </div>
              </div>
              {p.proofUrl && !isPdf && (
                <img
                  src={p.proofUrl}
                  alt={`Payment proof for ${p.reference}`}
                  className='max-h-[60vh] w-full rounded-md border object-contain'
                  referrerPolicy='no-referrer'
                />
              )}
              {p.proofUrl && isPdf && (
                <a
                  href={p.proofUrl}
                  target='_blank'
                  rel='noreferrer noopener'
                  className='hover:bg-muted/50 flex items-center gap-2 rounded-md border p-4 text-sm'
                >
                  <FileText className='h-5 w-5' /> PDF proof — open in a new tab
                </a>
              )}
              <p className='text-muted-foreground text-xs'>
                This link is private and expires in {Math.round((p.proofUrlExpiresInSeconds ?? 300) / 60)} minutes.
              </p>
            </div>
          </div>
        )}
        {p?.status === 'pending' && (
          <DialogFooter className='flex-col-reverse gap-2 sm:flex-row'>
            {showReject ? (
              <>
                <Button variant='outline' onClick={() => setRejecting(false)}>
                  Back
                </Button>
                <Button variant='destructive' onClick={handleReject} disabled={rejecting}>
                  {rejecting ? 'Rejecting…' : 'Reject and email reason'}
                </Button>
              </>
            ) : (
              <>
                <Button variant='outline' onClick={() => setRejecting(true)}>
                  Reject…
                </Button>
                <Button onClick={handleApprove} disabled={approving}>
                  {approving ? 'Approving…' : 'Approve and activate'}
                </Button>
              </>
            )}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function ManualPaymentsQueue() {
  const [status, setStatus] = useState<string>('pending')
  const [method, setMethod] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [reviewId, setReviewId] = useState<string | null>(null)

  const { data, isLoading, isFetching } = useAdminListManualPaymentsQuery({
    status: status === 'all' ? undefined : status,
    method: method === 'all' ? undefined : method,
    search: search.trim() || undefined,
    page,
    limit: 20,
  })
  const rows = data?.results ?? []

  return (
    <Card>
      <CardHeader className='gap-3'>
        <div>
          <CardTitle>Manual payments</CardTitle>
          <CardDescription>
            Bank, JazzCash and Easypaisa payments from Pakistani customers. Pending items are oldest first.
          </CardDescription>
        </div>
        <div className='flex flex-wrap gap-2'>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
            <SelectTrigger className='w-[9.5rem]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='pending'>Pending</SelectItem>
              <SelectItem value='approved'>Approved</SelectItem>
              <SelectItem value='rejected'>Rejected</SelectItem>
              <SelectItem value='all'>All statuses</SelectItem>
            </SelectContent>
          </Select>
          <Select value={method} onValueChange={(v) => { setMethod(v); setPage(1) }}>
            <SelectTrigger className='w-[10rem]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value='all'>All methods</SelectItem>
              {Object.entries(METHOD_LABELS).map(([k, label]) => (
                <SelectItem key={k} value={k}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className='relative min-w-0 flex-1 basis-56'>
            <Search className='text-muted-foreground absolute top-2.5 left-2.5 h-4 w-4' />
            <Input
              className='pl-8'
              placeholder='Reference, transaction ID, payer or organization'
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className='overflow-x-auto'>
        {isLoading ? (
          <Skeleton className='h-40 w-full' />
        ) : rows.length === 0 ? (
          <p className='text-muted-foreground py-8 text-center text-sm'>No payments match these filters.</p>
        ) : (
          <Table className={isFetching ? 'opacity-60' : ''}>
            <TableHeader>
              <TableRow>
                <TableHead>Submitted</TableHead>
                <TableHead>Organization</TableHead>
                <TableHead>Reference / Txn</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead className='text-right'>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className='whitespace-nowrap'>{formatDate(p.createdAt)}</TableCell>
                  <TableCell className='max-w-[14rem] truncate'>{orgName(p)}</TableCell>
                  <TableCell className='font-mono text-xs whitespace-nowrap'>
                    {p.reference}
                    <div className='text-muted-foreground'>
                      {METHOD_LABELS[p.method]} · {p.transactionId}
                    </div>
                  </TableCell>
                  <TableCell className='whitespace-nowrap capitalize'>
                    {p.planKey} × {p.months}
                  </TableCell>
                  <TableCell className='text-right whitespace-nowrap tabular-nums'>
                    {formatPkr(p.paidAmountPkr)}
                    {p.paidAmountPkr < p.amountPkr && (
                      <div className='text-xs text-red-600'>expected {formatPkr(p.amountPkr)}</div>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge className={STATUS_TONE[p.status]}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant={p.status === 'pending' ? 'default' : 'outline'} onClick={() => setReviewId(p.id)}>
                      {p.status === 'pending' ? 'Review' : 'View'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {data && data.totalPages > 1 && (
          <div className='mt-3 flex items-center justify-end gap-2 text-sm'>
            <Button variant='outline' size='sm' disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>
              Previous
            </Button>
            <span className='text-muted-foreground'>
              Page {data.page} of {data.totalPages}
            </span>
            <Button variant='outline' size='sm' disabled={page >= data.totalPages} onClick={() => setPage((n) => n + 1)}>
              Next
            </Button>
          </div>
        )}
      </CardContent>
      {reviewId && <ReviewDialog id={reviewId} onClose={() => setReviewId(null)} />}
    </Card>
  )
}

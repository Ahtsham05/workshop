import { useState } from 'react'
import { format } from 'date-fns'
import {
  CheckCircle2,
  XCircle,
  Clock,
  Eye,
  Building2,
  Users,
  CreditCard,
  TrendingUp,
  Loader2,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
  Calendar,
  Mail,
  Phone,
  Globe,
  ArrowLeft,
  Shield,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  useAdminGetAllPaymentsQuery,
  useAdminGetDashboardQuery,
  useAdminApprovePaymentMutation,
  useAdminRejectPaymentMutation,
  useAdminGetAllOrganizationsQuery,
  useAdminGetOrganizationQuery,
  type Payment,
} from '@/stores/subscription.api'

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  single: 'Single Shop',
  multi: 'Multi Branch',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'approved' || status === 'active')
    return (
      <Badge className='bg-green-100 text-green-700 border-green-200'>
        <CheckCircle2 className='h-3 w-3 mr-1' /> {status === 'active' ? 'Active' : 'Approved'}
      </Badge>
    )
  if (status === 'rejected' || status === 'expired')
    return (
      <Badge className='bg-red-100 text-red-700 border-red-200'>
        <XCircle className='h-3 w-3 mr-1' /> {status === 'expired' ? 'Expired' : 'Rejected'}
      </Badge>
    )
  return (
    <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200'>
      <Clock className='h-3 w-3 mr-1' /> Pending
    </Badge>
  )
}

function getOrgName(p: Payment): string {
  if (!p.organizationId) return '—'
  if (typeof p.organizationId === 'object') return p.organizationId.name as string
  return String(p.organizationId)
}

function getUserName(p: Payment): string {
  if (!p.userId) return '—'
  if (typeof p.userId === 'object') return (p.userId as { name: string }).name
  return String(p.userId)
}

function safeFormat(date: string | undefined | null): string {
  if (!date) return '—'
  try {
    const d = new Date(date)
    if (isNaN(d.getTime())) return '—'
    return format(d, 'MMM dd, yyyy')
  } catch {
    return '—'
  }
}

// ─── Org Detail Panel ────────────────────────────────────────────────────────
function OrgDetailPanel({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const { data, isLoading } = useAdminGetOrganizationQuery(orgId)
  const org = data?.organization
  const payments = data?.payments ?? []

  if (isLoading) {
    return (
      <div className='space-y-4'>
        <Skeleton className='h-8 w-48' />
        <div className='grid grid-cols-2 gap-4'>
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className='h-28' />)}
        </div>
        <Skeleton className='h-48' />
      </div>
    )
  }

  if (!org) return <p className='text-muted-foreground text-sm'>Organization not found.</p>

  const sub = org.subscription

  return (
    <div className='space-y-6'>
      {/* Back button + header */}
      <div className='flex items-center gap-3'>
        <Button variant='ghost' size='sm' onClick={onBack}>
          <ArrowLeft className='h-4 w-4 mr-1' /> Back
        </Button>
        <div>
          <h2 className='text-xl font-bold'>{org.name}</h2>
          <p className='text-sm text-muted-foreground capitalize'>{org.businessType}</p>
        </div>
      </div>

      {/* Org info + subscription cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Contact info */}
        <Card className='md:col-span-1'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm'>Organization Info</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2 text-sm'>
            {org.owner && (
              <div className='flex items-center gap-2 text-muted-foreground'>
                <Users className='h-3.5 w-3.5' />
                <span>Owner: <span className='text-foreground font-medium'>{org.owner.name}</span></span>
              </div>
            )}
            {org.email && (
              <div className='flex items-center gap-2 text-muted-foreground'>
                <Mail className='h-3.5 w-3.5' /> {org.email}
              </div>
            )}
            {org.phone && (
              <div className='flex items-center gap-2 text-muted-foreground'>
                <Phone className='h-3.5 w-3.5' /> {org.phone}
              </div>
            )}
            {org.website && (
              <div className='flex items-center gap-2 text-muted-foreground'>
                <Globe className='h-3.5 w-3.5' />
                <a href={org.website} target='_blank' rel='noopener noreferrer' className='text-primary hover:underline'>
                  {org.website}
                </a>
              </div>
            )}
            {(org.city || org.country) && (
              <p className='text-muted-foreground'>{[org.city, org.country].filter(Boolean).join(', ')}</p>
            )}
            <Separator />
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Users className='h-3.5 w-3.5' />
              <span>Total users: <span className='text-foreground font-medium'>{data?.totalUsers ?? 0}</span></span>
            </div>
            <div className='flex items-center gap-2 text-muted-foreground'>
              <Calendar className='h-3.5 w-3.5' />
              <span>Joined: <span className='text-foreground'>{safeFormat(org.createdAt)}</span></span>
            </div>
          </CardContent>
        </Card>

        {/* Subscription */}
        <Card className='md:col-span-2'>
          <CardHeader className='pb-2'>
            <CardTitle className='text-sm flex items-center gap-2'>
              <Shield className='h-4 w-4' /> Subscription
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
              <div>
                <p className='text-xs text-muted-foreground'>Plan</p>
                <p className='font-semibold'>{PLAN_LABELS[sub?.planType] ?? sub?.planType ?? '—'}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Status</p>
                <StatusBadge status={sub?.status ?? 'pending'} />
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Start Date</p>
                <p className='font-medium text-sm'>{sub?.startDate ? format(new Date(sub.startDate), 'MMM dd, yyyy') : '—'}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>End Date</p>
                <p className='font-medium text-sm'>{sub?.endDate ? format(new Date(sub.endDate), 'MMM dd, yyyy') : '—'}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Trial</p>
                <p className='font-medium text-sm'>{sub?.isTrial ? 'Yes' : 'No'}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Max Org (Branches)</p>
                <p className='font-medium text-sm'>{sub?.limits?.maxBranches ?? '—'}</p>
              </div>
              <div>
                <p className='text-xs text-muted-foreground'>Max Users</p>
                <p className='font-medium text-sm'>{sub?.limits?.maxUsers ?? '—'}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <CardTitle className='text-base flex items-center gap-2'>
            <CreditCard className='h-4 w-4' /> Billing History
          </CardTitle>
          <CardDescription>{payments.length} payment(s) on record</CardDescription>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <p className='text-sm text-muted-foreground py-4 text-center'>No payments yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Months</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Transaction</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Proof</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p: Payment) => (
                  <TableRow key={p.id}>
                    <TableCell className='text-xs text-muted-foreground'>
                      {safeFormat(p.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant='outline'>{PLAN_LABELS[p.planType] ?? p.planType}</Badge>
                    </TableCell>
                    <TableCell>{p.months}</TableCell>
                    <TableCell className='font-semibold'>PKR {p.amount.toLocaleString()}</TableCell>
                    <TableCell className='text-xs font-mono'>{p.transactionId ?? '—'}</TableCell>
                    <TableCell><StatusBadge status={p.status} /></TableCell>
                    <TableCell>
                      {p.screenshotUrl ? (
                        <a href={p.screenshotUrl} target='_blank' rel='noopener noreferrer' className='inline-flex items-center gap-1 text-xs text-primary hover:underline'>
                          <ExternalLink className='h-3 w-3' /> View
                        </a>
                      ) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ─── Organizations List ───────────────────────────────────────────────────────
function OrganizationsTab({ onSelectOrg }: { onSelectOrg: (id: string) => void }) {
  const { data, isLoading } = useAdminGetAllOrganizationsQuery({ limit: 50 })
  const orgs = data?.results ?? []

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <Building2 className='h-4 w-4' /> All Organizations
        </CardTitle>
        <CardDescription>{data?.totalResults ?? 0} organizations registered</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-14' />)}</div>
        ) : orgs.length === 0 ? (
          <p className='text-sm text-muted-foreground text-center py-8'>No organizations found.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Business Type</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Sub Status</TableHead>
                <TableHead>Trial</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className='text-right'>Details</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orgs.map((org: any) => (
                <TableRow key={org.id}>
                  <TableCell className='font-medium'>{org.name}</TableCell>
                  <TableCell className='text-sm text-muted-foreground'>
                    {typeof org.owner === 'object' ? org.owner?.name : '—'}
                  </TableCell>
                  <TableCell className='capitalize text-sm'>{org.businessType ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant='outline'>{PLAN_LABELS[org.subscription?.planType] ?? org.subscription?.planType ?? '—'}</Badge>
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={org.subscription?.status ?? 'pending'} />
                  </TableCell>
                  <TableCell className='text-sm'>{org.subscription?.isTrial ? 'Yes' : 'No'}</TableCell>
                  <TableCell className='text-xs text-muted-foreground'>
                    {org.createdAt ? safeFormat(org.createdAt) : '—'}
                  </TableCell>
                  <TableCell className='text-right'>
                    <Button size='sm' variant='ghost' onClick={() => onSelectOrg(org.id)}>
                      <Eye className='h-3.5 w-3.5 mr-1' /> View
                      <ChevronRight className='h-3.5 w-3.5 ml-1' />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main Admin Page ──────────────────────────────────────────────────────────
export default function AdminPaymentsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [approveDialogOpen, setApproveDialogOpen] = useState(false)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [page] = useState(1)

  const paymentsQuery = useAdminGetAllPaymentsQuery({
    status: statusFilter === 'all' ? undefined : statusFilter,
    page,
    limit: 20,
  })

  const dashboardQuery = useAdminGetDashboardQuery()

  const [approvePayment, { isLoading: isApproving }] = useAdminApprovePaymentMutation()
  const [rejectPayment, { isLoading: isRejecting }] = useAdminRejectPaymentMutation()

  const stats = dashboardQuery.data?.stats
  const payments = paymentsQuery.data?.results ?? []

  const handleApprove = async () => {
    if (!selectedPayment) return
    try {
      await approvePayment(selectedPayment.id).unwrap()
      toast.success(`Payment approved. Subscription activated for ${getOrgName(selectedPayment)}.`)
      setApproveDialogOpen(false)
      setSelectedPayment(null)
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed to approve payment')
    }
  }

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason.trim()) {
      toast.error('Please enter a rejection reason')
      return
    }
    try {
      await rejectPayment({ paymentId: selectedPayment.id, rejectionReason }).unwrap()
      toast.success('Payment rejected.')
      setRejectDialogOpen(false)
      setSelectedPayment(null)
      setRejectionReason('')
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed to reject payment')
    }
  }

  return (
    <div className='p-6 space-y-6'>
      {/* Header */}
      <div>
        <h1 className='text-2xl font-bold'>System Admin Dashboard</h1>
        <p className='text-muted-foreground'>Manage organizations, billing, and payment requests</p>
      </div>

      {/* Stats */}
      <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
        {[
          { title: 'Total Organizations', value: stats?.totalOrgs, icon: Building2, color: 'text-blue-600' },
          { title: 'Total Users', value: stats?.totalUsers, icon: Users, color: 'text-green-600' },
          { title: 'Pending Payments', value: stats?.pendingPayments, icon: Clock, color: 'text-yellow-600' },
          { title: 'Approved Payments', value: stats?.approvedPayments, icon: TrendingUp, color: 'text-purple-600' },
        ].map(({ title, value, color }) => (
          <Card key={title}>
            <CardHeader className='pb-2'>
              <CardDescription className='text-xs'>{title}</CardDescription>
            </CardHeader>
            <CardContent>
              {dashboardQuery.isLoading ? (
                <Skeleton className='h-8 w-16' />
              ) : (
                <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs defaultValue='payments'>
        <TabsList>
          <TabsTrigger value='payments' className='flex items-center gap-1'>
            <CreditCard className='h-3.5 w-3.5' /> Payment Requests
          </TabsTrigger>
          <TabsTrigger value='organizations' className='flex items-center gap-1'>
            <Building2 className='h-3.5 w-3.5' /> Organizations
          </TabsTrigger>
        </TabsList>

        {/* ── Payments tab ── */}
        <TabsContent value='payments' className='mt-4'>
          <Card>
            <CardHeader>
              <div className='flex items-center justify-between flex-wrap gap-3'>
                <div>
                  <CardTitle className='flex items-center gap-2'>
                    <CreditCard className='h-4 w-4' /> Payment Requests
                  </CardTitle>
                  <CardDescription>{paymentsQuery.data?.totalResults ?? 0} total requests</CardDescription>
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className='w-40'>
                    <SelectValue placeholder='Filter by status' />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value='all'>All Statuses</SelectItem>
                    <SelectItem value='pending'>Pending</SelectItem>
                    <SelectItem value='approved'>Approved</SelectItem>
                    <SelectItem value='rejected'>Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {paymentsQuery.isLoading ? (
                <div className='space-y-2'>{[1, 2, 3].map((i) => <Skeleton key={i} className='h-14' />)}</div>
              ) : payments.length === 0 ? (
                <div className='flex flex-col items-center justify-center py-10 text-muted-foreground'>
                  <CreditCard className='h-10 w-10 mb-3' />
                  <p className='text-sm'>No payment requests found.</p>
                </div>
              ) : (
                <div className='overflow-x-auto'>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Organization</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Plan</TableHead>
                        <TableHead>Months</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Proof</TableHead>
                        <TableHead className='text-right'>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {payments.map((payment) => (
                        <TableRow key={payment.id}>
                          <TableCell className='font-medium'>
                            <button
                              className='hover:underline text-left text-primary'
                              onClick={() => {
                                const orgId = typeof payment.organizationId === 'object'
                                  ? (payment.organizationId as any).id
                                  : payment.organizationId
                                if (orgId) setSelectedOrgId(orgId)
                              }}
                            >
                              {getOrgName(payment)}
                            </button>
                          </TableCell>
                          <TableCell className='text-sm text-muted-foreground'>{getUserName(payment)}</TableCell>
                          <TableCell>
                            <Badge variant='outline'>{PLAN_LABELS[payment.planType] ?? payment.planType}</Badge>
                          </TableCell>
                          <TableCell>{payment.months}</TableCell>
                          <TableCell className='font-semibold'>PKR {payment.amount.toLocaleString()}</TableCell>
                          <TableCell className='text-xs text-muted-foreground'>
                            {safeFormat(payment.createdAt)}
                          </TableCell>
                          <TableCell><StatusBadge status={payment.status} /></TableCell>
                          <TableCell>
                            {payment.screenshotUrl ? (
                              <a href={payment.screenshotUrl} target='_blank' rel='noopener noreferrer' className='inline-flex items-center gap-1 text-xs text-primary hover:underline'>
                                <ExternalLink className='h-3 w-3' /> View
                              </a>
                            ) : payment.transactionId ? (
                              <span className='text-xs text-muted-foreground font-mono'>{payment.transactionId}</span>
                            ) : (
                              <span className='text-xs text-muted-foreground'>—</span>
                            )}
                          </TableCell>
                          <TableCell className='text-right'>
                            {payment.status === 'pending' ? (
                              <div className='flex items-center justify-end gap-2'>
                                <Button size='sm' variant='outline' className='text-green-600 border-green-300 hover:bg-green-50'
                                  onClick={() => { setSelectedPayment(payment); setApproveDialogOpen(true) }}>
                                  <CheckCircle2 className='h-3.5 w-3.5 mr-1' /> Approve
                                </Button>
                                <Button size='sm' variant='outline' className='text-red-600 border-red-300 hover:bg-red-50'
                                  onClick={() => { setSelectedPayment(payment); setRejectDialogOpen(true) }}>
                                  <XCircle className='h-3.5 w-3.5 mr-1' /> Reject
                                </Button>
                              </div>
                            ) : (
                              <Button size='sm' variant='ghost' onClick={() => setSelectedPayment(payment)}>
                                <Eye className='h-3.5 w-3.5' />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Organizations tab ── */}
        <TabsContent value='organizations' className='mt-4'>
          {selectedOrgId ? (
            <OrgDetailPanel orgId={selectedOrgId} onBack={() => setSelectedOrgId(null)} />
          ) : (
            <OrganizationsTab onSelectOrg={setSelectedOrgId} />
          )}
        </TabsContent>
      </Tabs>

      {/* Approve confirmation dialog */}
      <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <CheckCircle2 className='h-5 w-5 text-green-600' /> Approve Payment
            </DialogTitle>
            <DialogDescription>
              This will approve the payment and immediately activate the subscription for{' '}
              <strong>{selectedPayment ? getOrgName(selectedPayment) : '—'}</strong>.
            </DialogDescription>
          </DialogHeader>
          {selectedPayment && (
            <div className='space-y-2 p-3 bg-muted rounded-lg text-sm'>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Plan:</span>
                <span className='font-medium'>{PLAN_LABELS[selectedPayment.planType] ?? selectedPayment.planType}</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Duration:</span>
                <span className='font-medium'>{selectedPayment.months} month(s)</span>
              </div>
              <div className='flex justify-between'>
                <span className='text-muted-foreground'>Amount:</span>
                <span className='font-semibold'>PKR {selectedPayment.amount.toLocaleString()}</span>
              </div>
              {selectedPayment.transactionId && (
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Transaction ID:</span>
                  <span className='font-mono text-xs'>{selectedPayment.transactionId}</span>
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant='outline' onClick={() => setApproveDialogOpen(false)}>Cancel</Button>
            <Button className='bg-green-600 hover:bg-green-700' onClick={handleApprove} disabled={isApproving}>
              {isApproving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <CheckCircle2 className='mr-2 h-4 w-4' />}
              Confirm Approval
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className='flex items-center gap-2'>
              <XCircle className='h-5 w-5 text-red-600' /> Reject Payment
            </DialogTitle>
            <DialogDescription>Provide a reason for rejection. The organization will see this message.</DialogDescription>
          </DialogHeader>
          <div className='space-y-3'>
            <div className='flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg'>
              <AlertTriangle className='h-4 w-4 text-amber-600 shrink-0' />
              <p className='text-xs text-amber-700'>Rejection will NOT affect the organization's current subscription.</p>
            </div>
            <div className='space-y-1.5'>
              <Label htmlFor='rejReason'>Rejection Reason *</Label>
              <Textarea
                id='rejReason'
                placeholder='e.g. Payment amount does not match. Please transfer PKR 2,999 and resubmit.'
                rows={3}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant='outline' onClick={() => { setRejectDialogOpen(false); setRejectionReason('') }}>Cancel</Button>
            <Button variant='destructive' onClick={handleReject} disabled={isRejecting || !rejectionReason.trim()}>
              {isRejecting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <XCircle className='mr-2 h-4 w-4' />}
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}


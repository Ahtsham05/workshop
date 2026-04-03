import { Link } from '@tanstack/react-router'
import { format, differenceInDays } from 'date-fns'
import {
  Calendar,
  CheckCircle2,
  CreditCard,
  AlertTriangle,
  XCircle,
  GitBranch,
  Users,
  Clock,
  ArrowUpRight,
  History,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useGetSubscriptionUsageQuery } from '@/stores/organization.api'
import { useGetMyPaymentsQuery } from '@/stores/subscription.api'

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  single: 'Starter Plan',
  multi: 'Growth Plan',
  starter: 'Starter Plan',
  growth: 'Growth Plan',
  business: 'Business Plan',
  enterprise: 'Enterprise Plan',
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'active')
    return <Badge className='bg-green-100 text-green-700 border-green-200'>Active</Badge>
  if (status === 'expired')
    return <Badge className='bg-red-100 text-red-700 border-red-200'>Expired</Badge>
  return <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200'>Pending</Badge>
}

function PaymentStatusBadge({ status }: { status: string }) {
  if (status === 'approved')
    return <Badge className='bg-green-100 text-green-700 border-green-200'>Approved</Badge>
  if (status === 'rejected')
    return <Badge className='bg-red-100 text-red-700 border-red-200'>Rejected</Badge>
  return <Badge className='bg-yellow-100 text-yellow-700 border-yellow-200'>Pending</Badge>
}

export default function SubscriptionDashboard() {
  const { data: usageData, isLoading: usageLoading } = useGetSubscriptionUsageQuery()
  const { data: paymentsData, isLoading: paymentsLoading } = useGetMyPaymentsQuery({
    limit: 5,
  })

  const subscription = usageData?.subscription
  const branchesUsed = usageData?.branchesUsed ?? 0
  const usersUsed = usageData?.usersUsed ?? 0

  const daysRemaining = subscription?.endDate
    ? (() => { try { return differenceInDays(new Date(subscription.endDate), new Date()) } catch { return null } })()
    : null

  const branchPct = subscription?.limits?.maxBranches
    ? Math.min(100, (branchesUsed / subscription.limits.maxBranches) * 100)
    : 0

  const userPct = subscription?.limits?.maxUsers
    ? Math.min(100, (usersUsed / subscription.limits.maxUsers) * 100)
    : 0

  if (usageLoading) {
    return (
      <div className='p-6 space-y-4'>
        <Skeleton className='h-8 w-64' />
        <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className='h-36' />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className='p-6 space-y-6'>
      {/* Header */}
      <div className='flex items-center justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>Subscription</h1>
          <p className='text-muted-foreground'>Manage your plan and billing</p>
        </div>
        <div className='flex gap-2'>
          <Button variant='outline' asChild>
            <Link to='/subscription/pricing'>
              <ArrowUpRight className='mr-2 h-4 w-4' />
              View Plans
            </Link>
          </Button>
          {(subscription?.status !== 'active' || subscription?.isTrial) && (
            <Button asChild>
              <Link to='/subscription/payment' search={{ planType: undefined }}>
                <CreditCard className='mr-2 h-4 w-4' />
                Upgrade Plan
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Subscription expiry alert */}
      {daysRemaining !== null && daysRemaining <= 7 && subscription?.status === 'active' && (
        <div className='flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-800'>
          <AlertTriangle className='h-5 w-5 flex-shrink-0' />
          <p className='text-sm'>
            <strong>Your subscription expires in {daysRemaining} day(s).</strong> Renew now to avoid
            service interruption.
          </p>
          <Button size='sm' className='ml-auto' asChild>
            <Link to='/subscription/payment' search={{ planType: undefined }}>Renew</Link>
          </Button>
        </div>
      )}

      {subscription?.status === 'expired' && (
        <div className='flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg text-red-800'>
          <XCircle className='h-5 w-5 flex-shrink-0' />
          <p className='text-sm'>
            <strong>Your subscription has expired.</strong> Purchase a plan to continue using all
            features.
          </p>
          <Button size='sm' variant='destructive' className='ml-auto' asChild>
            <Link to='/subscription/payment' search={{ planType: undefined }}>Buy Plan</Link>
          </Button>
        </div>
      )}

      {/* Plan summary cards */}
      <div className='grid grid-cols-1 md:grid-cols-3 gap-4'>
        {/* Current plan */}
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>Current Plan</CardDescription>
            <CardTitle className='text-2xl'>
              {subscription ? PLAN_LABELS[subscription.planType] ?? subscription.planType : 'None'}
            </CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            {subscription ? (
              <StatusBadge status={subscription.status} />
            ) : (
              <Badge variant='outline'>No plan</Badge>
            )}
            {subscription?.isTrial && (
              <p className='text-xs text-muted-foreground mt-1'>Trial period</p>
            )}
          </CardContent>
        </Card>

        {/* Expiry */}
        <Card>
          <CardHeader className='pb-2'>
            <CardDescription>
              {subscription?.status === 'expired' ? 'Expired On' : 'Expires On'}
            </CardDescription>
            <CardTitle className='text-2xl flex items-center gap-2'>
              <Calendar className='h-5 w-5 text-muted-foreground' />
              {subscription?.endDate
                ? (() => { try { return format(new Date(subscription.endDate), 'MMM dd, yyyy') } catch { return '—' } })()
                : '—'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {daysRemaining !== null && subscription?.status === 'active' && (
              <p className='text-sm text-muted-foreground flex items-center gap-1'>
                <Clock className='h-3.5 w-3.5' />
                {daysRemaining > 0 ? `${daysRemaining} days remaining` : 'Expires today'}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quick action */}
        <Card className='bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20'>
          <CardHeader className='pb-2'>
            <CardDescription>Upgrade or Renew</CardDescription>
            <CardTitle className='text-lg'>Need more?</CardTitle>
          </CardHeader>
          <CardContent className='space-y-2'>
            <p className='text-sm text-muted-foreground'>
              Unlock more branches and users with a paid plan.
            </p>
            <Button size='sm' asChild className='w-full'>
              <Link to='/subscription/payment' search={{ planType: undefined }}>
                <CreditCard className='mr-2 h-4 w-4' />
                Buy Plan
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Usage */}
      <div className='grid grid-cols-1 md:grid-cols-2 gap-4'>
        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-base flex items-center gap-2'>
                <GitBranch className='h-4 w-4' />
                Branches
              </CardTitle>
              <span className='text-sm font-semibold'>
                {branchesUsed} / {subscription?.limits?.maxBranches ?? '—'}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className='w-full h-2 bg-muted rounded-full overflow-hidden'>
              <div
                className='h-full bg-primary rounded-full transition-all'
                style={{ width: `${branchPct}%` }}
              />
            </div>
            {branchPct >= 100 && (
              <p className='text-xs text-red-600 mt-2 flex items-center gap-1'>
                <AlertTriangle className='h-3 w-3' /> Limit reached — upgrade to add more branches
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className='pb-3'>
            <div className='flex items-center justify-between'>
              <CardTitle className='text-base flex items-center gap-2'>
                <Users className='h-4 w-4' />
                Users
              </CardTitle>
              <span className='text-sm font-semibold'>
                {usersUsed} / {subscription?.limits?.maxUsers ?? '—'}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <div className='w-full h-2 bg-muted rounded-full overflow-hidden'>
              <div
                className='h-full bg-primary rounded-full transition-all'
                style={{ width: `${userPct}%` }}
              />
            </div>
            {userPct >= 100 && (
              <p className='text-xs text-red-600 mt-2 flex items-center gap-1'>
                <AlertTriangle className='h-3 w-3' /> Limit reached — upgrade to add more users
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment history */}
      <Card>
        <CardHeader>
          <div className='flex items-center justify-between'>
            <CardTitle className='flex items-center gap-2'>
              <History className='h-4 w-4' />
              Payment History
            </CardTitle>
          </div>
          <CardDescription>Your recent payment submissions</CardDescription>
        </CardHeader>
        <CardContent>
          {paymentsLoading ? (
            <div className='space-y-2'>
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className='h-12' />
              ))}
            </div>
          ) : !paymentsData?.results?.length ? (
            <div className='flex flex-col items-center justify-center py-8 text-muted-foreground'>
              <CreditCard className='h-8 w-8 mb-2' />
              <p className='text-sm'>No payment history yet.</p>
              <Button size='sm' className='mt-3' asChild>
                <Link to='/subscription/payment' search={{ planType: undefined }}>Submit First Payment</Link>
              </Button>
            </div>
          ) : (
            <div className='divide-y'>
              {paymentsData.results.map((payment) => (
                <div key={payment.id} className='py-3 flex items-center justify-between'>
                  <div>
                    <p className='text-sm font-medium'>
                      {PLAN_LABELS[payment.planType]} — {payment.months} month(s)
                    </p>
                    <p className='text-xs text-muted-foreground flex items-center gap-1'>
                      <Calendar className='h-3 w-3' />
                      {(() => { try { return format(new Date(payment.createdAt), 'MMM dd, yyyy') } catch { return '—' } })()}
                    </p>
                  </div>
                  <div className='flex items-center gap-3'>
                    <span className='text-sm font-semibold'>
                      PKR {payment.amount.toLocaleString()}
                    </span>
                    <PaymentStatusBadge status={payment.status} />
                    {payment.status === 'rejected' && payment.rejectionReason && (
                      <span
                        className='text-xs text-red-600 cursor-help'
                        title={payment.rejectionReason}
                      >
                        <AlertTriangle className='h-3.5 w-3.5' />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trial info */}
      {subscription?.isTrial && subscription.status === 'active' && (
        <Card className='border-blue-200 bg-blue-50'>
          <CardHeader>
            <CardTitle className='text-base flex items-center gap-2 text-blue-800'>
              <CheckCircle2 className='h-4 w-4' />
              You are on the Free Trial
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className='text-sm text-blue-700'>
              Your trial gives you access to all features with limited branches and users. Upgrade to
              a paid plan for full access.
            </p>
            <Button className='mt-3' size='sm' asChild>
              <Link to='/subscription/pricing'>See Paid Plans</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

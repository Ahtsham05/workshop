import toast from 'react-hot-toast'
import { AlertTriangle, CalendarClock, CreditCard, Lock } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { billingErrorMessage, useCreatePortalSessionMutation, type BillingSummary } from '@/stores/billing.api'
import { formatDate, formatLimit, STATUS_META } from './format'

function UsageMeter({ label, used, max }: { label: string; used: number; max: number }) {
  const unlimited = max === -1
  const pct = unlimited ? 0 : Math.min(100, max > 0 ? (used / max) * 100 : 100)
  const over = !unlimited && used >= max
  return (
    <div className='min-w-0 space-y-1.5'>
      <div className='flex items-baseline justify-between gap-2 text-sm'>
        <span className='text-muted-foreground truncate'>{label}</span>
        <span className={`shrink-0 font-medium tabular-nums ${over ? 'text-red-600' : ''}`}>
          {used.toLocaleString()} / {formatLimit(max)}
        </span>
      </div>
      {!unlimited && <Progress value={pct} className='h-1.5' aria-label={`${label} used`} />}
    </div>
  )
}

export function StatusCard({ summary }: { summary: BillingSummary }) {
  const [openPortal, { isLoading: openingPortal }] = useCreatePortalSessionMutation()
  const meta = STATUS_META[summary.status]
  const { limits } = summary.plan

  const handlePortal = async () => {
    try {
      const { url } = await openPortal().unwrap()
      window.location.assign(url)
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const periodLine = (() => {
    if (!summary.currentPeriodEnd) return 'No end date'
    if (summary.status === 'trialing') return `Trial ends ${formatDate(summary.currentPeriodEnd)}`
    if (summary.status === 'canceled') return `Access until ${formatDate(summary.currentPeriodEnd)}`
    if (summary.status === 'expired') return `Ended ${formatDate(summary.currentPeriodEnd)}`
    if (summary.paymentSource === 'polar') return `Renews ${formatDate(summary.currentPeriodEnd)}`
    return `Paid through ${formatDate(summary.currentPeriodEnd)}`
  })()

  return (
    <Card>
      <CardHeader className='gap-3'>
        <div className='flex flex-wrap items-start justify-between gap-3'>
          <div className='min-w-0'>
            <CardDescription>Current plan</CardDescription>
            <CardTitle className='mt-1 flex flex-wrap items-center gap-2 text-xl'>
              {summary.plan.name}
              <Badge className={meta.tone}>{meta.label}</Badge>
            </CardTitle>
            <p className='text-muted-foreground mt-1 flex items-center gap-1.5 text-sm'>
              <CalendarClock className='h-4 w-4 shrink-0' />
              {periodLine}
              {summary.daysRemaining != null && summary.mode === 'full' && summary.status !== 'gracePeriod'
                ? ` · ${summary.daysRemaining} day${summary.daysRemaining === 1 ? '' : 's'} left`
                : ''}
            </p>
            {summary.paymentSource && (
              <p className='text-muted-foreground mt-0.5 text-xs'>
                Paying by {summary.paymentSource === 'polar' ? 'card (Polar)' : 'bank / mobile wallet (manual)'}
                {summary.paymentSource === 'manual' ? ' — manual plans do not renew automatically.' : ''}
              </p>
            )}
          </div>
          {summary.isOwner && summary.hasCardSubscription && (
            <Button variant='outline' size='sm' onClick={handlePortal} disabled={openingPortal}>
              <CreditCard className='mr-1.5 h-4 w-4' />
              {openingPortal ? 'Opening…' : 'Manage card & invoices'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        {summary.mode === 'readOnly' && (
          <Alert variant='destructive'>
            <Lock className='h-4 w-4' />
            <AlertTitle>Your account is read-only</AlertTitle>
            <AlertDescription>{summary.readOnlyReason}</AlertDescription>
          </Alert>
        )}
        {(summary.status === 'gracePeriod' || summary.status === 'pastDue') && (
          <Alert>
            <AlertTriangle className='h-4 w-4' />
            <AlertTitle>{summary.status === 'pastDue' ? 'Your card payment failed' : 'Your plan period has ended'}</AlertTitle>
            <AlertDescription>
              Everything keeps working until {formatDate(summary.graceEndsAt)}. After that the account becomes read-only
              until you renew — your data stays safe and exportable.
            </AlertDescription>
          </Alert>
        )}
        {summary.pendingPlan && (
          <Alert>
            <CalendarClock className='h-4 w-4' />
            <AlertTitle>Scheduled change</AlertTitle>
            <AlertDescription>
              Your plan changes to {summary.pendingPlan.name} on {formatDate(summary.pendingPlan.effectiveAt)}.
            </AlertDescription>
          </Alert>
        )}
        <div className='grid grid-cols-1 gap-3'>
          <UsageMeter label='Users' used={summary.usage.users} max={limits.maxUsers} />
          <UsageMeter label='Branches' used={summary.usage.branches} max={limits.maxBranches} />
          <UsageMeter label='Invoices this month' used={summary.usage.invoicesThisMonth} max={limits.maxInvoicesPerMonth} />
        </div>
      </CardContent>
    </Card>
  )
}

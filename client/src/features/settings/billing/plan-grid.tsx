import { useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, Info } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  billingErrorMessage,
  MODULE_LABELS,
  MODULES_HIDDEN_FROM_PRICING,
  useChangeCardPlanMutation,
  useCreateCheckoutMutation,
  usePreviewPlanChangeMutation,
  type BillingPlan,
  type BillingSummary,
  type PaymentSource,
  type PlanChangePreview,
} from '@/stores/billing.api'
import { Link } from '@tanstack/react-router'
import { countryFlagEmoji } from '@/lib/country-flag'
import { useGetCountriesQuery } from '@/stores/localization.api'
import { formatDate, formatLimit, formatPkr, formatUsd } from './format'
import { ManualPaymentDialog } from './manual-payment-dialog'

function actionLabel(summary: BillingSummary, plan: BillingPlan): string {
  const current = summary.plan
  const onPaidPlan = summary.plan.key !== 'trial' && summary.status !== 'expired'
  if (plan.key === current.key) return onPaidPlan ? 'Renew' : 'Choose plan'
  if (!onPaidPlan) return 'Choose plan'
  return plan.priceUsdMonthly > current.priceUsdMonthly ? 'Upgrade' : 'Downgrade'
}

export function PlanGrid({ summary }: { summary: BillingSummary }) {
  const routing = summary.routing
  const { data: countries } = useGetCountriesQuery()
  const countryName = countries?.find((c) => c.code === routing.country)?.name ?? routing.country
  // Card is only offered when at least one plan can actually be bought through Polar.
  const cardReady = summary.hasCardSubscription || summary.plans.some((p) => p.cardAvailable)
  const sources = routing.allowed.filter((s) => s !== 'polar' || cardReady)
  const [source, setSource] = useState<PaymentSource>(
    summary.hasCardSubscription
      ? 'polar'
      : routing.default && sources.includes(routing.default)
        ? routing.default
        : (sources[0] ?? routing.default ?? 'polar')
  )
  const [manualPlan, setManualPlan] = useState<BillingPlan | null>(null)
  const [confirm, setConfirm] = useState<{ plan: BillingPlan; preview: PlanChangePreview } | null>(null)

  const [previewChange, { isLoading: previewing }] = usePreviewPlanChangeMutation()
  const [createCheckout, { isLoading: checkingOut }] = useCreateCheckoutMutation()
  const [changeCardPlan, { isLoading: changing }] = useChangeCardPlanMutation()
  const busy = previewing || checkingOut || changing

  const canPay = summary.isOwner && routing.allowed.length > 0
  // A card subscription renews itself; renewing it "again" makes no sense.
  const renewDisabled = (plan: BillingPlan) =>
    source === 'polar' && summary.hasCardSubscription && plan.key === summary.plan.key && summary.status !== 'canceled'

  const proceed = async (plan: BillingPlan) => {
    if (source === 'manual') {
      setManualPlan(plan)
      return
    }
    try {
      if (summary.hasCardSubscription && summary.status !== 'canceled') {
        const result = await changeCardPlan({ planKey: plan.key }).unwrap()
        toast.success(
          result.direction === 'upgrade'
            ? `Upgraded to ${plan.name}.`
            : `${plan.name} starts on ${formatDate(result.effectiveAt)}.`
        )
      } else {
        const { url } = await createCheckout({ planKey: plan.key }).unwrap()
        window.location.assign(url)
      }
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const handleSelect = async (plan: BillingPlan) => {
    try {
      const preview = await previewChange({ planKey: plan.key }).unwrap()
      // Only interrupt for downgrades — that's where timing and usage limits matter.
      if (preview.direction === 'downgrade') setConfirm({ plan, preview })
      else await proceed(plan)
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  return (
    <div className='space-y-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div className='min-w-0'>
          <h4 className='text-base font-semibold'>Plans</h4>
          <p className='text-muted-foreground text-sm'>
            {source === 'manual'
              ? `Prices in PKR at ${summary.pkrPerUsd} PKR/USD, paid by bank transfer, JazzCash or Easypaisa.`
              : 'Prices in USD, paid by card through Polar. Renews monthly until you cancel.'}
          </p>
          {routing.country && (
            <p className='text-muted-foreground mt-1 text-xs'>
              Payment options for {countryFlagEmoji(routing.country)} {countryName}, your business country.{' '}
              {summary.isOwner && (
                <Link to='/settings/business-profile' className='text-foreground underline underline-offset-2'>
                  Change in Business Profile
                </Link>
              )}
            </p>
          )}
        </div>
        {sources.length > 1 && (
          <Tabs value={source} onValueChange={(v) => setSource(v as PaymentSource)}>
            <TabsList>
              <TabsTrigger value='manual'>Bank / wallet (PKR)</TabsTrigger>
              <TabsTrigger value='polar'>Card (USD)</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
      </div>

      {!routing.country && (
        <Alert>
          <Info className='h-4 w-4' />
          <AlertTitle>Set your business country to see payment options</AlertTitle>
          <AlertDescription>
            Payment methods and currency follow the country in your business profile.{' '}
            {summary.isOwner ? (
              <Link to='/settings/business-profile' className='font-medium underline underline-offset-2'>
                Open Business Profile
              </Link>
            ) : (
              'Ask the organization owner to set it.'
            )}
          </AlertDescription>
        </Alert>
      )}

      {source === 'polar' && !cardReady && (
        <Alert>
          <Info className='h-4 w-4' />
          <AlertTitle>Card payments are being set up</AlertTitle>
          <AlertDescription>
            Online card checkout isn't available for your account yet. Please contact support and we'll activate your
            plan for you.
          </AlertDescription>
        </Alert>
      )}

      {/* One plan per row: the settings panel is narrow (max-w-xl), so side-by-side cards
          would squeeze prices and feature lists into two-word lines. */}
      <div className='grid grid-cols-1 gap-3'>
        {summary.plans.map((plan) => {
          const isCurrent = plan.key === summary.plan.key
          const cardUnavailable = source === 'polar' && !plan.cardAvailable
          return (
            <Card key={plan.key} className={`gap-4 py-5 ${isCurrent ? 'border-primary' : ''}`}>
              <CardHeader className='px-5'>
                <div className='flex flex-wrap items-start justify-between gap-x-4 gap-y-2'>
                  <div className='min-w-0'>
                    <div className='flex flex-wrap items-center gap-2'>
                      <CardTitle>{plan.name}</CardTitle>
                      {isCurrent && <Badge variant='secondary'>Current</Badge>}
                      {plan.badge && !isCurrent && <Badge variant='outline'>{plan.badge}</Badge>}
                    </div>
                    <CardDescription className='mt-1'>{plan.description}</CardDescription>
                  </div>
                  <p className='shrink-0 whitespace-nowrap'>
                    <span className='text-2xl font-bold tabular-nums'>
                      {source === 'manual' ? formatPkr(plan.pricePkrMonthly) : formatUsd(plan.priceUsdMonthly)}
                    </span>
                    <span className='text-muted-foreground text-sm'> / month</span>
                  </p>
                </div>
              </CardHeader>
              <CardContent className='space-y-3 px-5 text-sm'>
                <p className='text-muted-foreground'>
                  {formatLimit(plan.limits.maxUsers)} users · {formatLimit(plan.limits.maxBranches)} branch
                  {plan.limits.maxBranches === 1 ? '' : 'es'} · {formatLimit(plan.limits.maxInvoicesPerMonth)} invoices / month
                </p>
                <ul className='grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2'>
                  {plan.modules.filter((m) => !MODULES_HIDDEN_FROM_PRICING.has(m)).map((m) => (
                    <li key={m} className='flex items-start gap-2'>
                      <Check className='mt-0.5 h-4 w-4 shrink-0 text-emerald-600' />
                      {MODULE_LABELS[m] ?? m}
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter className='px-5'>
                {canPay ? (
                  <Button
                    className='w-full sm:w-auto'
                    variant={isCurrent ? 'outline' : 'default'}
                    disabled={busy || cardUnavailable || renewDisabled(plan)}
                    onClick={() => handleSelect(plan)}
                  >
                    {cardUnavailable
                      ? 'Card payment coming soon'
                      : renewDisabled(plan)
                        ? 'Renews automatically'
                        : actionLabel(summary, plan)}
                  </Button>
                ) : (
                  <p className='text-muted-foreground text-xs'>
                    {summary.isOwner
                      ? 'Set your business country to see payment options.'
                      : 'Only the organization owner can change the plan.'}
                  </p>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>

      <ManualPaymentDialog plan={manualPlan} open={Boolean(manualPlan)} onOpenChange={(o) => !o && setManualPlan(null)} />

      <AlertDialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Downgrade to {confirm?.plan.name}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className='space-y-3'>
                <p>
                  You keep {confirm?.preview.from.name} until {formatDate(confirm?.preview.effectiveAt)}, then{' '}
                  {confirm?.plan.name} starts.
                </p>
                {confirm && confirm.preview.warnings.length > 0 && (
                  <div className='rounded-md border border-amber-600 p-3 text-amber-700 dark:text-amber-400'>
                    <p className='flex items-center gap-1.5 font-medium'>
                      <AlertTriangle className='h-4 w-4' /> Your current usage is above the new plan
                    </p>
                    <ul className='mt-1 list-disc pl-5'>
                      {confirm.preview.warnings.map((w) => (
                        <li key={w.limit}>{w.message}</li>
                      ))}
                    </ul>
                    <p className='mt-1'>Nothing is deleted, but you won't be able to add more until you're under the limit.</p>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current plan</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const plan = confirm?.plan
                setConfirm(null)
                if (plan) proceed(plan)
              }}
            >
              Continue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useGetTrialStatusQuery } from '@/stores/subscription.api'
import { getPlanLabel } from '@/lib/feature-access'
import { AlertTriangle } from 'lucide-react'

/** Height reserved for the trial/subscription top banner (sidebar + main content offset). */
export const APP_TOP_BANNER_HEIGHT = '4.5rem'

interface TrialExpirationBoundaryProps {
  children: React.ReactNode
}

function SubscriptionEndingBanner({
  planLabel,
  daysRemaining,
  onRenew,
}: {
  planLabel: string
  daysRemaining: number
  onRenew: () => void
}) {
  return (
    <div
      role='alert'
      className='fixed inset-x-0 top-0 z-[60] flex w-full items-start gap-3 border-b border-amber-500 bg-amber-950 px-4 py-3'
    >
      <AlertTriangle className='mt-0.5 h-5 w-5 shrink-0 text-amber-500' />
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-semibold text-amber-100'>{planLabel} ending soon</p>
        <p className='mt-1 text-xs text-amber-50'>
          Your {planLabel} will expire in {daysRemaining} day{daysRemaining !== 1 ? 's' : ''}.{' '}
          <button
            type='button'
            onClick={onRenew}
            className='font-semibold underline hover:text-white'
          >
            Renew now
          </button>{' '}
          to avoid service interruption.
        </p>
      </div>
    </div>
  )
}

function useAppTopBannerOffset(active: boolean) {
  useEffect(() => {
    if (!active) {
      document.documentElement.style.removeProperty('--app-top-banner-height')
      return
    }
    document.documentElement.style.setProperty('--app-top-banner-height', APP_TOP_BANNER_HEIGHT)
    return () => {
      document.documentElement.style.removeProperty('--app-top-banner-height')
    }
  }, [active])
}

export function TrialExpirationBoundary({ children }: TrialExpirationBoundaryProps) {
  const navigate = useNavigate()
  const pathname = useRouterState({ select: (s) => s.location.pathname })
  const { data: trialStatus, isLoading } = useGetTrialStatusQuery()

  const expiredAccessAllowedPaths = ['/subscription/payment', '/subscription/pricing', '/payments', '/subscription']
  const canAccessExpiredPath = expiredAccessAllowedPaths.some(
    (allowedPath) => pathname === allowedPath || pathname.startsWith(`${allowedPath}/`)
  )

  const handleNavigateToPayment = () => {
    navigate({ to: '/subscription/payment' as any })
  }

  // Expired users should land directly on renew/payment flow.
  useEffect(() => {
    if (!isLoading && trialStatus?.trialExpired && !canAccessExpiredPath) {
      navigate({ to: '/subscription/payment' as any, replace: true })
    }
  }, [isLoading, trialStatus?.trialExpired, canAccessExpiredPath, navigate])

  const showTrialEndingBanner =
    !isLoading &&
    !trialStatus?.trialExpired &&
    trialStatus?.daysRemaining != null &&
    trialStatus.daysRemaining < 3 &&
    trialStatus.daysRemaining > 0

  useAppTopBannerOffset(showTrialEndingBanner)

  // If loading, show nothing
  if (isLoading) {
    return <div>{children}</div>
  }

  // Block rendering while redirecting off non-payment routes.
  if (trialStatus?.trialExpired) {
    if (!canAccessExpiredPath) {
      return <div className="min-h-screen bg-background" />
    }
    return <div>{children}</div>
  }

  if (showTrialEndingBanner) {
    const planLabel = getPlanLabel(trialStatus?.subscription?.planType)

    return (
      <div className='min-h-svh'>
        <SubscriptionEndingBanner
          planLabel={planLabel}
          daysRemaining={trialStatus!.daysRemaining!}
          onRenew={handleNavigateToPayment}
        />
        <div
          className='min-h-svh'
          style={{ paddingTop: 'var(--app-top-banner-height, 0px)' }}
        >
          {children}
        </div>
      </div>
    )
  }

  // Trial is active or subscription is valid
  return <div>{children}</div>
}

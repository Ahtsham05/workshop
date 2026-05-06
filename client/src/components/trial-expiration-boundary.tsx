import { useEffect } from 'react'
import { useNavigate, useRouterState } from '@tanstack/react-router'
import { useGetTrialStatusQuery } from '@/stores/subscription.api'
import { AlertTriangle } from 'lucide-react'

interface TrialExpirationBoundaryProps {
  children: React.ReactNode
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

  // If trial is ending soon (less than 3 days), show warning
  if (trialStatus?.daysRemaining !== null && trialStatus?.daysRemaining !== undefined && trialStatus.daysRemaining < 3 && trialStatus.daysRemaining > 0) {
    return (
      <div>
        {/* Warning Banner */}
        <div className="bg-amber-950 border-b border-amber-500 px-4 py-3 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-100">
              Trial ending soon
            </p>
            <p className="text-xs text-amber-50 mt-1">
              Your trial will expire in {trialStatus.daysRemaining} day{trialStatus.daysRemaining !== 1 ? 's' : ''}. 
              {' '}
              <button 
                onClick={handleNavigateToPayment}
                className="underline font-semibold hover:text-white"
              >
                Renew now
              </button>
              {' '} to avoid service interruption.
            </p>
          </div>
        </div>
        {/* Content */}
        {children}
      </div>
    )
  }

  // Trial is active or subscription is valid
  return <div>{children}</div>
}

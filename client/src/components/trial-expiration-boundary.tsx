import { useNavigate } from '@tanstack/react-router'
import { useGetTrialStatusQuery } from '@/stores/subscription.api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AlertTriangle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TrialExpirationBoundaryProps {
  children: React.ReactNode
}

export function TrialExpirationBoundary({ children }: TrialExpirationBoundaryProps) {
  const navigate = useNavigate()
  const { data: trialStatus, isLoading } = useGetTrialStatusQuery()

  const handleNavigateToPayment = () => {
    navigate({ to: '/subscription/payment' as any })
  }

  const handleViewPaymentHistory = () => {
    navigate({ to: '/payments' as any })
  }

  // If loading, show nothing
  if (isLoading) {
    return <>{children}</>
  }

  // If trial is expired, show expiration screen
  if (trialStatus?.trialExpired) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <Card className="w-full max-w-md border-red-500 bg-slate-950">
          <CardHeader>
            <div className="flex items-center gap-3 mb-2">
              <XCircle className="h-8 w-8 text-red-500" />
              <CardTitle className="text-red-500">Trial Expired</CardTitle>
            </div>
            <CardDescription>
              Your trial or subscription has ended
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="bg-red-950 border border-red-500 rounded-lg p-4">
              <p className="text-sm text-red-100">
                Your trial or subscription period has ended. To continue using the application and access all features, 
                please renew your subscription.
              </p>
            </div>

            {trialStatus?.subscription && (
              <div className="space-y-2 text-sm">
                <p className="text-slate-300">
                  <span className="font-semibold">Plan:</span> {trialStatus.subscription.planType || 'Trial'}
                </p>
                <p className="text-slate-300">
                  <span className="font-semibold">Status:</span> {trialStatus.subscription.status || 'Expired'}
                </p>
                {trialStatus.subscription.endDate && (
                  <p className="text-slate-300">
                    <span className="font-semibold">Ended:</span> {new Date(trialStatus.subscription.endDate).toLocaleDateString()}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <Button 
                onClick={handleNavigateToPayment}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Renew Subscription
              </Button>
              <Button 
                onClick={handleViewPaymentHistory}
                variant="outline"
                className="w-full"
              >
                View Payment History
              </Button>
            </div>

            <p className="text-xs text-slate-400 text-center">
              Contact support if you need assistance with your subscription.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // If trial is ending soon (less than 3 days), show warning
  if (trialStatus?.daysRemaining !== null && trialStatus?.daysRemaining !== undefined && trialStatus.daysRemaining < 3 && trialStatus.daysRemaining > 0) {
    return (
      <div className="relative">
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
  return <>{children}</>
}

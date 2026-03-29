import { useGetTrialStatusQuery } from '@/stores/subscription.api'

/**
 * Hook to check and get trial/subscription status
 * Returns trial status information and loading state
 */
export function useTrialStatus() {
  const { data, isLoading, error, isFetching } = useGetTrialStatusQuery()

  return {
    trialExpired: data?.trialExpired || false,
    daysRemaining: data?.daysRemaining || 0,
    subscription: data?.subscription,
    isLoading,
    isFetching,
    error,
  }
}

/**
 * Hook to check if trial is expired
 * Returns boolean for quick checks
 */
export function useIsTrialExpired() {
  const { trialExpired, isLoading } = useTrialStatus()
  return { isExpired: trialExpired, isLoading }
}

/**
 * Hook to get days remaining in trial
 * Returns number of days remaining
 */
export function useDaysRemaining() {
  const { daysRemaining, isLoading } = useTrialStatus()
  return { daysRemaining, isLoading }
}

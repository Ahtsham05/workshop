import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import {
  isFeatureAllowed,
  isUnlimitedPlan,
  FeatureKey,
} from '@/lib/feature-access'

/**
 * Hook that provides feature-access helpers derived from the
 * current user's organization subscription plan.
 *
 * Usage:
 *   const { canAccess, isUnlimited, planType } = useFeatureAccess()
 *   if (!canAccess('roi')) return <LockedFeatureCard />
 */
export function useFeatureAccess() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org, isLoading } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })

  const planType: string = org?.subscription?.planType ?? 'trial'

  /**
   * Returns true when the current plan permits access to the given feature.
   * Always returns true while org data is loading to avoid flicker.
   */
  const canAccess = (featureName: FeatureKey): boolean => {
    if (isLoading) return true
    return isFeatureAllowed(planType, featureName)
  }

  return {
    canAccess,
    isUnlimited: isUnlimitedPlan(planType),
    planType,
    isLoading,
  }
}

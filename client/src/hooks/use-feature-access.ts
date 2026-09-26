import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetBillingSummaryQuery } from '@/stores/billing.api'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isFeatureAllowed, isFeatureInModules, isUnlimitedPlan, type FeatureKey } from '@/lib/feature-access'

/**
 * Feature-access helpers for the current organization's plan, for DISPLAY decisions only
 * (locked cards, hidden nav). The server enforces the same rules on every request.
 *
 * Usage:
 *   const { canAccess, isUnlimited, planType } = useFeatureAccess()
 *   if (!canAccess('roi')) return <LockedFeatureCard />
 */
export function useFeatureAccess() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const skip = !user?.organizationId
  const { data: summary, isLoading: summaryLoading } = useGetBillingSummaryQuery(undefined, { skip })
  const { data: org, isLoading: orgLoading } = useGetMyOrganizationQuery(undefined, { skip })

  const planType: string = summary?.plan.key ?? org?.subscription?.planType ?? 'trial'
  const isLoading = summaryLoading || orgLoading

  /** Always true while loading, to avoid flashing a locked card. */
  const canAccess = (featureName: FeatureKey): boolean => {
    if (isLoading) return true
    if (summary) return isFeatureInModules(summary.plan.modules, featureName)
    return isFeatureAllowed(planType, featureName)
  }

  return {
    canAccess,
    isUnlimited: isUnlimitedPlan(planType),
    planType,
    planName: summary?.plan.name,
    /** true when a lapsed plan has made the account read-only */
    readOnly: summary?.mode === 'readOnly',
    isLoading,
  }
}

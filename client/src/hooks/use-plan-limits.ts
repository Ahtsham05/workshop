import { useGetSubscriptionUsageQuery } from '@/stores/organization.api'

export interface PlanLimits {
  isLoading: boolean
  /** Number of branches currently active */
  branchesUsed: number
  /** Number of users currently active */
  usersUsed: number
  /** Maximum branches allowed by plan (Infinity when no cap) */
  maxBranches: number
  /** Maximum users allowed by plan (Infinity when no cap) */
  maxUsers: number
  /** true when branchesUsed >= maxBranches */
  branchLimitReached: boolean
  /** true when usersUsed >= maxUsers */
  userLimitReached: boolean
  /** Current subscription plan type */
  planType: 'trial' | 'single' | 'multi' | null
  /** Current subscription status */
  planStatus: 'active' | 'expired' | 'pending' | null
  /** Friendly label for the plan */
  planLabel: string
  refetch: () => void
}

const PLAN_LABELS: Record<string, string> = {
  trial: 'Free Trial',
  single: 'Starter Plan',
  starter: 'Starter Plan',
  multi: 'Growth Plan',
  growth: 'Growth Plan',
  business: 'Business Plan',
  enterprise: 'Enterprise Plan',
}

export function usePlanLimits(): PlanLimits {
  const { data, isLoading, refetch } = useGetSubscriptionUsageQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })

  const branchesUsed = data?.branchesUsed ?? 0
  const usersUsed = data?.usersUsed ?? 0
  const limits = data?.subscription?.limits
  const maxBranches = limits?.maxBranches != null ? limits.maxBranches : Infinity
  const maxUsers = limits?.maxUsers != null ? limits.maxUsers : Infinity
  const planType = (data?.subscription?.planType as PlanLimits['planType']) ?? null
  const planStatus = (data?.subscription?.status as PlanLimits['planStatus']) ?? null

  return {
    isLoading,
    branchesUsed,
    usersUsed,
    maxBranches,
    maxUsers,
    branchLimitReached: maxBranches !== Infinity && branchesUsed >= maxBranches,
    userLimitReached: maxUsers !== Infinity && usersUsed >= maxUsers,
    planType,
    planStatus,
    planLabel: planType ? (PLAN_LABELS[planType] ?? planType) : 'No Plan',
    refetch,
  }
}

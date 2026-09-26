import { useGetBillingSummaryQuery, type SubscriptionStatus } from '@/stores/billing.api'

export interface PlanLimits {
  isLoading: boolean
  /** Number of branches currently active */
  branchesUsed: number
  /** Number of billable users currently active (portal logins excluded) */
  usersUsed: number
  /** Invoices created this business month */
  invoicesThisMonth: number
  /** Maximum branches allowed by plan (Infinity when unlimited) */
  maxBranches: number
  /** Maximum users allowed by plan (Infinity when unlimited) */
  maxUsers: number
  /** Maximum invoices per month (Infinity when unlimited) */
  maxInvoicesPerMonth: number
  /** true when branchesUsed >= maxBranches */
  branchLimitReached: boolean
  /** true when usersUsed >= maxUsers */
  userLimitReached: boolean
  /** true when the lapsed plan has made the account read-only */
  readOnly: boolean
  /** Current plan key */
  planType: string | null
  /** Current subscription status */
  planStatus: SubscriptionStatus | null
  /** Friendly label for the plan */
  planLabel: string
  refetch: () => void
}

/** -1 (unlimited) and "not loaded" both mean no cap on the client. */
const cap = (n: number | undefined) => (n == null || n === -1 ? Infinity : n)

export function usePlanLimits(): PlanLimits {
  const { data, isLoading, refetch } = useGetBillingSummaryQuery(undefined, {
    refetchOnMountOrArgChange: true,
    refetchOnFocus: true,
    refetchOnReconnect: true,
  })

  const usersUsed = data?.usage.users ?? 0
  const branchesUsed = data?.usage.branches ?? 0
  const maxUsers = cap(data?.plan.limits.maxUsers)
  const maxBranches = cap(data?.plan.limits.maxBranches)

  return {
    isLoading,
    branchesUsed,
    usersUsed,
    invoicesThisMonth: data?.usage.invoicesThisMonth ?? 0,
    maxBranches,
    maxUsers,
    maxInvoicesPerMonth: cap(data?.plan.limits.maxInvoicesPerMonth),
    branchLimitReached: branchesUsed >= maxBranches,
    userLimitReached: usersUsed >= maxUsers,
    readOnly: data?.mode === 'readOnly',
    planType: data?.plan.key ?? null,
    planStatus: data?.status ?? null,
    planLabel: data?.plan.name ?? 'No Plan',
    refetch,
  }
}

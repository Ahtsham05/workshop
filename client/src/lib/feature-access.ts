/**
 * Feature Access Control – mirrors the backend plan definitions.
 *
 * Plans (planType from Organization.subscription.planType):
 *   trial      → basic only
 *   starter    → basic only (PKR 999)
 *   growth     → mobile shop + advanced reports (PKR 2,499)
 *   business   → HR, admin, multi-branch (PKR 4,999)
 *   enterprise → all features, unlimited users/branches
 *
 * Legacy keys (single = starter, multi = growth) kept for backward compat.
 */

/** Features available on every plan including trial. */
export const BASE_FEATURES = [
  'inventory',
  'sales',
  'invoicing',
  'basic_reports',
] as const

/** Mobile shop and advanced report features — Growth plan and above. */
export const MOBILE_SHOP_FEATURES = [
  'advanced_reports',
  'profit_loss',
  'roi',
  'load',
  'repair',
  'bill_payment',
  'wallet',
  'customer_ledger',
  'supplier_ledger',
] as const

/** HR, admin, and multi-branch features — Business plan and above. */
export const BUSINESS_FEATURES = [
  'hr_management',
  'multi_branch',
  'roles_permissions',
  'advanced_analytics',
  'staff_management',
] as const

export type FeatureKey =
  | (typeof BASE_FEATURES)[number]
  | (typeof MOBILE_SHOP_FEATURES)[number]
  | (typeof BUSINESS_FEATURES)[number]
  | string

/** Map each plan type to its allowed feature keys. */
const PLAN_FEATURE_KEYS: Record<string, readonly string[]> = {
  trial:      BASE_FEATURES,
  starter:    BASE_FEATURES,
  growth:     [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES],
  business:   [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES, ...BUSINESS_FEATURES],
  enterprise: ['all_features'],
  // legacy
  single:     BASE_FEATURES,
  multi:      [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES, ...BUSINESS_FEATURES, 'analytics'],
}

/**
 * Returns true if the feature is accessible for the given plan.
 */
export function isFeatureAllowed(
  planType: string | undefined | null,
  featureName: FeatureKey
): boolean {
  const plan = planType ?? 'trial'
  const keys = PLAN_FEATURE_KEYS[plan] ?? BASE_FEATURES
  if (keys.includes('all_features')) return true
  return keys.includes(featureName)
}

/** Returns true when the plan has unlimited branches/users (enterprise). */
export function isUnlimitedPlan(planType: string | undefined | null): boolean {
  return (planType ?? 'trial') === 'enterprise'
}

/** Returns which plan first unlocks a given feature. */
export function getRequiredPlan(featureName: FeatureKey): string {
  if ((BUSINESS_FEATURES as readonly string[]).includes(featureName)) return 'business'
  if ((MOBILE_SHOP_FEATURES as readonly string[]).includes(featureName)) return 'growth'
  return 'starter'
}

/** Human-readable plan label. */
export function getPlanLabel(planType: string | undefined | null): string {
  switch (planType) {
    case 'trial':      return 'Free Trial'
    case 'starter':    return 'Starter Plan'
    case 'growth':     return 'Growth Plan'
    case 'business':   return 'Business Plan'
    case 'enterprise': return 'Enterprise Plan'
    // legacy
    case 'single':     return 'Starter Plan'
    case 'multi':      return 'Growth Plan'
    default:           return 'Free Trial'
  }
}

/** Human-readable label for the plan that unlocks a feature. */
export function getRequiredPlanLabel(featureName: FeatureKey): string {
  return getPlanLabel(getRequiredPlan(featureName))
}

export const UPGRADE_MESSAGE =
  'Upgrade your plan to unlock this feature.'

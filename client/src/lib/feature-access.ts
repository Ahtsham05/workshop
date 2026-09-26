/**
 * Feature Access Control — a mirror of the server's entitlement rules for *display only*
 * (locked cards, disabled buttons). The server is the enforcement point: see
 * server/src/services/entitlement.service.js and server/src/config/billing.js.
 *
 * Plans and their modules live in the database and come from GET /v1/billing/summary;
 * legacy feature keys used around the app map onto those modules here.
 */
import type { BillingModule } from '@/stores/billing.api'

/** Legacy feature keys → plan module. Keep in sync with server config/billing.js FEATURE_TO_MODULE. */
export const FEATURE_TO_MODULE: Record<string, BillingModule> = {
  inventory: 'inventory',
  sales: 'invoicing',
  invoicing: 'invoicing',
  basic_reports: 'reports',
  reports: 'reports',
  cash_book: 'invoicing',
  cash_register: 'invoicing',
  school_management: 'school',
  advanced_reports: 'advanced_reports',
  profit_loss: 'advanced_reports',
  roi: 'advanced_reports',
  load: 'mobile_shop',
  repair: 'mobile_shop',
  bill_payment: 'mobile_shop',
  used_phones: 'mobile_shop',
  new_phones: 'mobile_shop',
  wallet: 'accounting',
  customer_ledger: 'accounting',
  supplier_ledger: 'accounting',
  hr_management: 'hr',
  staff_management: 'roles_permissions',
  multi_branch: 'multi_branch',
  roles_permissions: 'roles_permissions',
  advanced_analytics: 'analytics',
  analytics: 'analytics',
}

export type FeatureKey = keyof typeof FEATURE_TO_MODULE | BillingModule | string

/** Modules each plan had before billing v2 — used only until the billing summary loads. */
const FALLBACK_PLAN_MODULES: Record<string, BillingModule[]> = {
  trial: ['invoicing', 'inventory', 'reports', 'school'],
  starter: ['invoicing', 'inventory', 'reports', 'school'],
  growth: ['invoicing', 'inventory', 'reports', 'school', 'accounting', 'advanced_reports', 'mobile_shop', 'hr'],
  business: [
    'invoicing', 'inventory', 'reports', 'school', 'accounting', 'advanced_reports', 'mobile_shop', 'hr',
    'multi_branch', 'roles_permissions', 'analytics',
  ],
}
FALLBACK_PLAN_MODULES.single = FALLBACK_PLAN_MODULES.starter
FALLBACK_PLAN_MODULES.multi = FALLBACK_PLAN_MODULES.growth

export function moduleForFeature(featureName: FeatureKey): BillingModule | undefined {
  return (FEATURE_TO_MODULE[featureName] ?? featureName) as BillingModule
}

/** True when the given plan modules include the module behind `featureName`. */
export function isFeatureInModules(modules: readonly string[], featureName: FeatureKey): boolean {
  const module = moduleForFeature(featureName)
  return Boolean(module && modules.includes(module))
}

/** Pre-summary fallback by plan key (enterprise = everything). */
export function isFeatureAllowed(planType: string | undefined | null, featureName: FeatureKey): boolean {
  const plan = planType ?? 'trial'
  if (plan === 'enterprise') return true
  return isFeatureInModules(FALLBACK_PLAN_MODULES[plan] ?? FALLBACK_PLAN_MODULES.starter, featureName)
}

export function isUnlimitedPlan(planType: string | undefined | null): boolean {
  return (planType ?? 'trial') === 'enterprise'
}

/** Human-readable plan label (fallback when the summary's plan name isn't at hand). */
export function getPlanLabel(planType: string | undefined | null): string {
  switch (planType) {
    case 'trial':      return 'Free Trial'
    case 'starter':    return 'Starter Plan'
    case 'growth':     return 'Growth Plan'
    case 'business':   return 'Business Plan'
    case 'enterprise': return 'Enterprise Plan'
    case 'single':     return 'Starter Plan'
    case 'multi':      return 'Growth Plan'
    default:           return 'Free Trial'
  }
}

/** Which plan first unlocks a feature, by the fallback table. */
export function getRequiredPlan(featureName: FeatureKey): string {
  for (const plan of ['starter', 'growth', 'business'] as const) {
    if (isFeatureInModules(FALLBACK_PLAN_MODULES[plan], featureName)) return plan
  }
  return 'enterprise'
}

export function getRequiredPlanLabel(featureName: FeatureKey): string {
  return getPlanLabel(getRequiredPlan(featureName))
}

export const UPGRADE_MESSAGE = 'Upgrade your plan to unlock this feature.'

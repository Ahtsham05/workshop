/**
 * Subscription billing constants — the parts of billing that are code, not data.
 *
 * Prices, limits and which modules each plan unlocks live in the `plans` collection
 * (see models/plan.model.js and scripts/billing/seedPlans.js) so they can be changed
 * without a deploy. Bank / wallet details and the PKR exchange rate live in the
 * single BillingSettings document for the same reason.
 */

/** Organization.subscription.status values. `readOnly` is never stored — it is derived. */
const SUBSCRIPTION_STATUSES = ['trialing', 'active', 'pastDue', 'gracePeriod', 'canceled', 'expired'];

const PAYMENT_SOURCES = ['polar', 'manual'];

const MANUAL_PAYMENT_METHODS = ['bank_transfer', 'jazzcash', 'easypaisa'];

/** Months a manual payment may cover. Polar is monthly only. */
const MANUAL_BILLING_MONTHS = [1, 3, 6, 12];

/**
 * Plan modules. `readableWhenLocked` decides what happens when an org's plan does not
 * include the module: data modules stay viewable (the customer's own records — never lock
 * them out), while modules whose GET *is* the feature (a computed report) stay locked.
 */
const MODULES = {
  invoicing: { label: 'Invoicing & POS', readableWhenLocked: true },
  inventory: { label: 'Inventory', readableWhenLocked: true },
  accounting: { label: 'Accounting, Wallets & Ledgers', readableWhenLocked: true },
  reports: { label: 'Basic Reports', readableWhenLocked: true },
  advanced_reports: { label: 'Advanced Reports (P&L, ROI)', readableWhenLocked: false },
  hr: { label: 'HR & Payroll', readableWhenLocked: true },
  mobile_shop: { label: 'Mobile Shop (Load, Repair, Bill Payments, Phones)', readableWhenLocked: true },
  school: { label: 'School Management', readableWhenLocked: true },
  multi_branch: { label: 'Multi-branch Management', readableWhenLocked: true },
  roles_permissions: { label: 'Roles & Permissions', readableWhenLocked: true },
  analytics: { label: 'Advanced Analytics', readableWhenLocked: false },
};

/**
 * Pre-billing-v2 feature keys (still passed to checkFeatureAccess by ~60 routes and used by
 * the client's feature-access.ts) → the module that now owns them.
 */
const FEATURE_TO_MODULE = {
  inventory: 'inventory',
  sales: 'invoicing',
  invoicing: 'invoicing',
  basic_reports: 'reports',
  reports: 'reports',
  cash_book: 'invoicing', // day-to-day cash handling ships with POS on every plan
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
};

/** Legacy Organization.subscription.planType values → current plan keys. */
const LEGACY_PLAN_ALIASES = { single: 'starter', multi: 'growth' };

const ALL_MODULES = Object.keys(MODULES);
const STARTER_MODULES = ['invoicing', 'inventory', 'reports', 'school'];
const GROWTH_MODULES = [...STARTER_MODULES, 'accounting', 'advanced_reports', 'mobile_shop', 'hr'];
const BUSINESS_MODULES = [...GROWTH_MODULES, 'multi_branch', 'roles_permissions', 'analytics'];

/**
 * Seed data for the `plans` collection. seedPlans.js inserts missing plans and never
 * overwrites an existing one, so edits made in the DB (or admin UI) survive re-seeding.
 * -1 means unlimited.
 */
const DEFAULT_PLANS = [
  {
    key: 'trial',
    name: 'Free Trial',
    description: '14-day free trial to explore core features.',
    priceUsdMonthly: 0,
    trialDays: 14,
    limits: { maxUsers: 3, maxInvoicesPerMonth: 1000, maxBranches: 1 },
    modules: STARTER_MODULES,
    isPublic: false,
    sortOrder: 0,
  },
  {
    key: 'starter',
    name: 'Starter',
    description: 'For a single store getting organised.',
    priceUsdMonthly: 5,
    limits: { maxUsers: 3, maxInvoicesPerMonth: 1000, maxBranches: 1 },
    modules: STARTER_MODULES,
    isPublic: true,
    sortOrder: 1,
  },
  {
    key: 'growth',
    name: 'Growth',
    description: 'Accounting, HR, mobile-shop modules and advanced reports.',
    priceUsdMonthly: 10,
    limits: { maxUsers: 10, maxInvoicesPerMonth: 5000, maxBranches: 2 },
    modules: GROWTH_MODULES,
    badge: 'Most Popular',
    isPublic: true,
    sortOrder: 2,
  },
  {
    key: 'business',
    name: 'Business',
    description: 'Multiple branches, roles & permissions and analytics.',
    priceUsdMonthly: 30,
    limits: { maxUsers: 25, maxInvoicesPerMonth: -1, maxBranches: 5 },
    modules: BUSINESS_MODULES,
    isPublic: true,
    sortOrder: 3,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    description: 'Custom agreement — assigned by a platform admin.',
    priceUsdMonthly: 0,
    limits: { maxUsers: -1, maxInvoicesPerMonth: -1, maxBranches: -1 },
    modules: ALL_MODULES,
    isPublic: false,
    sortOrder: 4,
  },
];

/** Defaults for the BillingSettings singleton — editable afterwards by a platform admin. */
const DEFAULT_BILLING_SETTINGS = {
  pkrPerUsd: 280,
  graceDays: 5,
  reminderDays: [7, 3],
  intentTtlHours: 72,
  bank: {
    bankName: 'ABL (Allied Bank Limited)',
    accountTitle: 'Ahtsham Ali',
    accountNumber: '06650010102824970014',
    iban: 'PK90ABPA0010102824970014',
    branch: 'Main Branch, Faisalabad',
  },
  jazzcash: { accountTitle: '', accountNumber: '' },
  easypaisa: { accountTitle: '', accountNumber: '' },
};

/** Countries routed to manual payment by default (ISO 3166-1 alpha-2). */
const MANUAL_PAYMENT_COUNTRIES = ['PK'];

/** Proof upload constraints for manual payments. */
const PROOF_UPLOAD = {
  maxBytes: 5 * 1024 * 1024,
  mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  signedUrlTtlSeconds: 300,
};

module.exports = {
  SUBSCRIPTION_STATUSES,
  PAYMENT_SOURCES,
  MANUAL_PAYMENT_METHODS,
  MANUAL_BILLING_MONTHS,
  MODULES,
  ALL_MODULES,
  FEATURE_TO_MODULE,
  LEGACY_PLAN_ALIASES,
  DEFAULT_PLANS,
  DEFAULT_BILLING_SETTINGS,
  MANUAL_PAYMENT_COUNTRIES,
  PROOF_UPLOAD,
};

/**
 * Subscription plan definitions.
 * 4-tier system: starter → growth → business → enterprise
 * Legacy keys (single, multi) kept for backward compatibility with existing DB records.
 * Prices are in PKR (Pakistani Rupees).
 */

/** Features available on every plan including trial. */
const BASE_FEATURES = [
  'inventory',
  'sales',
  'invoicing',
  'basic_reports',
];

/** Mobile shop and advanced report features — unlocked on Growth and above. */
const MOBILE_SHOP_FEATURES = [
  'advanced_reports',
  'profit_loss',
  'roi',
  'load',
  'repair',
  'bill_payment',
  'wallet',
  'customer_ledger',
  'supplier_ledger',
];

/** HR, admin, and multi-branch features — unlocked on Business and above. */
const BUSINESS_FEATURES = [
  'hr_management',
  'multi_branch',
  'roles_permissions',
  'advanced_analytics',
  'staff_management',
];

const PLANS = {
  // ── Active plans ──────────────────────────────────────────────
  trial: {
    planType: 'trial',
    label: 'Free Trial',
    durationDays: 14,
    maxBranches: 1,
    maxUsers: 2,
    price: 0,
    description: '14-day free trial to explore core features.',
    badge: null,
    features: [
      '1 Branch',
      'Up to 2 Users',
      'Core Features (Inventory, Sales, Invoicing)',
      'Basic Reports',
      'Email Support',
    ],
    featureKeys: [...BASE_FEATURES],
  },
  starter: {
    planType: 'starter',
    label: 'Starter Plan',
    maxBranches: 1,
    maxUsers: 3,
    pricePerMonth: 999,
    description: 'Perfect for a single store location.',
    badge: null,
    features: [
      '1 Branch',
      'Up to 3 Users',
      'Core Features (Inventory, Sales, Invoicing)',
      'Basic Reports',
      'Invoicing & POS',
      'Priority Support',
    ],
    featureKeys: [...BASE_FEATURES],
  },
  growth: {
    planType: 'growth',
    label: 'Growth Plan',
    maxBranches: 2,
    maxUsers: 10,
    pricePerMonth: 2499,
    description: 'For growing businesses with mobile shop modules.',
    badge: 'Most Popular',
    features: [
      'Up to 2 Branches',
      'Up to 10 Users',
      'All Core Features',
      'Advanced Reports (ROI, P&L)',
      'Mobile Shop Modules (Load, Repair, Bill Payments)',
      'Wallet & Cash Book',
      'Customer & Supplier Ledger',
      'Priority Support',
    ],
    featureKeys: [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES],
  },
  business: {
    planType: 'business',
    label: 'Business Plan',
    maxBranches: 5,
    maxUsers: 25,
    pricePerMonth: 4999,
    description: 'Advanced features for established businesses.',
    badge: 'Best Value',
    features: [
      'Up to 5 Branches',
      'Up to 25 Users',
      'All Growth Features',
      'Multi-branch Management',
      'HR System (Employees, Attendance, Payroll)',
      'Roles & Permissions',
      'Advanced Analytics',
      'Dedicated Support',
    ],
    featureKeys: [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES, ...BUSINESS_FEATURES],
  },
  enterprise: {
    planType: 'enterprise',
    label: 'Enterprise Plan',
    maxBranches: -1,
    maxUsers: -1,
    pricePerMonth: null,
    priceLabel: 'Custom Pricing',
    description: 'Unlimited access for large enterprises.',
    badge: null,
    features: [
      'Unlimited Branches',
      'Unlimited Users',
      'All Features Included',
      'Custom Integrations',
      'Dedicated Account Manager',
      '24/7 Priority Support',
      'SLA Guarantee',
    ],
    featureKeys: ['all_features'],
  },
  // ── Legacy keys — kept for backward compat with existing DB records ──
  single: {
    planType: 'single',
    label: 'Starter Plan',
    maxBranches: 1,
    maxUsers: 5,
    pricePerMonth: 1499,
    description: 'Perfect for a single store location.',
    badge: null,
    features: [
      '1 Branch',
      'Up to 5 Users',
      'Core Features (Inventory, Sales, Invoicing)',
      'Basic Reports',
      'Invoicing & POS',
      'Priority Support',
    ],
    featureKeys: [...BASE_FEATURES],
  },
  multi: {
    planType: 'multi',
    label: 'Growth Plan',
    maxBranches: 10,
    maxUsers: 50,
    pricePerMonth: 2599,
    description: 'Ideal for businesses with multiple locations and advanced modules.',
    badge: null,
    features: [
      'Up to 10 Branches',
      'Up to 50 Users',
      'All Core Features',
      'Multi-branch Management',
      'Advanced Reports (ROI, P&L)',
      'Mobile Shop Modules (Load, Repair, Bill Payments)',
      'Wallet & Cash Book',
      'Customer & Supplier Ledger',
      'HR System (Employees, Attendance, Payroll)',
      'Analytics',
      'Dedicated Support',
    ],
    featureKeys: [...BASE_FEATURES, ...MOBILE_SHOP_FEATURES, ...BUSINESS_FEATURES, 'analytics'],
  },
};

module.exports = { PLANS, BASE_FEATURES, MOBILE_SHOP_FEATURES, BUSINESS_FEATURES };

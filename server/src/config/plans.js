/**
 * Subscription plan definitions.
 * Each plan defines limits and pricing.
 * Prices are in PKR (Pakistani Rupees).
 */
const PLANS = {
  trial: {
    planType: 'trial',
    label: 'Free Trial',
    durationDays: 14,
    maxBranches: 1,
    maxUsers: 2,
    price: 0,
    description: '14-day free trial to explore all features.',
    features: [
      '1 Branch',
      'Up to 2 Users',
      'All core features',
      'Email support',
    ],
  },
  single: {
    planType: 'single',
    label: 'Starter Plan',
    maxBranches: 1,
    maxUsers: 5,
    pricePerMonth: 1499,
    description: 'Perfect for a single store location.',
    features: [
      '1 Branch',
      'Up to 5 Users',
      'All core features',
      'Invoicing & POS',
      'Inventory management',
      'Priority support',
    ],
  },
  multi: {
    planType: 'multi',
    label: 'Growth Plan',
    maxBranches: 10,
    maxUsers: 50,
    pricePerMonth: 2599,
    description: 'Ideal for businesses with multiple locations.',
    features: [
      'Up to 10 Branches',
      'Up to 50 Users',
      'All core features',
      'Multi-branch management',
      'Advanced analytics',
      'Dedicated support',
    ],
  },
};

module.exports = PLANS;

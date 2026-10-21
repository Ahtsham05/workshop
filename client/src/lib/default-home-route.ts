import type { PermissionKey } from '@/lib/permission-registry';
import { resolvePermission } from '@/lib/permission-resolve';

type StoredUser = {
  systemRole?: string
  businessType?: string
  schoolRole?: string
  linkedTeacherId?: string | null
  role?: {
    permissions?: Record<string, boolean>
  }
}

const HOME_ROUTE_PRIORITY: PermissionKey[] = [
  'viewDashboard',
  'viewInvoices',
  'createInvoices',
  'viewProducts',
  'viewPurchases',
  'createPurchases',
  'viewPurchaseOrders',
  'createPurchaseOrders',
  'viewCustomers',
  'viewSuppliers',
  'viewCategories',
  'viewBrands',
  'viewStockTransfers',
  'manageStockTransfers',
  'viewStockAdjustments',
  'manageStockAdjustments',
  'countStock',
  'viewSalesReturns',
  'createSalesReturns',
  'viewPurchaseReturns',
  'createPurchaseReturns',
  'viewAccounting',
  'viewPaymentVouchers',
  'viewCashBook',
  'viewCashRegister',
  'viewAccountsSystem',
  'viewWallet',
  'viewLoadManagement',
  'viewSimSales',
  'viewRepairs',
  'viewServices',
  'viewBillPayments',
  'viewInstallments',
  'viewImeiTracking',
  'viewManufacturing',
  'viewLeads',
  'viewReminders',
  'viewReports',
  'getEmployees',
  'viewUsers',
  'viewRoles',
]

const PERMISSION_HOME: Partial<Record<PermissionKey, string>> = {
  viewDashboard: '/',
  viewInvoices: '/invoice',
  createInvoices: '/invoice',
  viewProducts: '/products',
  viewPurchases: '/purchase-invoice',
  createPurchases: '/purchase-invoice',
  viewPurchaseOrders: '/purchase-orders',
  createPurchaseOrders: '/purchase-orders',
  viewCustomers: '/customers',
  viewSuppliers: '/suppliers',
  viewCategories: '/categories',
  viewBrands: '/brands',
  viewStockTransfers: '/stock-transfer',
  manageStockTransfers: '/stock-transfer',
  viewStockAdjustments: '/stock-adjustments',
  manageStockAdjustments: '/stock-adjustments',
  countStock: '/stock-counts',
  viewSalesReturns: '/sales-returns',
  createSalesReturns: '/sales-returns',
  viewPurchaseReturns: '/purchase-returns',
  createPurchaseReturns: '/purchase-returns',
  viewAccounting: '/accounting',
  viewPaymentVouchers: '/payment-vouchers',
  viewCashBook: '/cash-book',
  viewCashRegister: '/cash-register',
  viewAccountsSystem: '/school/accounts',
  viewWallet: '/mobile-shop/wallet',
  viewLoadManagement: '/mobile-shop/load',
  viewSimSales: '/mobile-shop/sim-sale',
  viewRepairs: '/mobile-shop/repair',
  viewServices: '/mobile-shop/services',
  viewBillPayments: '/mobile-shop/bill-payments',
  viewInstallments: '/mobile-shop/installments',
  viewImeiTracking: '/mobile-shop/imei-tracking',
  viewManufacturing: '/manufacturing',
  viewLeads: '/leads',
  viewReminders: '/reminders',
  viewReports: '/reports',
  getEmployees: '/hr',
  viewUsers: '/users-management',
  viewRoles: '/roles',
}

function can(user: StoredUser | null | undefined, key: PermissionKey): boolean {
  return resolvePermission(user?.role?.permissions ?? null, key)
}

/** First allowed route for users without dashboard access. */
export function getDefaultHomeRoute(user: StoredUser | null | undefined): string {
  if (!user) return '/403'

  if (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin') {
    return '/admin'
  }

  for (const key of HOME_ROUTE_PRIORITY) {
    if (can(user, key)) {
      return PERMISSION_HOME[key] ?? '/'
    }
  }

  return '/403'
}

export function readStoredUser(): StoredUser | null {
  try {
    const raw = localStorage.getItem('user')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function canViewDashboard(user: StoredUser | null | undefined): boolean {
  if (!user) return false
  if (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin') return true
  return user.role?.permissions?.viewDashboard === true
}

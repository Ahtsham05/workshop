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
  'viewProducts',
  'viewPurchases',
  'viewPurchaseOrders',
  'viewCustomers',
  'viewSuppliers',
  'viewCategories',
  'viewSalesReturns',
  'viewAccounting',
  'viewCashBook',
  'viewCashRegister',
  'viewAccountsSystem',
  'viewWallet',
  'viewLoadManagement',
  'viewSimSales',
  'viewRepairs',
  'viewServices',
  'viewReports',
  'getEmployees',
  'viewUsers',
  'viewRoles',
]

const PERMISSION_HOME: Partial<Record<PermissionKey, string>> = {
  viewDashboard: '/',
  viewInvoices: '/invoice',
  viewProducts: '/products',
  viewPurchases: '/purchase-invoice',
  viewPurchaseOrders: '/purchase-orders',
  viewCustomers: '/customers',
  viewSuppliers: '/suppliers',
  viewCategories: '/categories',
  viewSalesReturns: '/sales-returns',
  viewAccounting: '/accounting',
  viewCashBook: '/cash-book',
  viewCashRegister: '/cash-register',
  viewAccountsSystem: '/school/accounts',
  viewWallet: '/mobile-shop/wallet',
  viewLoadManagement: '/mobile-shop/load',
  viewSimSales: '/mobile-shop/sim-sale',
  viewRepairs: '/mobile-shop/repair',
  viewServices: '/mobile-shop/services',
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

/**
 * Route-level RBAC — maps URL prefixes to required permissions.
 * Used by TanStack Router beforeLoad guards (outside React context).
 */

import type { PermissionKey } from '@/lib/permission-registry';
import { hasAnyPermission } from '@/lib/permission-resolve';
import {
  deriveSchoolRole,
  isPathAllowedForSchoolRole,
  getSchoolRoleHome,
  PARENT_ALLOWED_PATHS,
  TEACHER_ALLOWED_PATHS,
} from '@/lib/school-permissions';
import type { AppUser } from '@/lib/rbac';
import { getDefaultHomeRoute } from '@/lib/default-home-route';
import { resolveActiveBusinessType } from '@/lib/organization-context';

export interface RouteRule {
  prefix: string;
  anyPermission?: PermissionKey[];
  businessTypes?: string[];
  excludeBusinessTypes?: string[];
  systemRoles?: string[];
  /** If set, only these school roles may access (within school businessType). */
  schoolRoles?: string[];
  excludeSchoolRoles?: string[];
  allowAllAuthenticated?: boolean;
}

/** Longest prefix match wins — keep sorted by prefix length descending. */
export const ROUTE_RULES: RouteRule[] = [
  // Platform admin
  { prefix: '/admin', systemRoles: ['system_admin'] },

  // School role portals (most specific first)
  { prefix: '/school/portals/teacher', businessTypes: ['school'], schoolRoles: ['teacher', 'schoolAdmin'] },
  { prefix: '/school/portals/parent', businessTypes: ['school'], schoolRoles: ['parent'] },
  { prefix: '/school/portals/student', businessTypes: ['school'], schoolRoles: ['student'] },
  { prefix: '/school/teacher-leave', businessTypes: ['school'], schoolRoles: ['teacher', 'schoolAdmin'] },

  // School fee accounting (permission-gated)
  { prefix: '/school/fees/transactions', businessTypes: ['school'], anyPermission: ['viewFeeAccounting'], excludeSchoolRoles: ['teacher', 'parent', 'student'] },
  { prefix: '/school/fees/categories', businessTypes: ['school'], anyPermission: ['viewFeeAccounting'], excludeSchoolRoles: ['teacher', 'parent', 'student'] },
  { prefix: '/school/fees', businessTypes: ['school'], excludeSchoolRoles: ['teacher', 'parent', 'student'] },

  // School accounts system
  { prefix: '/school/accounts', businessTypes: ['school'], anyPermission: ['viewAccountsSystem'], excludeSchoolRoles: ['teacher', 'parent', 'student'] },

  // School admin module (catch-all for remaining /school/*)
  { prefix: '/school', businessTypes: ['school'], excludeSchoolRoles: ['teacher', 'parent', 'student'] },

  // Restaurant
  { prefix: '/restaurant', businessTypes: ['restaurant'] },

  // Mobile shop
  { prefix: '/mobile-shop/wallet', businessTypes: ['mobile_shop'], anyPermission: ['viewWallet'] },
  { prefix: '/mobile-shop/load', businessTypes: ['mobile_shop'], anyPermission: ['viewLoadManagement'] },
  { prefix: '/mobile-shop/sim-sale', businessTypes: ['mobile_shop'], anyPermission: ['viewSimSales'] },
  { prefix: '/mobile-shop/cash-management', businessTypes: ['mobile_shop'], anyPermission: ['viewCashManagement'] },
  { prefix: '/mobile-shop/repair', businessTypes: ['mobile_shop'], anyPermission: ['viewRepairs'] },
  { prefix: '/mobile-shop/services', businessTypes: ['mobile_shop'], anyPermission: ['viewServices'] },
  { prefix: '/mobile-shop/bill-payments', businessTypes: ['mobile_shop'], anyPermission: ['viewBillPayments'] },
  { prefix: '/mobile-shop/installments', businessTypes: ['mobile_shop'], anyPermission: ['viewInstallments'] },
  { prefix: '/mobile-shop/imei-tracking', businessTypes: ['mobile_shop'], anyPermission: ['viewImeiTracking'] },
  { prefix: '/mobile-shop/cash-book', anyPermission: ['viewCashBook'] },
  { prefix: '/cash-book', anyPermission: ['viewCashBook'] },

  // HR
  { prefix: '/hr/employees', anyPermission: ['getEmployees'] },
  { prefix: '/hr/departments', anyPermission: ['getDepartments'] },
  { prefix: '/hr/attendance', anyPermission: ['getAttendance'] },
  { prefix: '/hr/leaves', anyPermission: ['getLeaves'] },
  { prefix: '/hr/payroll', anyPermission: ['getPayroll'] },
  { prefix: '/hr/settings', anyPermission: ['getEmployees'] },
  { prefix: '/hr', anyPermission: ['getEmployees'] },

  // Administration
  { prefix: '/users-management', anyPermission: ['viewUsers'] },
  { prefix: '/roles', anyPermission: ['viewRoles'] },
  { prefix: '/branches', anyPermission: ['viewBranches'] },
  { prefix: '/staff', anyPermission: ['viewStaff'] },

  // Subscription (platform admins)
  { prefix: '/subscription', systemRoles: ['superAdmin', 'system_admin'] },

  // Settings
  { prefix: '/settings/account', allowAllAuthenticated: true },
  { prefix: '/settings/display', allowAllAuthenticated: true },
  { prefix: '/settings/offline', allowAllAuthenticated: true },
  { prefix: '/settings/sync', allowAllAuthenticated: true },
  { prefix: '/settings/sync-conflicts', allowAllAuthenticated: true },
  { prefix: '/settings/local-database', allowAllAuthenticated: true },
  { prefix: '/settings/backup', allowAllAuthenticated: true },
  { prefix: '/settings/cache', allowAllAuthenticated: true },
  { prefix: '/settings/notifications', allowAllAuthenticated: true },
  { prefix: '/settings/appearance', allowAllAuthenticated: true },
  { prefix: '/settings/language', allowAllAuthenticated: true },
  { prefix: '/settings/whatsapp', anyPermission: ['viewSettings', 'editSettings'] },
  { prefix: '/settings', anyPermission: ['viewSettings'] },

  // Business modules
  { prefix: '/products/bulk-edit', anyPermission: ['editProducts'] },
  { prefix: '/products', anyPermission: ['viewProducts'] },
  { prefix: '/categories', anyPermission: ['viewCategories'] },
  { prefix: '/customers', anyPermission: ['viewCustomers'] },
  { prefix: '/suppliers', anyPermission: ['viewSuppliers'] },
  { prefix: '/purchase-orders', anyPermission: ['viewPurchaseOrders', 'viewPurchases'] },
  { prefix: '/purchase-invoice', anyPermission: ['viewPurchases'] },
  { prefix: '/purchase-returns', anyPermission: ['viewPurchaseReturns', 'viewPurchases'] },
  { prefix: '/invoice', anyPermission: ['viewInvoices'] },
  { prefix: '/sales-returns', anyPermission: ['viewSalesReturns', 'viewInvoices'] },
  { prefix: '/accounting', anyPermission: ['viewAccounting'] },
  { prefix: '/cash-register', anyPermission: ['viewCashRegister'], excludeBusinessTypes: ['school', 'restaurant'] },
  { prefix: '/reports', anyPermission: ['viewReports'] },

  // Dashboard — exact match only (see matchesPrefix)
  { prefix: '/', anyPermission: ['viewDashboard'] },
];

/** Paths any logged-in user may visit regardless of module permissions. */
export const ALWAYS_ALLOWED_PREFIXES = [
  '/403',
  '/help-center',
  '/settings/account',
  '/settings/display',
  '/settings/offline',
  '/settings/sync',
  '/settings/sync-conflicts',
  '/settings/local-database',
  '/settings/backup',
  '/settings/cache',
  '/settings/notifications',
  '/settings/appearance',
  '/settings/language',
];

function normalizePath(pathname: string): string {
  if (!pathname || pathname === '/') return '/';
  return pathname.replace(/\/+$/, '') || '/';
}

function matchesPrefix(pathname: string, prefix: string): boolean {
  if (prefix === '/') return pathname === '/';
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function findRouteRule(pathname: string): RouteRule | null {
  const path = normalizePath(pathname);
  const sorted = [...ROUTE_RULES].sort((a, b) => b.prefix.length - a.prefix.length);
  for (const rule of sorted) {
    if (matchesPrefix(path, rule.prefix)) return rule;
  }
  return null;
}

function isPlatformAdmin(user: AppUser): boolean {
  return user.systemRole === 'superAdmin' || user.systemRole === 'system_admin';
}

function isAlwaysAllowed(pathname: string): boolean {
  const path = normalizePath(pathname);
  return ALWAYS_ALLOWED_PREFIXES.some(
    (p) => path === p || path.startsWith(`${p}/`),
  );
}

function matchesSchoolRoleRule(rule: RouteRule, schoolRole: string | null): boolean {
  if (rule.schoolRoles?.length) {
    const role = schoolRole || 'schoolAdmin';
    if (!rule.schoolRoles.includes(role)) return false;
  }
  if (rule.excludeSchoolRoles?.length && schoolRole) {
    if (rule.excludeSchoolRoles.includes(schoolRole)) return false;
  }
  return true;
}

export interface RouteAccessResult {
  allowed: boolean;
  redirectTo?: string;
}

/**
 * Returns whether the user may visit `pathname` and where to redirect if not.
 */
export function resolveRouteAccess(
  user: AppUser | null | undefined,
  pathname: string,
): RouteAccessResult {
  if (!user) return { allowed: false, redirectTo: '/sign-in' };

  const path = normalizePath(pathname);

  if (isAlwaysAllowed(path)) return { allowed: true };

  if (isPlatformAdmin(user)) return { allowed: true };

  const businessType = resolveActiveBusinessType(user.businessType);
  const schoolRole = deriveSchoolRole(user);
  const permissions = user.role?.permissions ?? null;

  // School role path allow-lists (teacher / parent)
  if (businessType === 'school' && schoolRole) {
    if (schoolRole === 'teacher' || schoolRole === 'parent') {
      const allowed = isPathAllowedForSchoolRole(path, schoolRole);
      if (!allowed) {
        return { allowed: false, redirectTo: getSchoolRoleHome(schoolRole) };
      }
    }
  }

  const rule = findRouteRule(path);

  // Unknown routes: allow (demo pages, future routes) — backend still enforces
  if (!rule) return { allowed: true };

  if (rule.allowAllAuthenticated) return { allowed: true };

  if (rule.systemRoles?.length) {
    if (!user.systemRole || !rule.systemRoles.includes(user.systemRole)) {
      return { allowed: false, redirectTo: getDefaultHomeRoute(user) };
    }
    return { allowed: true };
  }

  if (rule.businessTypes?.length) {
    if (!rule.businessTypes.includes(businessType)) {
      return { allowed: false, redirectTo: getDefaultHomeRoute(user) };
    }
  }

  if (rule.excludeBusinessTypes?.length) {
    if (rule.excludeBusinessTypes.includes(businessType)) {
      return { allowed: false, redirectTo: getDefaultHomeRoute(user) };
    }
  }

  if (businessType === 'school' && !matchesSchoolRoleRule(rule, schoolRole)) {
    return { allowed: false, redirectTo: getSchoolRoleHome(schoolRole) };
  }

  if (rule.anyPermission?.length) {
    if (!hasAnyPermission(permissions, rule.anyPermission)) {
      return { allowed: false, redirectTo: getDefaultHomeRoute(user) };
    }
  }

  return { allowed: true };
}

export function canAccessRoute(
  user: AppUser | null | undefined,
  pathname: string,
): boolean {
  return resolveRouteAccess(user, pathname).allowed;
}

/** Re-export for guards that need school allow-lists. */
export { TEACHER_ALLOWED_PATHS, PARENT_ALLOWED_PATHS };

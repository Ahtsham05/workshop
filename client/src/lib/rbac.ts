/**
 * Universal RBAC — single source of truth for ALL business types.
 *
 * Architecture
 * ─────────────
 * Each module (school, mobileShop, …) owns its own role list and
 * permission map.  This file is the top-level orchestrator:
 *
 *   getUserRole(user)        → effective role string for any user/module
 *   getUserHome(user)        → the home route to redirect to after login
 *   canAccessPath(user, p)   → true if path is allowed for the user
 *   hasModulePermission(...) → fine-grained permission check
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │  businessType = "school"  →  schoolRole drives everything     │
 * │  businessType = other     →  systemRole / role.name drives UI │
 * └──────────────────────────────────────────────────────────────┘
 *
 * IMPORTANT: Never check `user.role.name` directly in UI code.
 *            Call `getUserRole(user)` instead — it handles module
 *            delegation automatically.
 */

import { normalizeBusinessType } from '@/lib/business-types'
import {
  deriveSchoolRole,
  getSchoolRoleHome,
  isPathAllowedForSchoolRole,
  SCHOOL_PERMISSIONS,
  type SchoolRole,
} from '@/lib/school-permissions'

// ── Type helpers ───────────────────────────────────────────────────────────────

/** The raw user shape coming from the Redux store / localStorage. */
export interface AppUser {
  id?: string
  systemRole?: string
  businessType?: string
  schoolRole?: string
  linkedTeacherId?: string | null
  linkedStudentIds?: string[]
  role?: { name?: string; permissions?: Record<string, boolean> }
  organizationId?: string
}

/** A normalised role string returned by getUserRole(). */
export type EffectiveRole =
  | SchoolRole          // school module roles
  | 'superAdmin'        // platform-level super admin
  | 'staff'             // generic staff (non-school systemRole)
  | string              // catch-all for future modules

// ── Module-level permission maps ───────────────────────────────────────────────

/**
 * Mobile shop roles.
 * Extend this as the module grows.
 */
export const MOBILE_SHOP_PERMISSIONS = {
  manager: ['manage_inventory', 'view_reports', 'manage_sales', 'manage_repairs'] as const,
  technician: ['view_inventory', 'manage_repairs'] as const,
  cashier: ['process_sales', 'view_inventory'] as const,
  viewer: ['view_inventory', 'view_reports'] as const,
} as const

export type MobileShopRole = keyof typeof MOBILE_SHOP_PERMISSIONS

/**
 * All module permission maps keyed by businessType.
 * Add new modules here — guards and UI helpers pick them up automatically.
 */
export const MODULE_PERMISSIONS: Record<string, Record<string, readonly string[]>> = {
  school: SCHOOL_PERMISSIONS,
  mobile_shop: MOBILE_SHOP_PERMISSIONS,
}

// ── Core: getUserRole ──────────────────────────────────────────────────────────

/**
 * Returns the effective role for a user.
 *
 * Resolution order:
 *  1. businessType = "school" → return schoolRole (e.g. "teacher", "schoolAdmin")
 *  2. systemRole is set       → return systemRole (e.g. "superAdmin", "staff")
 *  3. role.name is set        → return role.name (legacy field)
 *  4. fallback                → "staff"
 *
 * This is the ONLY place that implements role-resolution logic.
 * All UI code should call this instead of reading user.role.name directly.
 */
export function getUserRole(user: AppUser | null | undefined): EffectiveRole {
  if (!user) return 'staff'

  const businessType = normalizeBusinessType(user.businessType)

  // School module: use schoolRole as the authoritative discriminator
  if (businessType === 'school') {
    const schoolRole = deriveSchoolRole(user)
    if (schoolRole) return schoolRole as EffectiveRole
    // A school user with no explicit schoolRole defaults to schoolAdmin
    // (e.g. the owner account created via registration)
    return 'schoolAdmin'
  }

  // Platform-level super admin — module-agnostic
  if (user.systemRole === 'superAdmin' || user.systemRole === 'system_admin') {
    return 'superAdmin'
  }

  // Generic business types: delegate to systemRole then legacy role.name
  if (user.systemRole) return user.systemRole as EffectiveRole
  if (user.role?.name) return user.role.name as EffectiveRole

  return 'staff'
}

/**
 * Same as getUserRole but reads from localStorage.
 * Use inside TanStack Router beforeLoad guards (outside React context).
 */
export function getUserRoleFromStorage(): EffectiveRole {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return 'staff'
    return getUserRole(JSON.parse(raw))
  } catch {
    return 'staff'
  }
}

// ── Home route resolver ────────────────────────────────────────────────────────

const SYSTEM_ROLE_HOME: Record<string, string> = {
  superAdmin: '/admin',
  system_admin: '/admin',
  staff: '/',
}

/**
 * Returns the first route the user should land on after login / redirect.
 */
export function getUserHome(user: AppUser | null | undefined): string {
  if (!user) return '/sign-in'

  const businessType = normalizeBusinessType(user.businessType)

  if (businessType === 'school') {
    return getSchoolRoleHome(deriveSchoolRole(user))
  }

  const role = getUserRole(user)
  return SYSTEM_ROLE_HOME[role] ?? '/'
}

// ── Path guard ─────────────────────────────────────────────────────────────────

/**
 * Returns true when the given pathname is accessible for this user.
 *
 * - School users: delegates to the schoolRole allow-list
 * - All other users: allowed everywhere (backend enforces its own checks)
 * - superAdmin: always allowed
 */
export function canAccessPath(
  user: AppUser | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false

  const role = getUserRole(user)

  if (role === 'superAdmin') return true

  const businessType = normalizeBusinessType(user.businessType)
  if (businessType === 'school') {
    return isPathAllowedForSchoolRole(pathname, deriveSchoolRole(user))
  }

  return true
}

// ── Fine-grained permission check ─────────────────────────────────────────────

/**
 * Checks whether a specific permission key is granted to the user.
 *
 * - superAdmin always gets true
 * - Uses the module permission map for the user's businessType/role
 */
export function hasModulePermission(
  user: AppUser | null | undefined,
  permission: string,
): boolean {
  if (!user) return false

  const role = getUserRole(user)
  if (role === 'superAdmin') return true

  const businessType = normalizeBusinessType(user.businessType)
  const moduleMap = MODULE_PERMISSIONS[businessType]
  if (!moduleMap) return false

  const perms = moduleMap[role] as readonly string[] | undefined
  if (!perms) return false

  // '*' means full access (e.g. schoolAdmin)
  if (perms.includes('*') || (perms as string[]).includes('*')) return true

  return (perms as string[]).includes(permission)
}

// ── Convenience predicates ────────────────────────────────────────────────────

export const isTeacherRole   = (role: EffectiveRole) => role === 'teacher'
export const isSchoolAdmin   = (role: EffectiveRole) => role === 'schoolAdmin'
export const isSuperAdmin    = (role: EffectiveRole) => role === 'superAdmin' || role === 'system_admin'
export const isSchoolRole    = (role: EffectiveRole): role is SchoolRole =>
  ['teacher', 'schoolAdmin', 'parent', 'student'].includes(role)

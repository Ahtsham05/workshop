import { type ReactNode } from 'react'
import { Navigate, useLocation } from '@tanstack/react-router'
import { useSchoolRole } from '@/hooks/use-school-role'
import { useUserRole } from '@/hooks/use-user-role'

interface RoleGuardProps {
  children: ReactNode
  /**
   * Only users whose schoolRole is in this list may see these children.
   * Works for school businessType users. Use `allowedRoles` for cross-module.
   */
  allowedSchoolRoles?: string[]
  /**
   * Universal role allowlist — matches the value returned by getUserRole().
   * Use this for non-school modules or cross-module guards.
   * Example: allowedRoles={['manager', 'superAdmin']}
   */
  allowedRoles?: string[]
  /**
   * Convenience shorthand: set true to block all non-admin school roles.
   * Equivalent to allowedSchoolRoles={['schoolAdmin']} but also allows
   * null (non-school) users through.
   */
  adminOnly?: boolean
  /**
   * Where to navigate when access is denied.
   * Defaults to the user's natural home route for their role.
   */
  redirectTo?: string
  /**
   * Render this element instead of redirecting (useful for in-page sections
   * that show a placeholder rather than a full-page redirect).
   */
  fallback?: ReactNode
}

/**
 * RoleGuard — declarative role-based access wrapper.
 *
 * Works for ALL business types. Combines:
 *  - schoolRole checks (school module)
 *  - effectiveRole checks (all other modules via getUserRole)
 *
 * Usage examples:
 *
 *   // School: only teachers
 *   <RoleGuard allowedSchoolRoles={['teacher']}>
 *     <MarkAttendancePage />
 *   </RoleGuard>
 *
 *   // Universal: only managers or superAdmins
 *   <RoleGuard allowedRoles={['manager', 'superAdmin']}>
 *     <ReportsPage />
 *   </RoleGuard>
 *
 *   // Admin-only section (teachers/parents/students redirected)
 *   <RoleGuard adminOnly>
 *     <UserManagementPage />
 *   </RoleGuard>
 *
 *   // Show a placeholder instead of redirecting
 *   <RoleGuard allowedSchoolRoles={['teacher']} fallback={<LockedCard />}>
 *     <TeacherOnlyWidget />
 *   </RoleGuard>
 */
export function RoleGuard({
  children,
  allowedSchoolRoles,
  allowedRoles,
  adminOnly = false,
  redirectTo,
  fallback,
}: RoleGuardProps) {
  const { schoolRole, homeRoute: schoolHome } = useSchoolRole()
  const { effectiveRole, homeRoute } = useUserRole()

  const deny = (to: string) => {
    if (fallback) return <>{fallback}</>
    return <Navigate to={to} search={{}} />
  }

  // ── adminOnly: block any schoolRole that isn't schoolAdmin ──────────────────
  // null schoolRole (non-school user) is always allowed through adminOnly
  if (adminOnly && schoolRole && schoolRole !== 'schoolAdmin') {
    return deny(redirectTo ?? schoolHome)
  }

  // ── allowedSchoolRoles: strict allowlist for school-module users ────────────
  if (allowedSchoolRoles && allowedSchoolRoles.length > 0) {
    const isAllowed = schoolRole ? allowedSchoolRoles.includes(schoolRole) : false
    if (!isAllowed) {
      return deny(redirectTo ?? schoolHome)
    }
  }

  // ── allowedRoles: universal role allowlist (cross-module) ───────────────────
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(effectiveRole)) {
      return deny(redirectTo ?? homeRoute)
    }
  }

  return <>{children}</>
}

/**
 * TeacherGuard — shorthand: only teachers may render children.
 */
export function TeacherGuard({ children, fallback }: Pick<RoleGuardProps, 'children' | 'fallback'>) {
  return (
    <RoleGuard allowedSchoolRoles={['teacher']} fallback={fallback}>
      {children}
    </RoleGuard>
  )
}

/**
 * SchoolAdminGuard — shorthand: only schoolAdmin (or non-school) users.
 */
export function SchoolAdminGuard({ children, fallback }: Pick<RoleGuardProps, 'children' | 'fallback'>) {
  return (
    <RoleGuard adminOnly fallback={fallback}>
      {children}
    </RoleGuard>
  )
}

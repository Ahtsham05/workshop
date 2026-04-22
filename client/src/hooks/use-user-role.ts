/**
 * useUserRole — universal role hook for all business types.
 *
 * This is the cross-module counterpart of the school-specific useSchoolRole.
 * All UI components should call this instead of reading user.role.name directly.
 *
 * Example:
 *   const { effectiveRole, isTeacher, isAdmin, homeRoute } = useUserRole()
 *   if (isTeacher) return <TeacherDashboard />
 *   return <AdminDashboard />
 */

import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import {
  getUserRole,
  getUserHome,
  canAccessPath,
  hasModulePermission,
  isTeacherRole,
  isSchoolAdmin,
  isSuperAdmin,
  isSchoolRole,
  type AppUser,
  type EffectiveRole,
} from '@/lib/rbac'
import { deriveSchoolRole } from '@/lib/school-permissions'
import { normalizeBusinessType } from '@/lib/business-types'

export interface UserRoleInfo {
  /** The effective role string — use this for rendering decisions. */
  effectiveRole: EffectiveRole
  /** Convenience booleans */
  isTeacher: boolean
  isSchoolAdmin: boolean
  isSuperAdmin: boolean
  /** True for any school-module role (teacher/schoolAdmin/parent/student). */
  isSchoolUser: boolean
  /** True when businessType resolves to "school". */
  isSchoolBusiness: boolean
  /** The first route this user should land on after login. */
  homeRoute: string
  /**
   * Returns true if the user is allowed to visit the given pathname.
   * Pass `location.pathname` from useLocation().
   */
  canVisitPath: (pathname: string) => boolean
  /**
   * Fine-grained module permission check.
   * E.g. canDo('mark_attendance') — uses the user's businessType + effectiveRole.
   */
  canDo: (permission: string) => boolean
  /** The raw user object from Redux (may be null before auth loads). */
  user: AppUser | null
}

/** Read user from Redux, fall back to localStorage on first render. */
function resolveUser(reduxUser: AppUser | null | undefined): AppUser | null {
  if (reduxUser) return reduxUser
  try {
    const raw = localStorage.getItem('user')
    if (raw) return JSON.parse(raw) as AppUser
  } catch {
    // ignore
  }
  return null
}

export function useUserRole(): UserRoleInfo {
  const reduxUser = useSelector((state: RootState) => state.auth.data?.user) as
    | AppUser
    | null
    | undefined

  const user = resolveUser(reduxUser)
  const effectiveRole = getUserRole(user)
  const businessType = normalizeBusinessType(user?.businessType)
  const schoolRole = deriveSchoolRole(user)

  return {
    effectiveRole,
    isTeacher: isTeacherRole(effectiveRole),
    isSchoolAdmin: isSchoolAdmin(effectiveRole),
    isSuperAdmin: isSuperAdmin(effectiveRole),
    isSchoolUser: isSchoolRole(effectiveRole),
    isSchoolBusiness: businessType === 'school',
    homeRoute: getUserHome(user),
    canVisitPath: (pathname: string) => canAccessPath(user, pathname),
    canDo: (permission: string) => hasModulePermission(user, permission),
    user,
  }
}

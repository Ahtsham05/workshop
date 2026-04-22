/**
 * School RBAC — single source of truth.
 *
 * schoolRole is the discriminator inside any school org:
 *   'teacher'     – classroom teacher, limited to own classes
 *   'schoolAdmin' – full school management access
 *   'parent'      – read-only view of linked children
 *   'student'     – read-only view of own data
 *
 * Add new roles or permissions here; all guards and sidebar filters
 * pick up changes automatically.
 */

// ── Permission keys ────────────────────────────────────────────────────────────

export const SCHOOL_PERMISSIONS = {
  teacher: [
    'view_teacher_portal',
    'mark_attendance',
    'view_own_classes',
    'view_own_students',
    'enter_marks',
    'view_timetable',
    'apply_leave',
    'view_exams',
    'view_subjects',
  ] as const,

  schoolAdmin: ['*'] as const,

  parent: [
    'view_parent_portal',
    'view_child_results',
    'view_child_attendance',
    'view_child_fees',
    'view_child_report',
  ] as const,

  student: [
    'view_student_portal',
    'view_own_results',
    'view_own_attendance',
    'view_own_fees',
  ] as const,
} as const

export type SchoolRole = keyof typeof SCHOOL_PERMISSIONS

// ── Route allow-lists ─────────────────────────────────────────────────────────

export const TEACHER_ALLOWED_PATHS: string[] = [
  '/school/portals/teacher',
  '/school/teacher-leave',
]

export const PARENT_ALLOWED_PATHS: string[] = [
  '/school/portals/parent',
]

// ── Home routes per role ──────────────────────────────────────────────────────

const ROLE_HOME: Record<string, string> = {
  teacher: '/school/portals/teacher',
  parent: '/school/portals/parent',
  student: '/school/portals/student',
  schoolAdmin: '/school',
}

export function getSchoolRoleHome(schoolRole: string | null | undefined): string {
  if (!schoolRole) return '/school'
  return ROLE_HOME[schoolRole] ?? '/school'
}

// ── Path guard ────────────────────────────────────────────────────────────────

/**
 * Returns whether `pathname` is accessible for the given schoolRole.
 * Non-school roles (null/undefined) are always allowed.
 */
export function isPathAllowedForSchoolRole(
  pathname: string,
  schoolRole: string | null | undefined,
): boolean {
  if (!schoolRole) return true

  const allowList =
    schoolRole === 'teacher'
      ? TEACHER_ALLOWED_PATHS
      : schoolRole === 'parent'
        ? PARENT_ALLOWED_PATHS
        : null // schoolAdmin / student have their own rules or full access

  if (!allowList) return true // schoolAdmin sees everything

  return allowList.some(
    (p) => pathname === p || pathname.startsWith(p + '/'),
  )
}

// ── Derive schoolRole from a user object ──────────────────────────────────────

/**
 * Extracts `schoolRole` from a raw user object.
 * Falls back to 'teacher' if `linkedTeacherId` is set (legacy accounts).
 */
export function deriveSchoolRole(user: any): string | null {
  if (!user) return null
  if (user.schoolRole) return user.schoolRole as string
  if (user.linkedTeacherId) return 'teacher'
  return null
}

/**
 * Same as deriveSchoolRole but reads from localStorage.
 * Safe to call outside a React component (e.g. in beforeLoad guards).
 */
export function deriveSchoolRoleFromStorage(): string | null {
  try {
    const raw = localStorage.getItem('user')
    if (!raw) return null
    return deriveSchoolRole(JSON.parse(raw))
  } catch {
    return null
  }
}

import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { deriveSchoolRole, getSchoolRoleHome, isPathAllowedForSchoolRole } from '@/lib/school-permissions'

export interface SchoolRoleInfo {
  /** e.g. 'teacher' | 'schoolAdmin' | 'parent' | null */
  schoolRole: string | null
  isTeacher: boolean
  isSchoolAdmin: boolean
  isParent: boolean
  isStudent: boolean
  /** true when ANY schoolRole is set (user is a school user) */
  isSchoolUser: boolean
  /** The home route this role should land on */
  homeRoute: string
  /** Whether the given path is allowed for this role */
  canVisitPath: (pathname: string) => boolean
}

/**
 * Returns the current user's school role and convenience booleans.
 *
 * Reads from Redux state (authoritative after login) and falls back
 * to localStorage (first render / page reload before hydration).
 */
export function useSchoolRole(): SchoolRoleInfo {
  const reduxUser = useSelector((state: RootState) => state.auth.data?.user)

  // Prefer Redux; fall back to localStorage for the initial render.
  const schoolRole: string | null = (() => {
    const fromRedux = deriveSchoolRole(reduxUser)
    if (fromRedux) return fromRedux

    try {
      const raw = localStorage.getItem('user')
      if (raw) return deriveSchoolRole(JSON.parse(raw))
    } catch {
      // ignore
    }
    return null
  })()

  return {
    schoolRole,
    isTeacher: schoolRole === 'teacher',
    isSchoolAdmin: schoolRole === 'schoolAdmin' || schoolRole === null,
    isParent: schoolRole === 'parent',
    isStudent: schoolRole === 'student',
    isSchoolUser: schoolRole !== null,
    homeRoute: getSchoolRoleHome(schoolRole),
    canVisitPath: (pathname: string) =>
      isPathAllowedForSchoolRole(pathname, schoolRole),
  }
}

import { redirect } from '@tanstack/react-router'
import { store } from '@/stores/store'

/**
 * Returns the current user's school role by checking Redux state first,
 * then falling back to localStorage.  Using linkedTeacherId as a secondary
 * signal so users created before the schoolRole field was added still get
 * correctly identified.
 */
export function getSchoolRole(): string | null {
  const user = store.getState().auth.data?.user

  if (user?.schoolRole) return user.schoolRole as string
  if (user?.linkedTeacherId) return 'teacher'

  try {
    const stored = localStorage.getItem('user')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.schoolRole) return parsed.schoolRole as string
      if (parsed?.linkedTeacherId) return 'teacher'
    }
  } catch (_e) {
    // ignore parse errors
  }

  return null
}

/**
 * TanStack Router beforeLoad guard.
 * Throws a redirect to the teacher portal for any user whose school role is
 * 'teacher', blocking access to all admin-only school routes.
 */
export function blockTeachers() {
  if (getSchoolRole() === 'teacher') {
    throw redirect({ to: '/school/portals/teacher' })
  }
}

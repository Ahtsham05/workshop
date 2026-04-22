import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { getSchoolRole } from '@/lib/school-role-guard'

/**
 * Layout route for ALL /_authenticated/school/* paths.
 *
 * When a teacher tries to access any school admin path (anything that is NOT
 * their own portal or leave page) they are redirected to the teacher portal.
 * This single beforeLoad replaces the per-route blockTeachers guards and acts
 * as the route-level half of a two-layer defence (sidebar filtering is the
 * other layer).
 */
export const Route = createFileRoute('/_authenticated/school')({
  beforeLoad: ({ location }) => {
    const role = getSchoolRole()
    if (role === 'teacher') {
      // Paths teachers are allowed to access
      const teacherAllowedPaths = [
        '/school/portals/teacher',
        '/school/teacher-leave',
      ]
      const isAllowed = teacherAllowedPaths.some((p) =>
        location.pathname === p ||
        location.pathname.startsWith(p + '/') ||
        location.pathname === p + '/'
      )
      if (!isAllowed) {
        throw redirect({ to: '/school/portals/teacher' })
      }
    }
  },
  component: () => <Outlet />,
})

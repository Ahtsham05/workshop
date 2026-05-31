import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { getSchoolRole } from '@/lib/school-role-guard'
import { getSchoolRoleHome } from '@/lib/school-permissions'
import { isPathAllowedForSchoolRole } from '@/lib/school-permissions'

/**
 * Layout route for ALL /_authenticated/school/* paths.
 * Redirects school-role users away from admin paths they cannot access.
 */
export const Route = createFileRoute('/_authenticated/school')({
  beforeLoad: ({ location }) => {
    const role = getSchoolRole()
    if (!role || role === 'schoolAdmin') return

    const allowed = isPathAllowedForSchoolRole(location.pathname, role)
    if (!allowed) {
      throw redirect({ to: getSchoolRoleHome(role) })
    }
  },
  component: () => <Outlet />,
})

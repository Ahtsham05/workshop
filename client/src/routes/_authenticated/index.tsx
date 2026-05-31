import { createFileRoute, redirect } from '@tanstack/react-router'
import Dashboard from '@/features/dashboard'
import { deriveSchoolRoleFromStorage, getSchoolRoleHome } from '@/lib/school-permissions'
import { canViewDashboard, getDefaultHomeRoute, readStoredUser } from '@/lib/default-home-route'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: () => {
    const schoolRole = deriveSchoolRoleFromStorage()
    if (schoolRole && schoolRole !== 'schoolAdmin') {
      throw redirect({ to: getSchoolRoleHome(schoolRole) })
    }

    const user = readStoredUser()
    if (!canViewDashboard(user)) {
      const home = getDefaultHomeRoute(user)
      if (home !== '/') {
        throw redirect({ to: home })
      }
    }
  },
  component: Dashboard,
})

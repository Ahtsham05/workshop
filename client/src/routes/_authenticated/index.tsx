import { createFileRoute, redirect } from '@tanstack/react-router'
import Dashboard from '@/features/dashboard'
import { deriveSchoolRoleFromStorage, getSchoolRoleHome } from '@/lib/school-permissions'

export const Route = createFileRoute('/_authenticated/')({
  beforeLoad: () => {
    // Non-admin school roles must never land on the admin home page.
    const schoolRole = deriveSchoolRoleFromStorage()
    if (schoolRole && schoolRole !== 'schoolAdmin') {
      throw redirect({ to: getSchoolRoleHome(schoolRole) })
    }
  },
  component: Dashboard,
})

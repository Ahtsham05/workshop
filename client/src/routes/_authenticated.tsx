import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { Link } from '@tanstack/react-router'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PortalShell } from '@/components/layout/portal-shell'
import { PermissionWrapper } from '@/context/permission-wrapper'
import { TrialExpirationBoundary } from '@/components/trial-expiration-boundary'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { resolveRouteAccess } from '@/lib/route-permissions'

/**
 * Authenticated layout component.
 *
 * Authentication is guaranteed by the beforeLoad guard below — if the user
 * is not authenticated, beforeLoad throws a redirect to /sign-in BEFORE
 * this component ever renders.  Therefore there is no need to re-check
 * isAuthenticated here; doing so caused a race condition where React's
 * concurrent scheduler rendered the component with a stale context value
 * (isAuthenticated = false) before the AuthProvider re-render from Redux
 * propagated, showing a persistent "Checking Authentication" spinner.
 */
function AuthenticatedLayout() {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showLogoReminder = Boolean(user?.organizationId) && !orgData?.logo?.url

  // Portal users (students & parents) get a clean, sidebar-free shell.
  const schoolRole: string | undefined =
    user?.schoolRole ||
    (() => {
      try {
        const stored = localStorage.getItem('user')
        return stored ? JSON.parse(stored)?.schoolRole : undefined
      } catch {
        return undefined
      }
    })()
  const isPortalUser = schoolRole === 'student' || schoolRole === 'parent'

  if (isPortalUser) {
    return (
      <TrialExpirationBoundary>
        <PermissionWrapper>
          <PortalShell>
            <Outlet />
          </PortalShell>
        </PermissionWrapper>
      </TrialExpirationBoundary>
    )
  }

  return (
    <TrialExpirationBoundary>
      <PermissionWrapper>
        <SidebarProvider>
          <AppSidebar />
          <main className="min-w-0 flex-1 overflow-hidden">
            {showLogoReminder && (
              <div className="m-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm flex items-center justify-between">
                <span className="text-blue-900">
                  Add your company logo to show it on receipts for all branches.
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/branches">Set Logo</Link>
                </Button>
              </div>
            )}
            <Outlet />
          </main>
        </SidebarProvider>
      </PermissionWrapper>
    </TrialExpirationBoundary>
  )
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Check authentication on the client side
    const token = localStorage.getItem('accessToken')
    const user = localStorage.getItem('user')
    
    if (!token || !user) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
    
    // Validate user data
    try {
      const userData = JSON.parse(user)
      if (!userData.id) {
        throw new Error('Invalid user data')
      }
      // If onboarding is not complete, redirect to onboarding
      if (userData.onboardingComplete === false) {
        throw redirect({ to: '/onboarding' })
      }

      // ── Teacher portal guard ─────────────────────────────────────────────
      // School teachers/parents/students: enforced by resolveRouteAccess below.
      // Legacy inline teacher guard kept for fast redirect before full parse.
      const schoolRole: string | null =
        userData?.schoolRole || (userData?.linkedTeacherId ? 'teacher' : null)
      if (schoolRole === 'teacher') {
        const TEACHER_ALLOWED: string[] = [
          '/school/portals/teacher',
          '/school/teacher-leave',
        ]
        const allowed = TEACHER_ALLOWED.some(
          (p) =>
            location.pathname === p ||
            location.pathname.startsWith(p + '/'),
        )
        if (!allowed) {
          throw redirect({ to: '/school/portals/teacher' })
        }
      } else if (schoolRole === 'parent') {
        const PARENT_ALLOWED: string[] = ['/school/portals/parent']
        const allowed = PARENT_ALLOWED.some(
          (p) =>
            location.pathname === p ||
            location.pathname.startsWith(p + '/'),
        )
        if (!allowed) {
          throw redirect({ to: '/school/portals/parent' })
        }
      } else if (schoolRole === 'student') {
        const STUDENT_ALLOWED: string[] = ['/school/portals/student']
        const allowed = STUDENT_ALLOWED.some(
          (p) =>
            location.pathname === p ||
            location.pathname.startsWith(p + '/'),
        )
        if (!allowed) {
          throw redirect({ to: '/school/portals/student' })
        }
      }

      // ── ERP role permission guard ──────────────────────────────────────────
      const access = resolveRouteAccess(userData, location.pathname)
      if (!access.allowed) {
        throw redirect({ to: access.redirectTo || '/403' })
      }
      // ─────────────────────────────────────────────────────────────────────
    } catch (error) {
      // Re-throw any router redirect/navigation errors unchanged.
      // TanStack Router uses `isRedirect` on the thrown object; older builds
      // used `redirect`. Check both so neither is swallowed.
      if ((error as any)?.isRedirect || (error as any)?.redirect) throw error
      // Clear invalid data
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})

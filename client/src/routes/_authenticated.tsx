import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PermissionWrapper } from '@/context/permission-wrapper'
import { TrialExpirationBoundary } from '@/components/trial-expiration-boundary'

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
  return (
    <TrialExpirationBoundary>
      <PermissionWrapper>
        <SidebarProvider>
          <AppSidebar />
          <main className="min-w-0 flex-1 overflow-hidden">
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
      // School teachers may ONLY access their portal and leave page.
      // Every other route is blocked here so they can never land on admin pages
      // via direct URL navigation or browser back/forward.
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

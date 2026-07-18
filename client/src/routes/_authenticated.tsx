import { useEffect } from 'react'
import { createFileRoute, redirect, Outlet, Link, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PortalShell } from '@/components/layout/portal-shell'
import { PermissionWrapper } from '@/context/permission-wrapper'
import { WhatsAppProvider } from '@/context/whatsapp-context'
import { TrialExpirationBoundary } from '@/components/trial-expiration-boundary'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { Button } from '@/components/ui/button'
import { resolveRouteAccess } from '@/lib/route-permissions'
import { deriveSchoolRole } from '@/lib/school-permissions'
import { restoreSessionFromCache } from '@/lib/auth-cache'
import { looksLikeJwt } from '@/lib/auth-token'
import { LocalDatabaseSetupBanner } from '@/features/settings/local-database/local-database-setup-banner'
import { setActiveOrganizationBusinessType } from '@/lib/organization-context'

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
  const { pathname } = useLocation()
  // The WhatsApp inbox is its own full-bleed chat UI (own header/composer, no page
  // padding) — it doesn't want the fixed-header spacer that every other page needs.
  const isWhatsAppInbox = pathname.replace(/\/+$/, '') === '/whatsapp'
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: orgData } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const showLogoReminder = Boolean(user?.organizationId) && !orgData?.logo?.url

  useEffect(() => {
    if (orgData?.businessType) {
      setActiveOrganizationBusinessType(orgData.businessType)
    }
  }, [orgData?.businessType])

  const storedUser = (() => {
    try {
      const raw = localStorage.getItem('user')
      return raw ? JSON.parse(raw) : null
    } catch {
      return null
    }
  })()
  const schoolRole =
    deriveSchoolRole(user) ?? deriveSchoolRole(storedUser) ?? undefined
  const isPortalUser = schoolRole === 'student' || schoolRole === 'parent'
  const isTeacher = schoolRole === 'teacher'

  if (isPortalUser) {
    return (
      <TrialExpirationBoundary>
        <PermissionWrapper>
          <WhatsAppProvider>
            <PortalShell>
              <Outlet />
            </PortalShell>
          </WhatsAppProvider>
        </PermissionWrapper>
      </TrialExpirationBoundary>
    )
  }

  return (
    <TrialExpirationBoundary>
      <PermissionWrapper>
        <WhatsAppProvider>
          <SidebarProvider>
          <AppSidebar />
          <div className="min-w-0 flex-1 overflow-hidden flex flex-col">
            <AuthenticatedHeader showSearch={!isTeacher} />
            {showLogoReminder && (
              <div className="mx-3 mt-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm flex items-center justify-between shrink-0">
                <span className="text-blue-900">
                  Add your company logo to show it on receipts for all branches.
                </span>
                <Button asChild size="sm" variant="outline">
                  <Link to="/branches">Set Logo</Link>
                </Button>
              </div>
            )}
            <LocalDatabaseSetupBanner />
            <Main
              className={cn(
                'min-h-0 flex-1 overflow-auto',
                isWhatsAppInbox && 'peer-[.header-fixed]/header:mt-0',
              )}
            >
              <Outlet />
            </Main>
          </div>
        </SidebarProvider>
        </WhatsAppProvider>
      </PermissionWrapper>
    </TrialExpirationBoundary>
  )
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Check authentication on the client side
    let token = localStorage.getItem('accessToken')
    let user = localStorage.getItem('user')

    if (!token || !user || !looksLikeJwt(token)) {
      await restoreSessionFromCache()
      token = localStorage.getItem('accessToken')
      user = localStorage.getItem('user')
    }

    if (!token || !user || !looksLikeJwt(token)) {
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

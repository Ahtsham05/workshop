import { useEffect, useLayoutEffect } from 'react'
import { createFileRoute, redirect, Outlet, useLocation } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { AuthenticatedHeader } from '@/components/layout/authenticated-header'
import { Main } from '@/components/layout/main'
import { SidebarProvider } from '@/components/ui/sidebar'
import { PortalShell } from '@/components/layout/portal-shell'
import { PermissionWrapper } from '@/context/permission-wrapper'
import { WhatsAppProvider } from '@/context/whatsapp-context'
import { TrialExpirationBoundary } from '@/components/trial-expiration-boundary'
import { organizationApi, useGetMyOrganizationQuery } from '@/stores/organization.api'
import { toast } from 'sonner'
import { useDispatch, useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { resolveRouteAccess } from '@/lib/route-permissions'
import { deriveSchoolRole } from '@/lib/school-permissions'
import { restoreSessionFromCache } from '@/lib/auth-cache'
import { looksLikeJwt } from '@/lib/auth-token'
import { LocalDatabaseSetupBanner } from '@/features/settings/local-database/local-database-setup-banner'
import { setActiveOrganizationBusinessType, setActiveOrganizationMenuVisibility } from '@/lib/organization-context'
import { setAppDateFormat } from '@/lib/date-format'
import { BUSINESS_TIME_ZONE_CHANGED_EVENT, setBusinessTimeZone } from '@/lib/business-timezone'
import { timeZoneShortName } from '@/lib/time-zones'
import { PushNotificationPrompt } from '@/components/push-notification-prompt'
import { RolePermissionsSync } from '@/components/role-permissions-sync'
import { useReminderWatchdog } from '@/hooks/use-reminder-watchdog'
import { SignupLeadWatchdog } from '@/hooks/use-signup-lead-watchdog'
import { ImpersonationBanner } from '@/components/impersonation-banner'
import { ReminderAlarmSplash } from '@/components/reminder-alarm-splash'
import { QuickLinksVoiceWidget } from '@/components/quick-links-voice-widget'
import { NotepadProvider } from '@/features/notepad/context/notepad-context'
import { QuickTransferProvider } from '@/features/stock-transfer/context/quick-transfer-context'
import { NotepadWindow } from '@/features/notepad/components/notepad-window'
import { CalculatorWindow } from '@/features/calculator/components/calculator-window'
import { ChatLiveProvider } from '@/features/chats/components/chat-live-provider'
import { PrintColorsSync } from '@/components/print-colors-sync'
import { WarehousePrintSync } from '@/components/warehouse-print-sync'

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
  const dispatch = useDispatch()

  // An admin changed the business time zone while this tab was open: the very next API response
  // carried it (lib/business-timezone#noteServerBusinessTimeZone). Refresh org data and say so;
  // reloading is offered so forms already filled with the old day pick up the new one.
  useEffect(() => {
    const onChange = (event: Event) => {
      const { to } = (event as CustomEvent<{ from: string; to: string }>).detail
      dispatch(organizationApi.util.invalidateTags(['Organization']))
      toast.info(`Business time zone changed to ${timeZoneShortName(to)}`, {
        id: 'business-time-zone-changed',
        duration: 20000,
        description: 'Dates, “today” and the clock now follow it. Reload to refresh any screen that is already open.',
        action: { label: 'Reload', onClick: () => window.location.reload() },
      })
    }
    window.addEventListener(BUSINESS_TIME_ZONE_CHANGED_EVENT, onChange)
    return () => window.removeEventListener(BUSINESS_TIME_ZONE_CHANGED_EVENT, onChange)
  }, [dispatch])

  const { current: ringingReminder, queueLength: ringingQueueLength, snoozeCurrent, completeCurrent } = useReminderWatchdog()

  useEffect(() => {
    if (orgData?.businessType) {
      setActiveOrganizationBusinessType(orgData.businessType)
    }
  }, [orgData?.businessType])

  // Settings → Menu & Pages, cached for the synchronous route guard.
  useEffect(() => {
    if (orgData) setActiveOrganizationMenuVisibility(orgData.menuVisibility)
  }, [orgData])

  // Settings → Localization date format drives every date label/field (see lib/date-format).
  useLayoutEffect(() => {
    if (orgData) setAppDateFormat(orgData.dateFormat)
    // Settings → Localization time zone: "today", date filters, datetime fields and the clock.
    if (orgData) setBusinessTimeZone(orgData.resolvedTimeZone || orgData.timeZone)
  }, [orgData])

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
    // No billing banner for students/parents — they can't renew the school's plan.
    // (A lapsed plan is still read-only for them; the server enforces that.)
    return (
      <>
        <PermissionWrapper>
          <WhatsAppProvider>
            <NotepadProvider>
              <PortalShell>
                <Outlet />
              </PortalShell>
              <NotepadWindow />
            </NotepadProvider>
          </WhatsAppProvider>
        </PermissionWrapper>
        <ImpersonationBanner />
      </>
    )
  }

  return (
    <TrialExpirationBoundary>
      <RolePermissionsSync />
      <PermissionWrapper>
        <WhatsAppProvider>
          {/* Mounted around the shell, not inside a page: the notepad has to stay
              alive across navigation so an open note survives changing screens. */}
          <NotepadProvider>
            {/* Quick Stock Transfer: opens over any page (header button / Ctrl+Alt+S / Ctrl+K). */}
            <QuickTransferProvider>
            <SidebarProvider>
              <AppSidebar />
              <div className="min-w-0 flex-1 overflow-hidden flex flex-col">
                <AuthenticatedHeader showSearch={!isTeacher} />
                <PushNotificationPrompt message="Enable browser notifications so reminder alarms reach you even when this tab is in the background." />
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
            </QuickTransferProvider>
            <NotepadWindow />
            <CalculatorWindow />
            {/* One chat socket for the session: live badges, toasts and open threads. */}
            <ChatLiveProvider />
            {/* Platform admins: alarm on new trial signups and due lead follow-ups. */}
            <SignupLeadWatchdog />
            {/* Platform support "Login as user": frame + way back to the admin account. */}
            <ImpersonationBanner />
            <PrintColorsSync />
            <WarehousePrintSync />
          </NotepadProvider>
        </WhatsAppProvider>
      </PermissionWrapper>
      {ringingReminder && (
        <ReminderAlarmSplash
          reminder={ringingReminder}
          queueLength={ringingQueueLength}
          onSnooze={snoozeCurrent}
          onComplete={completeCurrent}
        />
      )}
      <QuickLinksVoiceWidget />
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

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { NavGroup } from '@/components/layout/nav-group'
import { NavUser } from '@/components/layout/nav-user'
import { TeamSwitcher } from '@/components/layout/team-switcher'
import { BranchSwitcher } from '@/components/branch-switcher'
import { sidebarData } from './data/sidebar-data'
import { usePermissions } from '@/context/permission-context'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { GitBranch } from 'lucide-react'
import { normalizeBusinessType } from '@/lib/business-types'
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  // Use organization businessType as the source of truth, fall back to user's own field
  const userBusinessType = normalizeBusinessType(org?.businessType || user?.businessType)
  const { canAccess } = useFeatureAccess()

  // const isSysAdmin = user?.systemRole === 'superAdmin' || user?.systemRole === 'system_admin'
  // Only the platform system_admin bypasses plan/feature gates.
  // superAdmin is an org owner and must still be gated by their subscription.
  const isPlatformAdmin = user?.systemRole === 'system_admin'
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName)

  // Derive schoolRole: check Redux state first (post-login), then localStorage
  // (page reload / initial render before effects fire).  Both paths also accept
  // linkedTeacherId as a secondary signal for accounts created before the
  // schoolRole field was introduced.
  const schoolRole: string | undefined = (() => {
    // 1. Redux (authoritative after login)
    if (user?.schoolRole) return user.schoolRole as string
    if (user?.linkedTeacherId) return 'teacher'
    // 2. localStorage (authoritative on page reload before Redux hydrates)
    try {
      const stored = localStorage.getItem('user')
      if (stored) {
        const parsed = JSON.parse(stored)
        if (parsed?.schoolRole) return parsed.schoolRole as string
        if (parsed?.linkedTeacherId) return 'teacher'
      }
    } catch (_e) {}
    return undefined
  })()

  const canAccessItem = (item: any) => {
    // ── Teacher role: STRICT ALLOW-LIST ──────────────────────────────────────
    // If the user is a teacher, they may ONLY see items explicitly listed in
    // allowedSchoolRoles: ['teacher'].  Every other item is hidden regardless of
    // permissions.  This opt-in approach means new admin items never leak to
    // teachers even if someone forgets excludedSchoolRoles.
    if (schoolRole === 'teacher') {
      return !!(item.allowedSchoolRoles && item.allowedSchoolRoles.includes('teacher'))
    }

    // ── Other school roles (parent, schoolAdmin): opt-out block-list ─────────
    if (schoolRole) {
      if (item.allowedSchoolRoles && item.allowedSchoolRoles.length > 0) {
        if (!item.allowedSchoolRoles.includes(schoolRole)) return false
      }
      if (item.excludedSchoolRoles && item.excludedSchoolRoles.length > 0) {
        if (item.excludedSchoolRoles.includes(schoolRole)) return false
      }
    }

    // ── allowedSchoolRoles hard gate for users with no school role ────────────
    // If an item is restricted to specific school roles (e.g. teacher-only items
    // like "My Classroom"), users who have NO school role (org admins, owners)
    // must also be blocked — the check above only runs when schoolRole is truthy.
    if (item.allowedSchoolRoles && item.allowedSchoolRoles.length > 0 && !schoolRole) {
      return false
    }

    // Business-type restrictions apply to ALL users — including system_admin.
    // This ensures mobile-shop (and other typed) items are never shown in an
    // org that has a different business type, even for platform admins.
    if (item.businessTypes && item.businessTypes.length > 0) {
      if (!item.businessTypes.includes(userBusinessType)) {
        return false
      }
    }

    if (item.excludeBusinessTypes && item.excludeBusinessTypes.length > 0) {
      if (item.excludeBusinessTypes.includes(userBusinessType)) {
        return false
      }
    }

    // system_admin bypasses permission and feature-access gates (but NOT businessType above).
    if (user?.systemRole === 'system_admin') {
      if (item.systemRole) {
        const allowed = item.systemRole as string[]
        return allowed.includes('system_admin')
      }
      if (!item.permission) return true
      return hasPermission(item.permission as any)
    }

    // superAdmin bypasses feature-access restrictions
    if (!isPlatformAdmin) {
      // Feature-gating: hide items that the plan doesn't unlock
      if (item.requiredFeature && !canAccess(item.requiredFeature)) {
        return false
      }
    }

    if (item.systemRole) {
      if (!user?.systemRole) return false
      const allowed = item.systemRole as string[]
      return allowed.includes(user.systemRole)
    }

    if (!item.permission) {
      return true
    }

    return hasPermission(item.permission as any)
  }

  // Filter nav groups and items based on permissions
  const filteredNavGroups = sidebarData.navGroups
    .map((group) => ({
      ...group,
      items: group.items
        .map((item: any) => {
          if (!item.items) {
            return item
          }

          return {
            ...item,
            items: item.items.filter((nestedItem: any) => canAccessItem(nestedItem)),
          }
        })
        .filter((item: any) => {
          if (item.items) {
            return item.items.length > 0 && canAccessItem(item)
          }

          return canAccessItem(item)
        }),
    }))
    .filter((group) => group.items.length > 0)

  // Reorder groups for school orgs: School Management first
  const groupOrder =
    userBusinessType === 'school'
      ? schoolRole === 'teacher'
        ? [
            'My Classroom',
            'Administration',
            'Subscription',
            'Reports',
            'System Admin',
          ]
        : [
            'School Management',
            'Teachers',
            'Academics',
            'Fees & Accounts',
            'Portals',
            'Administration',
            'Subscription',
            'Reports',
            'System Admin',
          ]
      : userBusinessType === 'restaurant'
        ? [
            'Restaurant',
            'Human Resources',
            'Administration',
            'Subscription',
            'Reports',
            'System Admin',
          ]
        : [
            'General',
            'Mobile Shop',
            'School Management',
            'Human Resources',
            'Reports',
            'Administration',
            'Subscription',
            'System Admin',
          ]

  const orderedNavGroups = [...filteredNavGroups].sort((a, b) => {
    const ai = groupOrder.indexOf(a.title)
    const bi = groupOrder.indexOf(b.title)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  return (
    <Sidebar collapsible='icon' variant='floating' {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
        {/* Branch switcher for admins; read-only branch badge for school-role users */}
        {!schoolRole ? (
          <div className="px-2 pb-1">
            <BranchSwitcher />
          </div>
        ) : activeBranchName ? (
          <div className="px-2 pb-1 flex items-center gap-2 text-xs text-muted-foreground border rounded-md p-2 mx-1">
            <GitBranch className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate font-medium">{activeBranchName}</span>
          </div>
        ) : null}
      </SidebarHeader>
      <SidebarContent>
        {orderedNavGroups.map((props) => (
          <NavGroup key={props.title} {...props} />
        ))}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

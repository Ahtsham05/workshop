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

  const canAccessItem = (item: any) => {
    if (item.businessTypes && item.businessTypes.length > 0) {
      if (!item.businessTypes.includes(userBusinessType)) {
        return false
      }
    }

    // Feature-gating: hide items that the plan doesn't unlock
    if (item.requiredFeature && !canAccess(item.requiredFeature)) {
      return false
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

  return (
    <Sidebar collapsible='icon' variant='floating' {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={sidebarData.teams} />
        <div className="px-2 pb-1">
          <BranchSwitcher />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {filteredNavGroups.map((props) => (
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

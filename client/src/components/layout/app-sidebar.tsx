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

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)

  // Filter nav groups and items based on permissions
  const filteredNavGroups = sidebarData.navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        // System-role gated items
        if ((item as any).systemRole) {
          if (!user?.systemRole) return false
          const allowed = (item as any).systemRole as string[]
          return allowed.includes(user.systemRole)
        }
        // If item has no permission requirement, show it
        if (!item.permission) return true
        // Otherwise check if user has the required permission
        return hasPermission(item.permission as any)
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

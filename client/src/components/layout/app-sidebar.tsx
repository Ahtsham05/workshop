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
import { useLanguage } from '@/context/language-context'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { GitBranch } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { useFilteredNavGroups } from '@/hooks/use-filtered-nav-groups'

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasExplicitPermission } = usePermissions()
  const { t } = useLanguage()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName)
  const orderedNavGroups = useFilteredNavGroups()

  const schoolRole: string | undefined = (() => {
    if (user?.schoolRole) return user.schoolRole as string
    if (user?.linkedTeacherId) return 'teacher'
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

  const sidebarPlan = hasExplicitPermission('viewRoles')
    ? t('admin_dashboard') || 'Admin Dashboard'
    : hasExplicitPermission('viewDashboard')
      ? t('dashboard') || 'Dashboard'
      : t('employee_portal') || 'Employee Portal'

  const teams = sidebarData.teams.map((team, index) =>
    index === 0 ? { ...team, plan: sidebarPlan } : team,
  )

  return (
    <Sidebar collapsible='icon' variant='floating' {...props}>
      <SidebarHeader>
        <TeamSwitcher teams={teams} />
        {!schoolRole ? (
          <div className="px-2 pb-1">
            <BranchSwitcher />
          </div>
        ) : activeBranchName ? (
          <div className="px-2 pb-1 flex items-center gap-2 text-xs text-sidebar-foreground/75 border border-sidebar-border rounded-md bg-sidebar-accent/20 p-2 mx-1">
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/70" />
            <span className="truncate font-medium">{activeBranchName}</span>
            {schoolRole === 'teacher' && <div className="ml-auto"><NotificationBell /></div>}
          </div>
        ) : schoolRole === 'teacher' ? (
          <div className="px-2 pb-1 flex items-center justify-end">
            <NotificationBell />
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

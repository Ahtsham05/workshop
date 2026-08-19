import { useMemo, useState } from 'react'
import { Command as CommandPrimitive } from 'cmdk'
import { useNavigate } from '@tanstack/react-router'
import { IconSearch, IconX } from '@tabler/icons-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from '@/components/ui/sidebar'
import { Command, CommandList, CommandItem, CommandEmpty } from '@/components/ui/command'
import { NavGroup } from '@/components/layout/nav-group'
import { NavUser } from '@/components/layout/nav-user'
import { TeamSwitcher } from '@/components/layout/team-switcher'
import { BranchSwitcher } from '@/components/branch-switcher'
import { sidebarData } from './data/sidebar-data'
import type { NavGroup as NavGroupType } from './types'
import { usePermissions } from '@/context/permission-context'
import { useLanguage } from '@/context/language-context'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { GitBranch } from 'lucide-react'
import { NotificationBell } from '@/components/notification-bell'
import { useFilteredNavGroups } from '@/hooks/use-filtered-nav-groups'

interface SearchEntry {
  key: string
  url: string
  title: string
  parentTitle?: string
  icon?: React.ElementType
}

// Flattens the (permission-filtered) nav tree into a single searchable list —
// sub-items carry their parent's title as a breadcrumb since the search
// results are shown without group headings.
function buildSearchIndex(groups: NavGroupType[], t: (key: string) => string): SearchEntry[] {
  const entries: SearchEntry[] = []
  for (const group of groups) {
    for (const item of group.items) {
      if (item.items) {
        for (const sub of item.items) {
          entries.push({
            key: `${item.title}-${sub.title}-${sub.url}`,
            url: sub.url as string,
            title: t(sub.title),
            parentTitle: t(item.title),
            icon: sub.icon || item.icon,
          })
        }
      } else {
        entries.push({
          key: `${item.title}-${item.url}`,
          url: item.url as string,
          title: t(item.title),
          icon: item.icon,
        })
      }
    }
  }
  return entries
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { hasExplicitPermission } = usePermissions()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const activeBranchName = useSelector((state: RootState) => state.auth.activeBranchName)
  const orderedNavGroups = useFilteredNavGroups()
  const [searchQuery, setSearchQuery] = useState('')
  const isSearching = searchQuery.trim().length > 0

  const searchIndex = useMemo(() => buildSearchIndex(orderedNavGroups, t), [orderedNavGroups, t])
  const matches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return searchIndex.filter(
      (entry) => entry.title.toLowerCase().includes(q) || entry.parentTitle?.toLowerCase().includes(q),
    )
  }, [searchIndex, searchQuery])

  const goTo = (url: string) => {
    navigate({ to: url })
    setSearchQuery('')
  }

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
      {/* `contents` keeps this out of the flex layout so SidebarHeader/SidebarContent
          size exactly as if they were direct children of Sidebar — the Command root
          only needs to wrap both so keyboard nav (arrow keys / Enter) reaches the
          results list down in SidebarContent from the input up in SidebarHeader.
          text-sidebar-foreground is required here too: `contents` removes the box but
          NOT color inheritance, so Command's own default text-popover-foreground was
          otherwise leaking down and darkening every nav item's text. */}
      <Command shouldFilter={false} className="contents text-sidebar-foreground">
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

          <div className="relative px-2 pb-1 group-data-[collapsible=icon]:hidden">
            <IconSearch className="pointer-events-none absolute top-1/2 left-4.5 h-3.5 w-3.5 -translate-y-1/2 text-sidebar-foreground/50" />
            <CommandPrimitive.Input
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder={t('search_menu_placeholder')}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchQuery('')
              }}
              className="border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground placeholder:text-sidebar-foreground/50 focus-visible:ring-sidebar-ring/50 focus-visible:border-sidebar-ring flex h-8 w-full rounded-md border pr-7 pl-8 text-sm outline-none focus-visible:ring-[3px]"
            />
            {isSearching && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute top-1/2 right-4.5 -translate-y-1/2 text-sidebar-foreground/50 hover:text-sidebar-foreground"
                aria-label={t('clear')}
              >
                <IconX className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </SidebarHeader>

        <SidebarContent>
          {isSearching ? (
            <CommandList className="max-h-none p-2">
              <CommandEmpty className="text-sidebar-foreground/60 py-4 text-center text-sm">
                {t('no_results_found')}
              </CommandEmpty>
              {matches.map((entry) => (
                <CommandItem
                  key={entry.key}
                  value={entry.key}
                  onSelect={() => goTo(entry.url)}
                  className="text-sidebar-foreground data-[selected=true]:bg-sidebar-accent data-[selected=true]:text-sidebar-accent-foreground rounded-md"
                >
                  {entry.icon && <entry.icon className="text-sidebar-foreground/60" />}
                  <span className="flex min-w-0 flex-col items-start leading-tight">
                    {entry.parentTitle && (
                      <span className="text-sidebar-foreground/50 truncate text-[10px]">
                        {entry.parentTitle}
                      </span>
                    )}
                    <span className="truncate">{entry.title}</span>
                  </span>
                </CommandItem>
              ))}
            </CommandList>
          ) : (
            orderedNavGroups.map((group) => <NavGroup key={group.title} {...group} />)
          )}
        </SidebarContent>
      </Command>
      <SidebarFooter>
        <NavUser user={sidebarData.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}

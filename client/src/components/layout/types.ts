import { LinkProps } from '@tanstack/react-router'

interface User {
  name: string
  email: string
  avatar: string
}

interface Team {
  name: string
  logo: React.ElementType
  plan: string
}

interface BaseNavItem {
  title: string
  badge?: string
  icon?: React.ElementType
  permission?: string
  systemRole?: string[]
  businessTypes?: string[]
  excludeBusinessTypes?: string[]
  /** Feature key that must be unlocked on the user's plan. Used with useFeatureAccess(). */
  requiredFeature?: string
  /** If set, only users whose schoolRole is in this list can see this item */
  allowedSchoolRoles?: string[]
  /** If set, users whose schoolRole is in this list cannot see this item */
  excludedSchoolRoles?: string[]
}

type NavLink = BaseNavItem & {
  url: LinkProps['to']
  items?: never
}

type NavCollapsible = BaseNavItem & {
  items: (BaseNavItem & { url: LinkProps['to'] })[]
  url?: never
}

type NavItem = NavCollapsible | NavLink

interface NavGroup {
  title: string
  items: NavItem[]
  /** When true, the group label becomes a collapsible toggle */
  collapsible?: boolean
}

interface SidebarData {
  user: User
  teams: Team[]
  navGroups: NavGroup[]
}

export type { SidebarData, NavGroup, NavItem, NavCollapsible, NavLink }

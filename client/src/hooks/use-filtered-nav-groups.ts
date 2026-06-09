import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import type { NavGroup } from '@/components/layout/types'
import { usePermissions } from '@/context/permission-context'
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { normalizeBusinessType } from '@/lib/business-types'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { RootState } from '@/stores/store'

function resolveSchoolRole(user: any): string | undefined {
  if (user?.schoolRole) return user.schoolRole as string
  if (user?.linkedTeacherId) return 'teacher'
  try {
    const stored = localStorage.getItem('user')
    if (stored) {
      const parsed = JSON.parse(stored)
      if (parsed?.schoolRole) return parsed.schoolRole as string
      if (parsed?.linkedTeacherId) return 'teacher'
    }
  } catch {
    // ignore
  }
  return undefined
}

function getGroupOrder(userBusinessType: string, schoolRole?: string): string[] {
  if (userBusinessType === 'school') {
    return schoolRole === 'teacher'
      ? ['My Classroom', 'Administration', 'Subscription', 'Reports', 'System Admin']
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
  }
  if (userBusinessType === 'restaurant') {
    return [
      'Restaurant',
      'Human Resources',
      'Administration',
      'Subscription',
      'Reports',
      'System Admin',
    ]
  }
  return [
    'General',
    'Mobile Shop',
    'School Management',
    'Human Resources',
    'Reports',
    'Administration',
    'Subscription',
    'System Admin',
  ]
}

export function useFilteredNavGroups(): NavGroup[] {
  const { hasPermission, hasExplicitPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const userBusinessType = normalizeBusinessType(org?.businessType || user?.businessType)
  const { canAccess } = useFeatureAccess()
  const isPlatformAdmin = user?.systemRole === 'system_admin'
  const schoolRole = resolveSchoolRole(user)

  return useMemo(() => {
    const checkItemPermission = (permission: string) => {
      if (permission === 'viewDashboard') {
        return hasExplicitPermission('viewDashboard')
      }
      return hasPermission(permission as any)
    }

    const canAccessItem = (item: any) => {
      if (!WHATSAPP_UI_ENABLED && (item.url === '/school/whatsapp' || item.url?.startsWith('/whatsapp'))) {
        return false
      }

      if (schoolRole === 'teacher') {
        return !!(item.allowedSchoolRoles && item.allowedSchoolRoles.includes('teacher'))
      }

      if (schoolRole) {
        if (item.allowedSchoolRoles && item.allowedSchoolRoles.length > 0) {
          if (!item.allowedSchoolRoles.includes(schoolRole)) return false
        }
        if (item.excludedSchoolRoles && item.excludedSchoolRoles.length > 0) {
          if (item.excludedSchoolRoles.includes(schoolRole)) return false
        }
      }

      if (item.allowedSchoolRoles && item.allowedSchoolRoles.length > 0 && !schoolRole) {
        return false
      }

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

      if (user?.systemRole === 'system_admin') {
        if (item.systemRole) {
          const allowed = item.systemRole as string[]
          return allowed.includes('system_admin')
        }
        if (!item.permission) return true
        return checkItemPermission(item.permission)
      }

      if (!isPlatformAdmin) {
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

      return checkItemPermission(item.permission)
    }

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

    const groupOrder = getGroupOrder(userBusinessType, schoolRole)

    return [...filteredNavGroups].sort((a, b) => {
      const ai = groupOrder.indexOf(a.title)
      const bi = groupOrder.indexOf(b.title)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
  }, [
    user,
    userBusinessType,
    schoolRole,
    isPlatformAdmin,
    hasPermission,
    hasExplicitPermission,
    canAccess,
    org?.businessType,
  ])
}

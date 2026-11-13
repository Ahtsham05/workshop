import { useMemo } from 'react'
import { useSelector } from 'react-redux'
import { sidebarData } from '@/components/layout/data/sidebar-data'
import type { NavGroup } from '@/components/layout/types'
import { usePermissions } from '@/context/permission-context'
import { useFeatureAccess } from '@/hooks/use-feature-access'
import { useManufacturingAccess } from '@/hooks/use-manufacturing-access'
import { useWarehouseSettings } from '@/hooks/use-warehouse-settings'
import { isPathHiddenForBusiness, normalizeBusinessType } from '@/lib/business-types'
import { applyMenuLabels, applyMenuLayout, sortGroupsByLayout } from '@/lib/menu-layout'
import { getGroupOrder } from '@/lib/nav-group-order'
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

export { getGroupOrder } from '@/lib/nav-group-order'

/**
 * The sidebar for this login: the built-in menu, rearranged/renamed by the org's
 * Settings → Menu & Pages layout, then filtered by business type, plan and role.
 * `includeMenuHidden` keeps pages the org hid from the sidebar but left working
 * ("Hidden in menu") — for search (Ctrl+K, sidebar search), which should still find them.
 */
export function useFilteredNavGroups({ includeMenuHidden = false }: { includeMenuHidden?: boolean } = {}): NavGroup[] {
  const { hasPermission, hasExplicitPermission } = usePermissions()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  const userBusinessType = normalizeBusinessType(org?.businessType || user?.businessType)
  const { available: manufacturingOn } = useManufacturingAccess()
  const { enabled: warehousesOn } = useWarehouseSettings()
  const { canAccess } = useFeatureAccess()
  const isPlatformAdmin = user?.systemRole === 'system_admin'
  const schoolRole = resolveSchoolRole(user)

  return useMemo(() => {
    const layout = org?.menuLayout
    const menuHidden = new Set(layout?.menuHidden ?? [])
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

      // Pages switched off for this org (business-type defaults + Settings → Menu & Pages).
      if (isPathHiddenForBusiness(userBusinessType, item.url, org?.menuVisibility)) {
        return false
      }

      // "Hidden in menu": still works, just not listed in the sidebar itself.
      if (!includeMenuHidden && item.url && menuHidden.has(String(item.url))) {
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

      if (item.module === 'manufacturing' && !manufacturingOn) {
        return false
      }

      if (item.module === 'warehouses' && !warehousesOn) {
        return false
      }

      if (item.excludeBusinessTypes && item.excludeBusinessTypes.length > 0) {
        if (item.excludeBusinessTypes.includes(userBusinessType)) {
          return false
        }
      }

      if (item.allowedEmails && item.allowedEmails.length > 0) {
        if (!user?.email || !item.allowedEmails.includes(user.email)) {
          return false
        }
      }

      if (user?.systemRole === 'system_admin') {
        if (item.systemRole) {
          const allowed = item.systemRole as string[]
          return allowed.includes('system_admin')
        }
        if (item.anyPermission) return item.anyPermission.some((p: string) => checkItemPermission(p))
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

      if (item.anyPermission) {
        return item.anyPermission.some((p: string) => checkItemPermission(p))
      }

      if (!item.permission) {
        return true
      }

      return checkItemPermission(item.permission)
    }

    // The IMEI tracking page also handles plain serial-number tracking (see
    // route-permissions.ts) — orgs that aren't mobile shops never use IMEIs, so the
    // nav label shouldn't mention them.
    const applyDynamicTitle = (item: any) => {
      if (item.url === '/mobile-shop/imei-tracking' && userBusinessType !== 'mobile_shop') {
        return { ...item, title: 'Serial Number Tracking' }
      }
      return item
    }

    const filteredNavGroups = applyMenuLayout(sidebarData.navGroups, layout)
      .map((group) => ({
        ...group,
        items: group.items
          .map((item: any) => {
            if (!item.items) {
              return applyDynamicTitle(item)
            }

            return {
              ...item,
              items: item.items.filter((nestedItem: any) => canAccessItem(nestedItem)).map(applyDynamicTitle),
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

    const typeSorted = [...filteredNavGroups].sort((a, b) => {
      const ai = groupOrder.indexOf(a.title)
      const bi = groupOrder.indexOf(b.title)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })
    // The org's own group order and names (Settings → Menu & Pages) come last.
    return applyMenuLabels(sortGroupsByLayout(typeSorted, layout), layout)
  }, [
    includeMenuHidden,
    org?.menuLayout,
    user,
    userBusinessType,
    schoolRole,
    isPlatformAdmin,
    hasPermission,
    hasExplicitPermission,
    canAccess,
    org?.businessType,
    org?.menuVisibility,
    manufacturingOn,
    warehousesOn,
  ])
}

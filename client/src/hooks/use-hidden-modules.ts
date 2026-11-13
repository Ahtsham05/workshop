import { useSelector } from 'react-redux'
import {
  type HideableModule,
  type MenuVisibility,
  isModuleHiddenForBusiness,
  isPathHiddenForBusiness,
  normalizeBusinessType,
} from '@/lib/business-types'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'

/** The signed-in org's business type + its Settings → Menu & Pages choices. */
export function useMenuVisibility(): { businessType: string; overrides: MenuVisibility } {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  return {
    businessType: normalizeBusinessType(org?.businessType || user?.businessType),
    overrides: org?.menuVisibility ?? {},
  }
}

/** True when this organization has the page at `url` switched off (type default or Menu & Pages). */
export function useIsPageHidden(url: string): boolean {
  const { businessType, overrides } = useMenuVisibility()
  return isPathHiddenForBusiness(businessType, url, overrides)
}

/**
 * Whether a whole module is off for this organization — e.g. a distributor starts with
 * salesmen and communications off, and every page of a module switched off in
 * Settings → Menu & Pages turns its in-page parts off too (Salesman picker, Communication Log).
 */
export function useIsModuleHidden(module: HideableModule): boolean {
  const { businessType, overrides } = useMenuVisibility()
  return isModuleHiddenForBusiness(businessType, module, overrides)
}

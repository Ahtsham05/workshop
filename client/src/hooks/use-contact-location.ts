import { useSelector } from 'react-redux'
import { usesContactLocation } from '@/lib/business-types'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'

/**
 * Whether this organization keeps City / State / Country on customers and suppliers
 * (wholesale & distributor), and the country a new contact starts with (the org's own).
 */
export function useContactLocation(): { enabled: boolean; defaultCountry: string } {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  return {
    enabled: usesContactLocation(org?.businessType || user?.businessType),
    defaultCountry: String(org?.countryCode || '').toUpperCase(),
  }
}

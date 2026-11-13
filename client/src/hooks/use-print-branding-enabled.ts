import { useSelector } from 'react-redux'
import { usesPrintBrandingChoice } from '@/lib/business-types'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import type { RootState } from '@/stores/store'

/** Whether invoice Print buttons offer "With logo / Without logo" (wholesale & distributor organizations). */
export function usePrintBrandingEnabled(): boolean {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org } = useGetMyOrganizationQuery(undefined, { skip: !user?.organizationId })
  return usesPrintBrandingChoice(org?.businessType || user?.businessType)
}

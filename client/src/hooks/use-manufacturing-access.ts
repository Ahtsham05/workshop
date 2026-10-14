import { useSelector } from 'react-redux'
import { useGetManufacturingAccessQuery } from '@/stores/manufacturing.api'
import type { RootState } from '@/stores/store'
import { usePermissions } from '@/context/permission-context'

/**
 * Whether the Manufacturing module is on for the signed-in user — the organization's
 * business type is Manufacturing and the server's rollout list allows this login (see
 * server/src/services/manufacturing/access.service.js, which also enforces it). Used to
 * show or hide the module everywhere: sidebar, /manufacturing pages, the product form's
 * type field and the product details' Manufacturing tab.
 *
 * `enabled` stays false while loading, so nothing manufacturing flashes in and out.
 */
export function useManufacturingAccess() {
  const organizationId = useSelector(
    (s: RootState) => s.auth.data?.user?.organizationId
  )
  const { hasPermission } = usePermissions()
  const { data, isLoading, isError } = useGetManufacturingAccessQuery(
    undefined,
    { skip: !organizationId }
  )
  return {
    /** The module is on for this login (business type + rollout list). */
    available: !!data?.enabled,
    /** …and this user's role may view it. */
    enabled: !!data?.enabled && hasPermission('viewManufacturing'),
    reason: data?.reason ?? null,
    /** Visible only because this login is a tester (not because of the business type). */
    tester: data?.via === 'tester',
    isLoading: isLoading && !isError,
  }
}

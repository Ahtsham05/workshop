import { usePermissions } from '@/context/permission-context'

/**
 * Mirrors server/src/config/stockCountPermissions.js: editProducts can count and approve,
 * 'countStock' is floor staff, 'approveStockCounts' signs off variances.
 */
export function useStockCountAccess() {
  const { hasAnyPermission } = usePermissions()
  return {
    canCount: hasAnyPermission('countStock', 'approveStockCounts', 'editProducts'),
    canApprove: hasAnyPermission('approveStockCounts', 'editProducts'),
    canViewCost: hasAnyPermission('viewProducts', 'approveStockCounts', 'editProducts', 'viewPurchases', 'createPurchases'),
  }
}

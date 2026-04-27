import { type ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isMobileShopBusiness } from '@/lib/business-types'

interface MobileShopGuardProps {
  children: ReactNode
  /**
   * Where to redirect non-mobile-shop users.
   * Defaults to the root dashboard.
   */
  redirectTo?: string
  /**
   * Render this element instead of redirecting (useful for in-page sections).
   */
  fallback?: ReactNode
}

/**
 * MobileShopGuard — renders children only when the organisation's
 * business type is `mobile_shop`.
 *
 * • Redirects (or shows a fallback) for all other business types.
 * • Returns null while org data is still loading to avoid a flash.
 * • Platform system_admin can access everything for support/testing.
 *
 * Usage in route files:
 *
 *   export const Route = createFileRoute('/_authenticated/mobile-shop/wallet')({
 *     component: () => (
 *       <MobileShopGuard>
 *         <WalletPage />
 *       </MobileShopGuard>
 *     ),
 *   })
 */
export function MobileShopGuard({
  children,
  redirectTo = '/',
  fallback,
}: MobileShopGuardProps) {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org, isLoading } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })

  // Platform system_admin bypasses all business-type gates (for support / testing).
  if (user?.systemRole === 'system_admin') return <>{children}</>

  // Don't flash a redirect while the org data is loading.
  if (isLoading) return null

  const businessType = org?.businessType ?? user?.businessType

  if (!isMobileShopBusiness(businessType)) {
    if (fallback) return <>{fallback}</>
    return <Navigate to={redirectTo} search={{}} />
  }

  return <>{children}</>
}

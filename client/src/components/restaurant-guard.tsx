import { type ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { Loader2 } from 'lucide-react'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isRestaurantBusiness } from '@/lib/business-types'

interface RestaurantGuardProps {
  children: ReactNode
  redirectTo?: string
  fallback?: ReactNode
}

/**
 * Renders children only when the organisation is a restaurant / food and beverage business.
 */
export function RestaurantGuard({
  children,
  redirectTo = '/',
  fallback,
}: RestaurantGuardProps) {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org, isLoading } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })

  if (user?.systemRole === 'system_admin') return <>{children}</>

  if (isLoading) {
    return (
      <div className='flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-muted-foreground'>
        <Loader2 className='h-9 w-9 animate-spin' aria-hidden />
        <p className='text-center text-sm'>Loading restaurant workspace…</p>
      </div>
    )
  }

  const businessType = org?.businessType ?? user?.businessType

  if (!isRestaurantBusiness(businessType)) {
    if (fallback) return <>{fallback}</>
    return <Navigate to={redirectTo} search={{}} />
  }

  return <>{children}</>
}

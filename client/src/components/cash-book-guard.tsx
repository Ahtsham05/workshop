import { type ReactNode } from 'react'
import { Navigate } from '@tanstack/react-router'
import { useSelector } from 'react-redux'
import { Loader2 } from 'lucide-react'
import { RootState } from '@/stores/store'
import { useGetMyOrganizationQuery } from '@/stores/organization.api'
import { isCashBookBusiness } from '@/lib/business-types'

interface CashBookGuardProps {
  children: ReactNode
  redirectTo?: string
  fallback?: ReactNode
}

/**
 * Cash Book & related cash features — all business types except school and restaurant.
 */
export function CashBookGuard({
  children,
  redirectTo = '/',
  fallback,
}: CashBookGuardProps) {
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data: org, isLoading } = useGetMyOrganizationQuery(undefined, {
    skip: !user?.organizationId,
  })

  if (user?.systemRole === 'system_admin') return <>{children}</>

  if (isLoading) {
    return (
      <div className='flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-muted-foreground'>
        <Loader2 className='h-9 w-9 animate-spin' aria-hidden />
        <p className='text-center text-sm'>Loading…</p>
      </div>
    )
  }

  const businessType = org?.businessType ?? user?.businessType

  if (!isCashBookBusiness(businessType)) {
    if (fallback) return <>{fallback}</>
    return <Navigate to={redirectTo} search={{}} />
  }

  return <>{children}</>
}

import { useNavigate } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import { useSelector } from 'react-redux'
import { RootState } from '@/stores/store'
import { getDefaultHomeRoute } from '@/lib/default-home-route'
import { getUserHome } from '@/lib/rbac'
import type { AppUser } from '@/lib/rbac'

export default function ForbiddenError() {
  const navigate = useNavigate()
  const user = useSelector((state: RootState) => state.auth.data?.user) as AppUser | null
  const home = user ? getUserHome(user) : getDefaultHomeRoute(user)
  const safeHome = home === '/403' ? '/sign-in' : home

  return (
    <div className='h-svh'>
      <div className='m-auto flex h-full w-full flex-col items-center justify-center gap-2'>
        <h1 className='text-[7rem] leading-tight font-bold'>403</h1>
        <span className='font-medium'>Access Forbidden</span>
        <p className='text-muted-foreground text-center'>
          You don&apos;t have the necessary permission <br />
          to view this page.
        </p>
        <div className='mt-6 flex gap-4'>
          <Button variant='outline' onClick={() => window.history.back()}>
            Go Back
          </Button>
          <Button onClick={() => navigate({ to: safeHome })}>Back to Home</Button>
        </div>
      </div>
    </div>
  )
}

import { useEffect } from 'react'
import { useRefetchOnFocusIfStale } from '@/hooks/use-refetch-on-focus-if-stale'
import { useDispatch, useSelector } from 'react-redux'
import { useGetMyProfileQuery } from '@/stores/user-preferences.api'
import { setUserRole } from '@/stores/auth.slice'
import type { RootState } from '@/stores/store'

const REFRESH_MS = 60 * 1000

/**
 * Keeps the signed-in user's role permissions current. They are stored at sign-in, so
 * without this an admin's change on the Roles page would only reach a logged-in user's
 * menus and buttons after they signed out and back in (the server enforces it at once).
 * Re-reads GET /users/me every minute, and on window focus when the copy is over 30s old.
 */
export function RolePermissionsSync() {
  const dispatch = useDispatch()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data, refetch, fulfilledTimeStamp } = useGetMyProfileQuery(undefined, {
    skip: !user?.id,
    pollingInterval: REFRESH_MS,
  })
  // On focus only when the copy is over 30s old — every alt-tab / DevTools click used to
  // re-read /users/me (plus a CORS preflight). The 60s poll still keeps roles current.
  useRefetchOnFocusIfStale(refetch, fulfilledTimeStamp, { enabled: !!user?.id })

  const fresh = data?.role && typeof data.role === 'object' ? data.role : null
  const current = user?.role && typeof user.role === 'object' ? user.role : null

  useEffect(() => {
    if (!fresh?.permissions) return
    if (JSON.stringify(fresh.permissions) === JSON.stringify(current?.permissions ?? null)) return
    dispatch(setUserRole({ ...(current ?? {}), ...fresh }))
  }, [fresh, current, dispatch])

  return null
}

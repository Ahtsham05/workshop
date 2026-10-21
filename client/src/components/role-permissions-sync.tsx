import { useEffect } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useGetMyProfileQuery } from '@/stores/user-preferences.api'
import { setUserRole } from '@/stores/auth.slice'
import type { RootState } from '@/stores/store'

const REFRESH_MS = 60 * 1000

/**
 * Keeps the signed-in user's role permissions current. They are stored at sign-in, so
 * without this an admin's change on the Roles page would only reach a logged-in user's
 * menus and buttons after they signed out and back in (the server enforces it at once).
 * Re-reads GET /users/me every minute and when the window regains focus.
 */
export function RolePermissionsSync() {
  const dispatch = useDispatch()
  const user = useSelector((state: RootState) => state.auth.data?.user)
  const { data, refetch } = useGetMyProfileQuery(undefined, {
    skip: !user?.id,
    pollingInterval: REFRESH_MS,
  })

  useEffect(() => {
    if (!user?.id) return
    const onFocus = () => {
      void refetch()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [user?.id, refetch])

  const fresh = data?.role && typeof data.role === 'object' ? data.role : null
  const current = user?.role && typeof user.role === 'object' ? user.role : null

  useEffect(() => {
    if (!fresh?.permissions) return
    if (JSON.stringify(fresh.permissions) === JSON.stringify(current?.permissions ?? null)) return
    dispatch(setUserRole({ ...(current ?? {}), ...fresh }))
  }, [fresh, current, dispatch])

  return null
}

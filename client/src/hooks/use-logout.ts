import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { logout } from '@/stores/auth.slice'
import { useAuth } from '@/context/auth-context'
import { clearAllAuthStorage } from '@/lib/auth-cache'
import toast from 'react-hot-toast'

export function useLogout() {
  const dispatch = useDispatch<AppDispatch>()
  const { clearOfflineMode } = useAuth()

  /**
   * Deliberately synchronous, and deliberately does NOT dispatch `setUser(null)` /
   * `setActiveBranch(null)` / `resetAllApiCaches` on this store before navigating.
   * This always ends in a hard `window.location.href` reload, which throws away the
   * whole Redux store a moment later anyway — so mutating it first only made the
   * still-fully-visible old page re-render into a half-logged-out state first (every
   * permission-gated sidebar item disappearing down to just "Notes", the one item
   * with no permission check) before the browser had even started navigating away.
   * That re-render was the bug, not a rendering glitch on the *new* page. Skipping
   * straight to clearing storage and navigating means the old page never gets a
   * chance to repaint at all.
   */
  const handleLogout = () => {
    const refreshToken = localStorage.getItem('refreshToken')

    // Best-effort, not awaited: revoke the refresh token server-side if the request
    // can complete before the page unloads. Not blocking on it is safe — the client
    // discards its own copy of the token in the same tick below, so even if this
    // never reaches the server, the token can't be reused from this device again.
    if (refreshToken) {
      dispatch(logout({ refreshToken })).catch(() => undefined)
    }

    clearOfflineMode()
    clearAllAuthStorage()

    toast.success('Logged out successfully')
    window.location.href = '/sign-in'
  }

  return { logout: handleLogout }
}

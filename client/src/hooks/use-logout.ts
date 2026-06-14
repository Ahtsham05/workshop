import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { logout, setActiveBranch, setUser } from '@/stores/auth.slice'
import { useAuth } from '@/context/auth-context'
import { clearAllAuthStorage } from '@/lib/auth-cache'
import toast from 'react-hot-toast'

export function useLogout() {
  const dispatch = useDispatch<AppDispatch>()
  const { clearOfflineMode } = useAuth()

  const handleLogout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')

    try {
      if (refreshToken) {
        await dispatch(logout({ refreshToken })).unwrap()
      }
    } catch {
      // Still clear local session even if the API call fails.
    }

    dispatch(setUser(null))
    dispatch(setActiveBranch(null))
    clearOfflineMode()
    clearAllAuthStorage()

    toast.success('Logged out successfully')
    window.location.href = '/sign-in'
  }

  return { logout: handleLogout }
}

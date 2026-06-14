import { useDispatch } from 'react-redux'
import { useNavigate } from '@tanstack/react-router'
import { AppDispatch } from '@/stores/store'
import { setActiveBranch, setUser } from '@/stores/auth.slice'
import { useAuth } from '@/context/auth-context'
import toast from 'react-hot-toast'

export function useLogout() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()
  const { clearOfflineMode } = useAuth()

  const handleLogout = () => {
    // Clear client auth state immediately (no API dependency).
    dispatch(setUser(null))
    dispatch(setActiveBranch(null))
    clearOfflineMode()

    // Clear persisted auth data.
    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')
    localStorage.removeItem('user')
    localStorage.removeItem('activeBranchId')
    localStorage.removeItem('activeBranchName')
    toast.success('Logged out successfully')

    // Force hard navigation to break out of any pending guarded route state.
    navigate({ to: '/sign-in', search: { redirect: '/' }, replace: true })
    window.location.assign('/sign-in')
  }

  return { logout: handleLogout }
}

import { useDispatch } from 'react-redux'
import { useNavigate } from '@tanstack/react-router'
import { AppDispatch } from '@/stores/store'
import { logout } from '@/stores/auth.slice'
import toast from 'react-hot-toast'

export function useLogout() {
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()

  const handleLogout = async () => {
    try {
      // Call logout API if needed
      await dispatch(logout({}))
      
      // Clear local storage
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      
      // Show success message
      toast.success('Logged out successfully')
      
      // Redirect to login
      navigate({ to: '/sign-in', search: { redirect: '/_authenticated/' }, replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Even if API call fails, clear local data
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      
      navigate({ to: '/sign-in', search: { redirect: '/_authenticated/' }, replace: true })
    }
  }

  return { logout: handleLogout }
}

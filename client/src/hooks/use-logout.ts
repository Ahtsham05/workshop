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
      const refreshToken = localStorage.getItem('refreshToken')
      await dispatch(logout({ refreshToken }))
      
      // Clear local storage
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      localStorage.removeItem('activeBranchId')
      localStorage.removeItem('activeBranchName')
      
      // Show success message
      toast.success('Logged out successfully')
      
      // Redirect to login
      navigate({ to: '/sign-in', search: { redirect: '/' }, replace: true })
    } catch (error) {
      console.error('Logout error:', error)
      // Even if API call fails, clear local data
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      localStorage.removeItem('activeBranchId')
      localStorage.removeItem('activeBranchName')
      
      navigate({ to: '/sign-in', search: { redirect: '/' }, replace: true })
    }
  }

  return { logout: handleLogout }
}

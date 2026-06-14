import { useEffect, useCallback } from 'react'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { refreshToken, logout } from '@/stores/auth.slice'
import { useNavigate } from '@tanstack/react-router'
import { isApiUnreachable } from '@/lib/auth-cache'
import { looksLikeJwt } from '@/lib/auth-token'

// Hook to handle token refresh
export function useTokenRefresh() {
  const dispatch = useDispatch<AppDispatch>()
  
  // Safely get navigate function, handle case when router isn't ready
  let navigate: any = null
  try {
    navigate = useNavigate()
  } catch (error) {
    // Router not ready yet, we'll handle navigation manually
    console.warn('Router not ready for navigation')
  }

  const handleTokenRefresh = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      return false
    }

    if (localStorage.getItem('offlineMode') === 'true') {
      return false
    }

    const refreshTokenValue = localStorage.getItem('refreshToken')
    const accessToken = localStorage.getItem('accessToken')

    if (!looksLikeJwt(accessToken)) {
      return false
    }
    
    if (!refreshTokenValue) {
      return false
    }

    try {
      const action = await dispatch(refreshToken({ refreshToken: refreshTokenValue }))
      
      if (refreshToken.fulfilled.match(action) && action.payload?.access?.token) {
        localStorage.setItem('accessToken', action.payload.access.token)
        if (action.payload.refresh?.token) {
          localStorage.setItem('refreshToken', action.payload.refresh.token)
        }
        return true
      }

      // Only force logout when refresh was rejected with auth failure, not network errors.
      if (refreshToken.rejected.match(action)) {
        const reason = action.payload ?? action.error
        if (isApiUnreachable(reason) || isApiUnreachable(action.error)) {
          return false
        }
        await dispatch(logout({}))
        if (navigate) {
          navigate({ to: '/sign-in', search: { redirect: '/_authenticated/' }, replace: true })
        } else {
          window.location.href = '/sign-in'
        }
      }
      return false
    } catch (error) {
      console.error('Token refresh failed:', error)
      if (isApiUnreachable(error)) {
        return false
      }
      await dispatch(logout({}))
      if (navigate) {
        navigate({ to: '/sign-in', search: { redirect: '/_authenticated/' }, replace: true })
      } else {
        window.location.href = '/sign-in'
      }
      return false
    }
  }, [dispatch, navigate])

  // Check token expiration and refresh if needed
  const checkAndRefreshToken = useCallback(() => {
    const token = localStorage.getItem('accessToken')
    
    if (!looksLikeJwt(token)) return

    try {
      const payload = JSON.parse(atob(token!.split('.')[1]))
      const currentTime = Date.now() / 1000
      
      // If token expires in the next 5 minutes, refresh it
      if (payload.exp && payload.exp - currentTime < 300) {
        handleTokenRefresh()
      }
    } catch (error) {
      console.error('Error checking token expiration:', error)
    }
  }, [handleTokenRefresh])

  // Set up automatic token refresh check
  useEffect(() => {
    // Only setup if we're in browser and router is available
    if (typeof window === 'undefined') return

    // Check token on mount
    checkAndRefreshToken()

    // Set up interval to check token every 5 minutes
    const interval = setInterval(checkAndRefreshToken, 5 * 60 * 1000)

    return () => clearInterval(interval)
  }, [checkAndRefreshToken])

  return { refreshToken: handleTokenRefresh, checkToken: checkAndRefreshToken }
}

// Axios interceptor for automatic token refresh on 401 responses
export function setupAxiosInterceptors() {
  // You can import your axios instance here and set up interceptors
  // This is a placeholder for the implementation
}

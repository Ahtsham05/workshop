import { createContext, useContext, useEffect, ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { setUser } from '@/stores/auth.slice'

interface AuthContextType {
  isAuthenticated: boolean
  user: any | null
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

export function AuthProvider({ children }: AuthProviderProps) {
  const dispatch = useDispatch<AppDispatch>()
  const authData = useSelector((state: RootState) => state.auth.data)

  // Initialize auth state from localStorage
  useEffect(() => {
    const initializeAuth = () => {
      // Only run in browser environment
      if (typeof window === 'undefined') return
      
      try {
        const token = localStorage.getItem('accessToken')
        const userStr = localStorage.getItem('user')
        const refreshToken = localStorage.getItem('refreshToken')

        if (token && userStr) {
          const user = JSON.parse(userStr)
          
          // Set user in Redux store
          dispatch(setUser({
            user,
            tokens: {
              access: { token },
              refresh: { token: refreshToken }
            }
          }))
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        // Clear invalid data
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('user')
        }
      }
    }

    // Only initialize if not already authenticated
    if (!authData?.user) {
      initializeAuth()
    }
  }, [dispatch, authData?.user])

  const isAuthenticated = !!(authData?.user && (typeof window !== 'undefined' && localStorage.getItem('accessToken')))
  
  const contextValue: AuthContextType = {
    isAuthenticated,
    user: authData?.user || null,
    isLoading: false, // You can add loading logic here if needed
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}

// Hook for checking authentication status
export function useIsAuthenticated() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}

// Hook for getting current user
export function useCurrentUser() {
  const { user } = useAuth()
  return user
}

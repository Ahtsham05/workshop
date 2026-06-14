import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import { setUser } from '@/stores/auth.slice'
import {
  getAuthCache,
  restoreSessionFromCache,
  saveAuthCache,
  tryOfflineLogin,
} from '@/lib/auth-cache'
import { looksLikeJwt } from '@/lib/auth-token'
import { AuthLoadingScreen } from '@/components/auth-loading-screen'

interface AuthContextType {
  isAuthenticated: boolean
  user: any | null
  isLoading: boolean
  isOnline: boolean
  isOfflineMode: boolean
  cacheCredentials: (user: Record<string, unknown>, token: string, email: string) => Promise<void>
  loginFromCache: (
    email: string,
  ) => Promise<
    { success: true; user: Record<string, unknown> } | { success: false; message: string }
  >
  clearOfflineMode: () => void
  setOfflineMode: (value: boolean) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

interface AuthProviderProps {
  children: ReactNode
}

const OFFLINE_MODE_KEY = 'offlineMode'

function readOfflineModeFlag(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(OFFLINE_MODE_KEY) === 'true'
}

function persistOfflineMode(value: boolean): void {
  if (typeof window === 'undefined') return
  if (value) {
    localStorage.setItem(OFFLINE_MODE_KEY, 'true')
  } else {
    localStorage.removeItem(OFFLINE_MODE_KEY)
  }
}

export function AuthProvider({ children }: AuthProviderProps) {
  const dispatch = useDispatch<AppDispatch>()
  const authData = useSelector((state: RootState) => state.auth.data)
  const [isOnline, setIsOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [isOfflineMode, setIsOfflineModeState] = useState(readOfflineModeFlag)
  const [isLoading, setIsLoading] = useState(true)

  const setOfflineMode = useCallback((value: boolean) => {
    setIsOfflineModeState(value)
    persistOfflineMode(value)
  }, [])

  const clearOfflineMode = useCallback(() => {
    setOfflineMode(false)
  }, [setOfflineMode])

  const cacheCredentials = useCallback(
    async (user: Record<string, unknown>, token: string, email: string) => {
      await saveAuthCache(user, token, email)
    },
    [],
  )

  const loginFromCache = useCallback(async (email: string) => {
    const cache = await tryOfflineLogin(email)
    if (!cache) {
      const hasCache = !!(await getAuthCache())
      return {
        success: false as const,
        message: hasCache
          ? 'Cached credentials do not match this email. Please check your email and try again.'
          : 'Please login online at least once first.',
      }
    }

    localStorage.setItem('accessToken', cache.token)
    localStorage.setItem('user', JSON.stringify(cache.user))

    dispatch(
      setUser({
        user: cache.user,
        tokens: {
          access: { token: cache.token },
          refresh: { token: localStorage.getItem('refreshToken') },
        },
      }),
    )

    setOfflineMode(true)
    return { success: true as const, user: cache.user }
  }, [dispatch, setOfflineMode])

  // Track network status throughout the app
  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)

    setIsOnline(navigator.onLine)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Auto-login from cached credentials on app start
  useEffect(() => {
    if (typeof window === 'undefined') return

    const initializeAuth = async () => {
      try {
        let token = localStorage.getItem('accessToken')
        let userStr = localStorage.getItem('user')

        if (!token || !userStr || !looksLikeJwt(token)) {
          await restoreSessionFromCache()
          token = localStorage.getItem('accessToken')
          userStr = localStorage.getItem('user')
        }

        const cached = await getAuthCache()
        const activeToken = localStorage.getItem('accessToken')
        const activeUserStr = localStorage.getItem('user')
        const refreshToken = localStorage.getItem('refreshToken')

        if (activeToken && activeUserStr && looksLikeJwt(activeToken)) {
          const user = JSON.parse(activeUserStr)
          dispatch(
            setUser({
              user,
              tokens: {
                access: { token: activeToken },
                refresh: { token: refreshToken },
              },
            }),
          )

          if (!navigator.onLine && cached) {
            setOfflineMode(true)
          }
        }
      } catch (error) {
        console.error('Error initializing auth:', error)
        if (!looksLikeJwt(localStorage.getItem('accessToken'))) {
          localStorage.removeItem('accessToken')
          localStorage.removeItem('refreshToken')
          localStorage.removeItem('user')
          setOfflineMode(false)
        }
      } finally {
        setIsLoading(false)
      }
    }

    initializeAuth()
  }, [dispatch, setOfflineMode])

  const isAuthenticated = !!(
    authData?.user &&
    typeof window !== 'undefined' &&
    looksLikeJwt(localStorage.getItem('accessToken'))
  )

  const contextValue: AuthContextType = {
    isAuthenticated,
    user: authData?.user || null,
    isLoading,
    isOnline,
    isOfflineMode,
    cacheCredentials,
    loginFromCache,
    clearOfflineMode,
    setOfflineMode,
  }

  return (
    <AuthContext.Provider value={contextValue}>
      {isLoading ? <AuthLoadingScreen /> : children}
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

export function useIsAuthenticated() {
  const { isAuthenticated } = useAuth()
  return isAuthenticated
}

export function useCurrentUser() {
  const { user } = useAuth()
  return user
}

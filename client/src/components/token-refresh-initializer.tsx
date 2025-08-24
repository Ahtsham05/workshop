import { useTokenRefresh } from '@/hooks/use-token-refresh'

// Component to initialize token refresh after router is ready
export function TokenRefreshInitializer() {
  // This will safely initialize the token refresh mechanism
  useTokenRefresh()
  
  return null // This component doesn't render anything
}

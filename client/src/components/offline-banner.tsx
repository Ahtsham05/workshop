import { WifiOff } from 'lucide-react'
import { useAuth } from '@/context/auth-context'

export function OfflineBanner() {
  const { isOnline, isOfflineMode } = useAuth()

  if (isOfflineMode) {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-red-600 px-4 py-2 text-sm font-medium text-white"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        Offline mode — logged in with cached credentials. Some features may be unavailable until you sign in online.
      </div>
    )
  }

  if (!isOnline) {
    return (
      <div
        role="status"
        className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-orange-500 px-4 py-2 text-sm font-medium text-white"
      >
        <WifiOff className="h-4 w-4 shrink-0" />
        You are offline. Changes will sync when your connection is restored.
      </div>
    )
  }

  return null
}

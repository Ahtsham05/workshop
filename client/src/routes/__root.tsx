import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router'
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Toaster } from '@/components/ui/sonner'
import { NavigationProgress } from '@/components/navigation-progress'
import { TokenRefreshInitializer } from '@/components/token-refresh-initializer'
import { PWAInstallBanner } from '@/components/pwa-install-banner'
import { SearchProvider } from '@/context/search-context'
import { RootError } from '@/components/root-error'
import NotFoundError from '@/features/errors/not-found-error'

/**
 * Root route component — intentionally minimal.
 *
 * ALL context providers (Redux, Auth, Theme, Language, Font, Permissions)
 * are already mounted in main.tsx ABOVE the RouterProvider.  Wrapping them
 * again here would create duplicate provider trees and, more critically,
 * cause Vite to pre-bundle react-redux with a separate React copy
 * (chunk-TJE776R7) that diverges from react-dom's React instance —
 * producing the "Cannot read properties of null (reading 'useContext')" crash.
 *
 * Route-specific layout (Sidebar, PermissionWrapper, auth guard) lives in
 * src/routes/_authenticated.tsx which is the proper TanStack Router pattern.
 */
function RootComponent() {
  return (
    <SearchProvider>
      <NavigationProgress />
      <TokenRefreshInitializer />
      <Outlet />
      <PWAInstallBanner />
      <Toaster position='top-right' duration={3500} />
      {import.meta.env.MODE === 'development' && (
        <>
          {/* <ReactQueryDevtools buttonPosition='bottom-left' /> */}
          {/* <TanStackRouterDevtools position='bottom-right' /> */}
        </>
      )}
    </SearchProvider>
  )
}

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  component: RootComponent,
  notFoundComponent: NotFoundError,
  errorComponent: RootError,
})

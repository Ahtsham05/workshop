import { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, Outlet, redirect, useLocation } from '@tanstack/react-router'
// import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
// import { TanStackRouterDevtools } from '@tanstack/router-devtools'
import { Toaster } from '@/components/ui/sonner'
import { NavigationProgress } from '@/components/navigation-progress'
import { TokenRefreshInitializer } from '@/components/token-refresh-initializer'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SearchProvider } from '@/context/search-context'
import { ThemeProvider } from '@/context/theme-context'
import { AuthProvider } from '@/context/auth-context'
import { LanguageProvider } from '@/context/language-context'
import Dashboard from '@/features/dashboard'
import GeneralError from '@/features/errors/general-error'
import NotFoundError from '@/features/errors/not-found-error'

// Root component that handles dashboard at root path and other routes
function RootComponent() {
  const location = useLocation()
  
  // If we're at the root path, show the dashboard with sidebar
  if (location.pathname === '/') {
    return (
      <LanguageProvider>
        <ThemeProvider>
          <AuthProvider>
            <SearchProvider>
              <NavigationProgress />
              <TokenRefreshInitializer />
              <SidebarProvider>
                <AppSidebar />
                <main className="flex-1 overflow-hidden">
                  <Dashboard />
                </main>
              </SidebarProvider>
              <Toaster duration={50000} />
              {import.meta.env.MODE === 'development' && (
                <>
                  {/* <ReactQueryDevtools buttonPosition='bottom-left' /> */}
                  {/* <TanStackRouterDevtools position='bottom-right' /> */}
                </>
              )}
            </SearchProvider>
          </AuthProvider>
        </ThemeProvider>
      </LanguageProvider>
    )
  }
  
  // For all other routes, use the normal outlet
  return (
    <LanguageProvider>
      <ThemeProvider>
        <AuthProvider>
          <SearchProvider>
            <NavigationProgress />
            <TokenRefreshInitializer />
            <Outlet />
            <Toaster duration={50000} />
            {import.meta.env.MODE === 'development' && (
              <>
                {/* <ReactQueryDevtools buttonPosition='bottom-left' /> */}
                {/* <TanStackRouterDevtools position='bottom-right' /> */}
              </>
            )}
          </SearchProvider>
        </AuthProvider>
      </ThemeProvider>
    </LanguageProvider>
  )
}
export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
  beforeLoad: async ({ location }) => {
    // Handle root path authentication check
    if (location.pathname === '/') {
      // Check authentication and redirect accordingly
      if (typeof window !== 'undefined') {
        const token = localStorage.getItem('accessToken')
        const user = localStorage.getItem('user')
        
        // Robust authentication check
        let isAuthenticated = false
        
        if (token && user) {
          try {
            const userData = JSON.parse(user)
            if (userData && userData.id && token.trim() !== '') {
              isAuthenticated = true
            }
          } catch (error) {
            // Clear invalid data
            localStorage.removeItem('accessToken')
            localStorage.removeItem('refreshToken')
            localStorage.removeItem('user')
            isAuthenticated = false
          }
        }
        
        if (!isAuthenticated) {
          // User is not authenticated, redirect to sign in
          throw redirect({
            to: '/sign-in',
            search: {
              redirect: '/',
            },
          })
        }
        // If authenticated, continue to render the dashboard content
      } else {
        // During SSR, default to sign-in
        throw redirect({
          to: '/sign-in',
          search: {
            redirect: '/',
          },
        })
      }
    }
  },
  component: RootComponent,
  notFoundComponent: NotFoundError,
  errorComponent: GeneralError,
})

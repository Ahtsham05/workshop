import { createFileRoute, redirect, Outlet } from '@tanstack/react-router'
import { AppSidebar } from '@/components/layout/app-sidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { useAuth } from '@/context/auth-context'
import { AuthLoadingScreen } from '@/components/auth-loading-screen'

// Authentication guard component for the _authenticated layout
function AuthenticatedLayout() {
  const { isAuthenticated } = useAuth()

  // If not authenticated, show loading or redirect
  if (!isAuthenticated) {
    return <AuthLoadingScreen />
  }

  return (
    <SidebarProvider>
      <AppSidebar />
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </SidebarProvider>
  )
}

export const Route = createFileRoute('/_authenticated')({
  beforeLoad: async ({ location }) => {
    // Check authentication on the client side
    const token = localStorage.getItem('accessToken')
    const user = localStorage.getItem('user')
    
    if (!token || !user) {
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
    
    // Validate user data
    try {
      const userData = JSON.parse(user)
      if (!userData.id) {
        throw new Error('Invalid user data')
      }
    } catch (error) {
      // Clear invalid data
      localStorage.removeItem('accessToken')
      localStorage.removeItem('refreshToken')
      localStorage.removeItem('user')
      throw redirect({
        to: '/sign-in',
        search: {
          redirect: location.href,
        },
      })
    }
  },
  component: AuthenticatedLayout,
})

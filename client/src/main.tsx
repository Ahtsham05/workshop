import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
// import { AxiosError } from 'axios'
import {
  // QueryCache,
  QueryClient,
} from '@tanstack/react-query'
import { RouterProvider, createRouter } from '@tanstack/react-router'
// import { toast } from 'sonner'
// import { useAuthStore } from '@/stores/authStore'
// import { handleServerError } from '@/utils/handle-server-error'
import { FontProvider } from './context/font-context'
import { ThemeProvider } from './context/theme-context'
import { LanguageProvider } from './context/language-context'
import { AuthProvider } from './context/auth-context'
import { AuthErrorBoundary } from './components/auth-error-boundary'
import { Provider } from "react-redux";
import { store } from './stores/store'
import './index.css'
// Generated Routes
import { routeTree } from './routeTree.gen'
import { Toaster } from 'react-hot-toast'

const queryClient = new QueryClient({})

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
})

// Register the router instance for type safety
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// Render the app
const rootElement = document.getElementById('root')!
if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement)
  root.render(
    <StrictMode>
      <Provider store={store}>
        <AuthErrorBoundary>
          <AuthProvider>
            <ThemeProvider defaultTheme='light' storageKey='vite-ui-theme'>
              <LanguageProvider>
                <FontProvider>
                  <RouterProvider router={router} />
                  <Toaster />
                </FontProvider>
              </LanguageProvider>
            </ThemeProvider>
          </AuthProvider>
        </AuthErrorBoundary>
      </Provider>
    </StrictMode>
  )
}

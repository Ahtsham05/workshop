import { StrictMode } from 'react'
import ReactDOM from 'react-dom/client'
import {
  QueryClient,
} from '@tanstack/react-query'
import { RouterProvider, createRouter, createHashHistory } from '@tanstack/react-router'
// import { toast } from 'sonner'
// import { useAuthStore } from '@/stores/authStore'
// import { handleServerError } from '@/utils/handle-server-error'
import { FontProvider } from './context/font-context'
import { ThemeProvider } from './context/theme-context'
import { LanguageProvider } from './context/language-context'
// Apply stored language to <html> before first render to avoid layout flash
import { getStoredLanguage, applyLanguageToDocument } from './i18n'
applyLanguageToDocument(getStoredLanguage())
import { AuthProvider } from './context/auth-context'
import { PermissionWrapper } from './context/permission-wrapper'
import { AuthErrorBoundary } from './components/auth-error-boundary'
import { Provider } from "react-redux";
import { store } from './stores/store'
import './index.css'
// Generated Routes
import { routeTree } from './routeTree.gen'
import { Toaster } from 'react-hot-toast'

const queryClient = new QueryClient({})
const isElectronApp = import.meta.env.VITE_ELECTRON === 'true'

// Create a new router instance
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  ...(isElectronApp ? { history: createHashHistory() } : {}),
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
            <PermissionWrapper>
              <ThemeProvider defaultTheme='light' storageKey='vite-ui-theme'>
                <LanguageProvider>
                  <FontProvider>
                    <RouterProvider router={router} />
                    <Toaster />
                  </FontProvider>
                </LanguageProvider>
              </ThemeProvider>
            </PermissionWrapper>
          </AuthProvider>
        </AuthErrorBoundary>
      </Provider>
    </StrictMode>
  )
}

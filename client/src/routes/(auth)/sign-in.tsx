import { createFileRoute, redirect } from '@tanstack/react-router'
import SignIn from '@/features/auth/sign-in'
import { restoreSessionFromCache } from '@/lib/auth-cache'
import { looksLikeJwt } from '@/lib/auth-token'

export const Route = createFileRoute('/(auth)/sign-in')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || '/',
    }
  },
  beforeLoad: async () => {
    // Check if user is already authenticated (only in browser)
    if (typeof window !== 'undefined') {
      let token = localStorage.getItem('accessToken')
      let user = localStorage.getItem('user')

      if (!token || !user || !looksLikeJwt(token)) {
        await restoreSessionFromCache()
        token = localStorage.getItem('accessToken')
        user = localStorage.getItem('user')
      }

      if (token && user && looksLikeJwt(token)) {
        // User is already authenticated, redirect to home page
        throw redirect({
          to: '/',
        })
      }
    }
  },
  component: SignIn,
})

import { createFileRoute, redirect } from '@tanstack/react-router'
import SignIn from '@/features/auth/sign-in'

export const Route = createFileRoute('/(auth)/sign-in')({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      redirect: (search.redirect as string) || '/',
    }
  },
  beforeLoad: async () => {
    // Check if user is already authenticated (only in browser)
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('accessToken')
      const user = localStorage.getItem('user')
      
      if (token && user) {
        // User is already authenticated, redirect to home page
        throw redirect({
          to: '/',
        })
      }
    }
  },
  component: SignIn,
})

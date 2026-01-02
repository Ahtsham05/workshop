import { useEffect } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/context/auth-context'
import { Logo } from '@/components/logo'

export default function LandingPage() {
  const navigate = useNavigate()
  const { isAuthenticated } = useAuth()

  useEffect(() => {
    // Redirect based on authentication status
    const timer = setTimeout(() => {
      if (isAuthenticated) {
        navigate({ to: '/_authenticated/' as any, replace: true })
      } else {
        navigate({ 
          to: '/sign-in', 
          search: { redirect: '/_authenticated/' },
          replace: true 
        })
      }
    }, 1000) // Give some time for auth context to initialize

    return () => clearTimeout(timer)
  }, [isAuthenticated, navigate])

  return (
    <div className="flex items-center justify-center min-h-screen bg-background">
      <div className="text-center space-y-6">
        <div className="flex justify-center mb-4">
          <Logo width={200} height={80} />
        </div>
        <div className="relative">
          <div className="w-16 h-16 border-4 border-primary/20 border-t-primary rounded-full animate-spin mx-auto"></div>
        </div>
        <div className="space-y-2">
          <h2 className="text-xl font-semibold text-foreground">Welcome to Jhulelal</h2>
          <p className="text-muted-foreground">Redirecting you to the application...</p>
        </div>
      </div>
    </div>
  )
}

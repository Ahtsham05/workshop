import { HTMLAttributes, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearch, useNavigate } from '@tanstack/react-router'
import { ArrowRight, Loader2, Lock, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { AuthInput, AuthPasswordInput } from '../../components/auth-fields'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { signinWithEmailPassword, setActiveBranch } from '@/stores/auth.slice'
import { resetAllApiCaches } from '@/stores/reset-all-apis'
import { getUserHome } from '@/lib/rbac'
import type { AppUser } from '@/lib/rbac'
import { resolveRouteAccess } from '@/lib/route-permissions'
import { useAuth } from '@/context/auth-context'
import { isNetworkError } from '@/lib/auth-cache'
import toast from 'react-hot-toast'

type UserAuthFormProps = HTMLAttributes<HTMLFormElement>

const formSchema = z.object({
  email: z
    .string()
    .min(1, { message: 'Please enter your email or user ID' })
    .refine(
      (val) => z.string().email().safeParse(val).success || /^\d+$/.test(val),
      { message: 'Enter a valid email or numeric user ID' },
    ),
  password: z
    .string()
    .min(1, {
      message: 'Please enter your password',
    })
    .min(7, {
      message: 'Password must be at least 7 characters long',
    }),
})

export function UserAuthForm({ className, ...props }: UserAuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const search = useSearch({ from: '/(auth)/sign-in' })
  const navigate = useNavigate()
  const { cacheCredentials, loginFromCache, clearOfflineMode } = useAuth()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })
  const dispatch = useDispatch<AppDispatch>()

  function navigateAfterLogin(loggedInUser: AppUser) {
    if (!loggedInUser?.onboardingComplete) {
      navigate({ to: '/onboarding', replace: true })
      return
    }

    const isSchoolTeacher =
      loggedInUser?.schoolRole === 'teacher' || !!loggedInUser?.linkedTeacherId
    if (isSchoolTeacher) {
      navigate({ to: '/school/portals/teacher', replace: true })
      return
    }

    if (loggedInUser?.schoolRole === 'parent') {
      navigate({ to: '/school/portals/parent', replace: true })
      return
    }

    if (loggedInUser?.schoolRole === 'student') {
      navigate({ to: '/school/portals/student', replace: true })
      return
    }

    const defaultHome = getUserHome(loggedInUser)
    const requested = search.redirect || defaultHome
    const access = resolveRouteAccess(loggedInUser, requested)
    navigate({ to: access.allowed ? requested : defaultHome, replace: true })
  }

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const result = await dispatch(signinWithEmailPassword(data)).unwrap()

      toast.success('Login successful!')

      const accessToken = result?.tokens?.access?.token
      localStorage.setItem('accessToken', accessToken)
      localStorage.setItem('refreshToken', result?.tokens?.refresh?.token)
      localStorage.setItem('user', JSON.stringify(result?.user))
      // Login is a client-side route transition, not a full reload — the Redux store
      // (and every RTK Query cache in it) survives across accounts in the same tab.
      // Clearing localStorage alone leaves state.auth.activeBranchId (in memory) still
      // pointing at whoever was logged in before, which stops BranchSwitcher's
      // auto-select effect from ever picking this user's real branch (it only fires
      // when activeBranchId is empty) — and leaves every cached query free to keep
      // serving the previous session's (possibly wrong-branch, wrong-permission) data.
      dispatch(setActiveBranch(null))
      resetAllApiCaches(dispatch)
      localStorage.removeItem('activeBranchId')
      localStorage.removeItem('activeBranchName')

      if (accessToken && result?.user) {
        await cacheCredentials(result.user, accessToken, data.email)
      }
      clearOfflineMode()

      navigateAfterLogin(result?.user as AppUser)
    } catch (error: unknown) {
      if (isNetworkError(error) || !navigator.onLine) {
        const offlineResult = await loginFromCache(data.email)
        if (offlineResult.success) {
          toast.success('Logged in offline using cached credentials')
          navigateAfterLogin(offlineResult.user as AppUser)
          return
        }
        toast.error(offlineResult.message)
        return
      }

      const err = error as { response?: { data?: { message?: string } }; message?: string }
      // The global error slice (utils/errorHandler -> setError) already toasts the
      // server's message, so only fill the gap when there isn't one.
      if (!err?.response?.data?.message) {
        toast.error(
          err?.message || 'Incorrect email/user ID or password. Please try again.'
        )
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-5', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email or User ID</FormLabel>
              <FormControl>
                <AuthInput
                  icon={User}
                  autoComplete='username'
                  placeholder='name@example.com or 100001'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem>
              <div className='flex items-center justify-between'>
                <FormLabel>Password</FormLabel>
                <Link
                  to='/forgot-password'
                  className='text-muted-foreground hover:text-foreground text-xs font-medium'
                >
                  Forgot password?
                </Link>
              </div>
              <FormControl>
                <AuthPasswordInput
                  icon={Lock}
                  autoComplete='current-password'
                  placeholder='Enter your password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='submit'
          className='h-11 w-full rounded-xl bg-neutral-900 text-sm text-white shadow-lg shadow-black/20 transition-all hover:bg-black hover:shadow-xl'
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className='h-4 w-4 animate-spin' />
              Signing in…
            </>
          ) : (
            <>
              Sign in
              <ArrowRight className='h-4 w-4' />
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}

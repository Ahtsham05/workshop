import { HTMLAttributes, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useSearch, useNavigate } from '@tanstack/react-router'
import { IconBrandFacebook, IconBrandGithub } from '@tabler/icons-react'
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
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/password-input'
import { useDispatch } from 'react-redux'
import { AppDispatch } from '@/stores/store'
import { signinWithEmailPassword } from '@/stores/auth.slice'
import { getUserHome } from '@/lib/rbac'
import type { AppUser } from '@/lib/rbac'
import { resolveRouteAccess } from '@/lib/route-permissions'
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

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  })
  const dispatch = useDispatch<AppDispatch>()
  
  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const result = await dispatch(signinWithEmailPassword(data)).unwrap()

      toast.success('Login successful!')

      // Store authentication data
      localStorage.setItem('accessToken', result?.tokens?.access?.token)
      localStorage.setItem('refreshToken', result?.tokens?.refresh?.token)
      localStorage.setItem('user', JSON.stringify(result?.user))
      // Always clear stale branch from previous session so the new user's
      // requests never carry a branch ID that belongs to another account.
      localStorage.removeItem('activeBranchId')
      localStorage.removeItem('activeBranchName')

      // Redirect to onboarding if not completed
      if (!result?.user?.onboardingComplete) {
        navigate({ to: '/onboarding', replace: true })
        return
      }

      // School teachers go directly to their portal — never to the admin area
      const loggedInUser = result?.user as AppUser
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
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } }; message?: string }
      const message =
        err?.response?.data?.message ||
        err?.message ||
        'Incorrect email/user ID or password. Please try again.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className={cn('grid gap-3', className)}
        {...props}
      >
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email or User ID</FormLabel>
              <FormControl>
                <Input placeholder='name@example.com or 100001' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='password'
          render={({ field }) => (
            <FormItem className='relative'>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <PasswordInput placeholder='********' {...field} />
              </FormControl>
              <FormMessage />
              <Link
                to='/forgot-password'
                className='text-muted-foreground absolute -top-0.5 right-0 text-sm font-medium hover:opacity-75'
              >
                Forgot password?
              </Link>
            </FormItem>
          )}
        />
        <Button type='submit' className='mt-2' disabled={isLoading}>
          Login
        </Button>

        <div className='relative my-2'>
          <div className='absolute inset-0 flex items-center'>
            <span className='w-full border-t' />
          </div>
          <div className='relative flex justify-center text-xs uppercase'>
            <span className='bg-background text-muted-foreground px-2'>
              Or continue with
            </span>
          </div>
        </div>

        <div className='grid grid-cols-2 gap-2'>
          <Button variant='outline' type='button' disabled={isLoading}>
            <IconBrandGithub className='h-4 w-4' /> GitHub
          </Button>
          <Button variant='outline' type='button' disabled={isLoading}>
            <IconBrandFacebook className='h-4 w-4' /> Facebook
          </Button>
        </div>
      </form>
    </Form>
  )
}

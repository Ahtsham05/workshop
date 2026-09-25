import { HTMLAttributes, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useDispatch } from 'react-redux'
import { ArrowRight, Loader2, Lock, Mail, User } from 'lucide-react'
import toast from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { AuthInput, AuthPasswordInput } from '../../components/auth-fields'
import { signupWithEmailPassword } from '@/stores/auth.slice'
import { AppDispatch } from '@/stores/store'

type SignUpFormProps = HTMLAttributes<HTMLFormElement>

const formSchema = z
  .object({
    name: z.string().min(1, { message: 'Please enter your name' }),
    email: z
      .string()
      .min(1, { message: 'Please enter your email' })
      .email({ message: 'Invalid email address' }),
    // Mirrors the server rule (validations/custom.validation.js). Letting a 7-character
    // or letters-only password through here only produced a rejection after submit.
    password: z
      .string()
      .min(1, { message: 'Please enter your password' })
      .min(8, { message: 'Password must be at least 8 characters long' })
      .regex(/\d/, { message: 'Password must contain at least one number' })
      .regex(/[a-zA-Z]/, { message: 'Password must contain at least one letter' }),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Password and confirm password does not match.',
    path: ['confirmPassword'],
  })

export function SignUpForm({ className, ...props }: SignUpFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const dispatch = useDispatch<AppDispatch>()
  const navigate = useNavigate()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const result = await dispatch(
        signupWithEmailPassword({
          name: data.name,
          email: data.email,
          password: data.password,
        })
      ).unwrap()

      if (!result?.user) {
        throw new Error('Sign up failed. Please try again.')
      }

      toast.success("Account created! Let's set up your company.")

      // Some deployments return tokens with the signup response; when they do the user
      // goes straight into onboarding, otherwise they sign in first.
      if (result?.tokens) {
        localStorage.setItem('accessToken', result.tokens?.access?.token)
        localStorage.setItem('refreshToken', result.tokens?.refresh?.token)
        localStorage.setItem('user', JSON.stringify(result.user))
        navigate({ to: '/onboarding', replace: true })
      } else {
        navigate({ to: '/sign-in', search: { redirect: '/' }, replace: true })
      }
    } catch (error: unknown) {
      const err = error as {
        response?: { data?: { message?: string } }
        message?: string
      }
      // A rejected API call already reaches the user through the global error slice
      // (utils/errorHandler -> setError -> toast), so re-announcing it here would show
      // the same red toast twice. Speak up only for failures nothing else reports —
      // like a 2xx response that came back without a user.
      if (!err?.response?.data?.message) {
        toast.error(err?.message || 'Could not create your account. Please try again.')
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
          name='name'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Full name</FormLabel>
              <FormControl>
                <AuthInput
                  icon={User}
                  autoComplete='name'
                  placeholder='Enter your full name'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='email'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email address</FormLabel>
              <FormControl>
                <AuthInput
                  icon={Mail}
                  autoComplete='email'
                  placeholder='name@example.com'
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
              <FormLabel>Password</FormLabel>
              <FormControl>
                <AuthPasswordInput
                  icon={Lock}
                  autoComplete='new-password'
                  placeholder='Create a password'
                  {...field}
                />
              </FormControl>
              <FormDescription className='text-xs'>
                At least 8 characters, with one letter and one number.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='confirmPassword'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Confirm password</FormLabel>
              <FormControl>
                <AuthPasswordInput
                  icon={Lock}
                  autoComplete='new-password'
                  placeholder='Re-enter your password'
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Button
          type='submit'
          className='h-11 w-full rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 text-sm text-white shadow-lg shadow-indigo-600/25 transition-all hover:from-indigo-600 hover:via-blue-600 hover:to-violet-600 hover:shadow-xl hover:brightness-110 dark:shadow-indigo-950/40'
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <Loader2 className='h-4 w-4 animate-spin' />
              Creating account…
            </>
          ) : (
            <>
              Create account
              <ArrowRight className='h-4 w-4' />
            </>
          )}
        </Button>
      </form>
    </Form>
  )
}

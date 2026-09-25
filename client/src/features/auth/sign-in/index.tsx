import { Link } from '@tanstack/react-router'
import AuthLayout from '../auth-layout'
import { UserAuthForm } from './components/user-auth-form'

export default function SignIn() {
  return (
    <AuthLayout
      title='Welcome back'
      description='Sign in to your Logix Plus account to pick up where you left off.'
      footer={
        <div className='space-y-4 text-center'>
          <p className='text-sm'>
            <span className='text-muted-foreground'>New to Logix Plus? </span>
            <Link
              to='/sign-up'
              className='text-primary font-medium underline-offset-4 hover:underline'
            >
              Create an account
            </Link>
          </p>
          <p className='text-muted-foreground text-xs'>
            By signing in you agree to our{' '}
            <a href='/terms' className='underline underline-offset-4 hover:text-foreground'>
              Terms of Service
            </a>{' '}
            and{' '}
            <a href='/privacy' className='underline underline-offset-4 hover:text-foreground'>
              Privacy Policy
            </a>
            .
          </p>
        </div>
      }
    >
      <UserAuthForm />
    </AuthLayout>
  )
}

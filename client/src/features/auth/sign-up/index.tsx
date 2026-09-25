import { Link } from '@tanstack/react-router'
import AuthLayout from '../auth-layout'
import { SignUpForm } from './components/sign-up-form'

export default function SignUp() {
  return (
    <AuthLayout
      title='Create your account'
      description='Set up your business on Logix Plus — it takes about a minute.'
      footer={
        <div className='space-y-4 text-center'>
          <p className='text-sm'>
            <span className='text-muted-foreground'>Already have an account? </span>
            <Link
              to='/sign-in'
              search={{ redirect: '/' }}
              className='text-primary font-medium underline-offset-4 hover:underline'
            >
              Sign in
            </Link>
          </p>
          <p className='text-muted-foreground text-xs'>
            By creating an account you agree to our{' '}
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
      <SignUpForm />
    </AuthLayout>
  )
}

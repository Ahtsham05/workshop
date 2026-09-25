import { Link } from '@tanstack/react-router'
import AuthLayout from '../auth-layout'
import { ForgotPasswordForm } from './components/forgot-password-form'

export default function ForgotPassword() {
  return (
    <AuthLayout
      title='Forgot your password?'
      description='Enter your registered email and we will send you a link to reset it.'
      footer={
        <p className='text-center text-sm'>
          <span className='text-muted-foreground'>Remembered it? </span>
          <Link
            to='/sign-in'
            search={{ redirect: '/' }}
            className='text-primary font-medium underline-offset-4 hover:underline'
          >
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthLayout>
  )
}

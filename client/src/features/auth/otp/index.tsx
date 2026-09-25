import { Link } from '@tanstack/react-router'
import AuthLayout from '../auth-layout'
import { OtpForm } from './components/otp-form'

export default function Otp() {
  return (
    <AuthLayout
      title='Two-factor authentication'
      description='Enter the authentication code we sent to your email.'
      footer={
        <p className='text-center text-sm'>
          <span className='text-muted-foreground'>Haven&apos;t received it? </span>
          <Link
            to='/sign-in'
            search={{ redirect: '/' }}
            className='text-primary font-medium underline-offset-4 hover:underline'
          >
            Resend a new code
          </Link>
        </p>
      }
    >
      <OtpForm />
    </AuthLayout>
  )
}

import { Logo } from '@/components/logo'

interface Props {
  children: React.ReactNode
}

export default function AuthLayout({ children }: Props) {
  return (
    <div className='bg-primary-foreground container grid h-svh max-w-none items-center justify-center'>
      <div className='mx-auto flex w-full flex-col justify-center space-y-2 py-8 sm:w-[480px] sm:p-8'>
        <div className='mb-6 flex items-center justify-center'>
          <Logo width={180} height={60} />
        </div>
        {children}
      </div>
    </div>
  )
}

import { ReactNode } from 'react'

interface MobilePageShellProps {
  title: string
  description: string
  children: ReactNode
}

export function MobilePageShell({ title, description, children }: MobilePageShellProps) {
  return (
    <>
      <div className='mb-6'>
        <h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
        <p className='text-muted-foreground'>{description}</p>
      </div>
      {children}
    </>
  )
}

import { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'

interface MobilePageShellProps {
  title: string
  description: string
  children: ReactNode
  /** Optional breadcrumb back-link, shown above the title (e.g. sub-pages of a hub). */
  backTo?: { to: string; label: string }
}

export function MobilePageShell({ title, description, children, backTo }: MobilePageShellProps) {
  return (
    <>
      <div className='mb-6'>
        {backTo && (
          <Link
            to={backTo.to}
            className='mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-primary'
          >
            <ChevronLeft className='h-4 w-4' /> {backTo.label}
          </Link>
        )}
        <h1 className='text-3xl font-bold tracking-tight'>{title}</h1>
        <p className='text-muted-foreground'>{description}</p>
      </div>
      {children}
    </>
  )
}

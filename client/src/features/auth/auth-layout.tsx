import { Logo } from '@/components/logo'
import { ThemeSwitch } from '@/components/theme-switch'
import { AuthBrandPanel } from './components/auth-brand-panel'

interface Props {
  /** Page heading, e.g. "Welcome back". */
  title: string
  /** One line under the heading. */
  description: React.ReactNode
  children: React.ReactNode
  /** Small print under the form (terms, "already have an account", …). */
  footer?: React.ReactNode
}

/**
 * The shell every auth screen sits in: brand on the left, form on the right.
 *
 * Below `lg` the brand panel drops away entirely and the form gets the whole screen —
 * most staff sign in from a phone, and a decorative half-screen would only push the
 * fields below the fold.
 */
export default function AuthLayout({
  title,
  description,
  children,
  footer,
}: Props) {
  return (
    <div className='bg-background grid min-h-svh lg:grid-cols-[1.05fr_1fr] lg:bg-[radial-gradient(circle_at_top_right,#eef2ff_0%,transparent_55%)] dark:lg:bg-none'>
      <AuthBrandPanel />

      <main className='relative flex flex-col justify-center px-5 py-10 sm:px-8'>
        <div className='absolute top-4 right-4'>
          <ThemeSwitch />
        </div>

        <div className='mx-auto w-full max-w-[420px] lg:rounded-2xl lg:border lg:bg-card lg:p-8 lg:shadow-xl lg:shadow-slate-900/[0.06] dark:lg:shadow-black/30'>
          {/* Phones and tablets never see the brand panel, so the mark goes here. */}
          <div className='mb-8 flex justify-center lg:hidden'>
            <Logo width={150} height={50} />
          </div>

          <div className='space-y-1.5'>
            <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
            <p className='text-muted-foreground text-sm'>{description}</p>
          </div>

          <div className='mt-7'>{children}</div>

          {footer ? <div className='mt-7'>{footer}</div> : null}
        </div>
      </main>
    </div>
  )
}

import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface OnboardingStep {
  key: string
  title: string
  description: string
}

interface Props {
  steps: OnboardingStep[]
  /** Index into `steps` of the step being shown. */
  current: number
  children: React.ReactNode
}

/**
 * Wizard chrome: a vertical stepper on the left (desktop) and a compact progress bar
 * on top (phones), so people always know how far in they are and how much is left —
 * the difference between "one more form" and "an endless setup".
 */
export function OnboardingShell({ steps, current, children }: Props) {
  const percent = Math.round(((current + 1) / steps.length) * 100)

  return (
    <div className='bg-background grid min-h-svh lg:grid-cols-[320px_1fr] lg:bg-[radial-gradient(circle_at_top_right,#eef2ff_0%,transparent_55%)] dark:lg:bg-none'>
      {/* Desktop rail */}
      <aside className='relative hidden overflow-hidden bg-[linear-gradient(165deg,#eef2ff_0%,#f5f7ff_45%,#eff6ff_100%)] p-10 text-slate-400 dark:bg-[linear-gradient(160deg,#0a1122_0%,#122142_55%,#1b3c78_100%)] lg:flex lg:flex-col'>
        <div
          className='pointer-events-none absolute -top-24 -right-20 h-72 w-72 rounded-full bg-indigo-400/25 blur-3xl'
          aria-hidden
        />
        <div
          className='pointer-events-none absolute -bottom-28 -left-16 h-72 w-72 rounded-full bg-blue-400/20 blur-3xl'
          aria-hidden
        />
        <div
          className='pointer-events-none absolute inset-0 opacity-[0.05] dark:opacity-[0.06]'
          style={{
            backgroundImage:
              'linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)',
            backgroundSize: '56px 56px',
          }}
          aria-hidden
        />

        <div className='relative flex items-center gap-3'>
          <img
            src='/images/logo-light.png'
            alt=''
            className='h-10 w-10 rounded-xl bg-white object-contain p-1 shadow-lg shadow-slate-900/10 dark:shadow-black/20'
            aria-hidden
          />
          <div className='leading-tight'>
            <p className='text-sm font-semibold text-slate-900 dark:text-white'>Logix Plus</p>
            <p className='text-xs text-slate-500 dark:text-sky-200/70'>Account setup</p>
          </div>
        </div>

        <ol className='relative mt-12 space-y-1'>
          {steps.map((step, index) => {
            const done = index < current
            const active = index === current
            return (
              <li key={step.key} className='flex gap-3'>
                <div className='flex flex-col items-center'>
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold transition-colors',
                      done &&
                        'border-indigo-500/40 bg-indigo-500/15 text-indigo-600 dark:border-sky-400/60 dark:bg-sky-400/20 dark:text-sky-100',
                      active &&
                        'border-transparent bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30 dark:from-white dark:to-white dark:text-[#12203f] dark:shadow-none',
                      !done &&
                        !active &&
                        'border-slate-900/15 bg-slate-900/[0.03] text-slate-400 dark:border-white/20 dark:bg-white/5 dark:text-sky-100/60'
                    )}
                  >
                    {done ? <Check className='h-4 w-4' aria-hidden /> : index + 1}
                  </span>
                  {index < steps.length - 1 && (
                    <span
                      className={cn(
                        'my-1 w-px flex-1 transition-colors',
                        done ? 'bg-indigo-400/40 dark:bg-sky-400/50' : 'bg-slate-900/10 dark:bg-white/15'
                      )}
                    />
                  )}
                </div>
                <div className='min-w-0 pb-6'>
                  <p
                    className={cn(
                      'text-sm font-medium transition-colors',
                      active || done
                        ? 'text-slate-900 dark:text-white'
                        : 'text-slate-400 dark:text-sky-100/60'
                    )}
                  >
                    {step.title}
                  </p>
                  <p className='text-xs text-slate-500 dark:text-sky-100/55'>{step.description}</p>
                </div>
              </li>
            )
          })}
        </ol>

        <p className='relative mt-auto text-xs text-slate-500 dark:text-sky-100/55'>
          Everything here can be changed later in Settings.
        </p>
      </aside>

      {/* Content */}
      <main className='flex flex-col'>
        {/* Phone progress */}
        <div className='border-b p-4 lg:hidden'>
          <div className='mb-2 flex items-center justify-between text-xs'>
            <span className='font-medium'>{steps[current]?.title}</span>
            <span className='text-muted-foreground'>
              Step {current + 1} of {steps.length}
            </span>
          </div>
          <div className='bg-muted h-1.5 w-full overflow-hidden rounded-full'>
            <div
              className='h-full rounded-full bg-gradient-to-r from-indigo-600 via-blue-600 to-violet-600 transition-all duration-300'
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className='flex flex-1 items-center justify-center px-5 py-8 sm:px-8'>
          <div className='w-full max-w-xl lg:rounded-2xl lg:border lg:bg-card lg:p-8 lg:shadow-xl lg:shadow-slate-900/[0.06] dark:lg:shadow-black/30'>
            {children}
          </div>
        </div>
      </main>
    </div>
  )
}

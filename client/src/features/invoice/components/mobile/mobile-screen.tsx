import type { ReactNode } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

interface MobileScreenProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: ReactNode
  /** Screen-reader description; defaults to the title. */
  description?: string
  headerRight?: ReactNode
  /** Sits under the title bar and stays put while the body scrolls (search bars, tabs). */
  subHeader?: ReactNode
  footer?: ReactNode
  children: ReactNode
  bodyClassName?: string
  /** Element to focus when the screen opens; nothing (no keyboard pop-up) by default. */
  onOpenAutoFocus?: (event: Event) => void
}

/**
 * A full-screen page that slides over the invoice on a phone — the customer search,
 * product search, line editor and posted invoice all use it, so they share one header
 * (back arrow + title), one scrolling body and one footer pinned above the home bar.
 *
 * Built on the Radix dialog: focus stays inside, the page behind can't scroll, Escape /
 * the back arrow close it, and pop-overs opened from inside (unit select, batch picker,
 * serial dialog) still stack above it.
 */
export function MobileScreen({
  open,
  onOpenChange,
  title,
  description,
  headerRight,
  subHeader,
  footer,
  children,
  bodyClassName,
  onOpenAutoFocus,
}: MobileScreenProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          onOpenAutoFocus={onOpenAutoFocus ?? ((e) => e.preventDefault())}
          className={cn(
            'fixed inset-0 z-50 flex h-[100dvh] flex-col bg-background text-foreground outline-none',
            'data-[state=open]:animate-in data-[state=open]:slide-in-from-right-8 data-[state=open]:fade-in-0',
            'data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right-8 data-[state=closed]:fade-out-0 duration-200',
          )}
        >
          <header className='flex h-14 shrink-0 items-center gap-1 border-b bg-background px-1.5 pt-[env(safe-area-inset-top)] shadow-[0_1px_0_rgba(0,0,0,0.02)]'>
            <DialogPrimitive.Close
              className='flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-foreground/80 transition-colors hover:bg-muted active:bg-muted'
              aria-label='Back'
            >
              <ArrowLeft className='h-5 w-5' />
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className='min-w-0 flex-1 truncate text-[15px] font-semibold'>{title}</DialogPrimitive.Title>
            <DialogPrimitive.Description className='sr-only'>
              {description ?? (typeof title === 'string' ? title : '')}
            </DialogPrimitive.Description>
            {headerRight ? <div className='flex shrink-0 items-center gap-1 pr-1'>{headerRight}</div> : null}
          </header>
          {subHeader ? <div className='shrink-0 border-b bg-background'>{subHeader}</div> : null}
          <div className={cn('min-h-0 flex-1 overflow-y-auto overscroll-contain', bodyClassName)}>{children}</div>
          {footer ? (
            <footer className='shrink-0 border-t bg-background px-3 pt-2.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]'>
              {footer}
            </footer>
          ) : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/** Label-above, underline-below field — the Odoo mobile form look. */
export function MobileField({
  label,
  required,
  children,
  hint,
  className,
  htmlFor,
}: {
  label: ReactNode
  required?: boolean
  children: ReactNode
  hint?: ReactNode
  className?: string
  htmlFor?: string
}) {
  return (
    <div className={cn('py-2.5', className)}>
      <label htmlFor={htmlFor} className='mb-1 block text-[13px] font-medium text-muted-foreground'>
        {label}
        {required ? <span className='ml-0.5 text-red-500'>*</span> : null}
      </label>
      {children}
      {hint ? <div className='mt-1 text-xs text-muted-foreground'>{hint}</div> : null}
    </div>
  )
}

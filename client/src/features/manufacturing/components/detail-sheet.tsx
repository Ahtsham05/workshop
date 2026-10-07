import { cn } from '@/lib/utils'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

/**
 * Side drawer for reading one record without leaving the list: a fixed header,
 * a scrolling body and an optional footer for actions. Full width on phones.
 */
export function DetailSheet({
  open,
  onOpenChange,
  title,
  description,
  badges,
  children,
  footer,
  className,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: React.ReactNode
  description?: React.ReactNode
  badges?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  className?: string
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className={cn('flex w-full flex-col gap-0 p-0 sm:max-w-lg', className)}
      >
        <SheetHeader className='space-y-1 border-b px-5 py-4 pr-12'>
          <SheetTitle className='text-base'>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
          {badges && (
            <div className='flex flex-wrap items-center gap-1.5 pt-1'>
              {badges}
            </div>
          )}
        </SheetHeader>
        <div className='flex-1 space-y-5 overflow-y-auto px-5 py-5'>
          {children}
        </div>
        {footer && (
          <SheetFooter className='flex-row flex-wrap justify-end gap-2 border-t px-5 py-3'>
            {footer}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** Small uppercase heading for groups inside a drawer or panel. */
export function SheetSection({
  title,
  children,
  action,
}: {
  title: React.ReactNode
  children: React.ReactNode
  action?: React.ReactNode
}) {
  return (
    <section className='space-y-2'>
      <div className='flex items-center justify-between'>
        <h4 className='text-muted-foreground text-xs font-medium tracking-wide uppercase'>
          {title}
        </h4>
        {action}
      </div>
      {children}
    </section>
  )
}

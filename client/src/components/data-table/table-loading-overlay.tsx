import { Loader2 } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TableLoadingOverlayProps {
  loading?: boolean
  children: ReactNode
  className?: string
}

/** Loading overlay for table body only — keeps toolbar/search visible. */
export function TableLoadingOverlay({
  loading = false,
  children,
  className,
}: TableLoadingOverlayProps) {
  return (
    <div className={cn('relative', className)}>
      {children}
      {loading ? (
        <div
          className='absolute inset-0 z-10 flex items-center justify-center rounded-md bg-background/70 backdrop-blur-[1px]'
          aria-busy='true'
          aria-live='polite'
        >
          <Loader2 className='size-8 animate-spin text-muted-foreground' />
        </div>
      ) : null}
    </div>
  )
}

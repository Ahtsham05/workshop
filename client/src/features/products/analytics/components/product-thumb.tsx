import { Package } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProductThumb({ url, name, size = 'sm' }: { url?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'h-20 w-20 rounded-xl' : size === 'md' ? 'h-10 w-10 rounded-lg' : 'h-8 w-8 rounded-md'
  if (url) {
    return <img src={url} alt={name} loading='lazy' className={cn(dims, 'shrink-0 border object-cover')} />
  }
  return (
    <div className={cn(dims, 'flex shrink-0 items-center justify-center border bg-muted')}>
      <Package className={cn('text-muted-foreground', size === 'lg' ? 'h-8 w-8' : 'h-4 w-4')} aria-hidden />
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Clock } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useGetExpiringWindowsQuery, type ExpiringConversation } from '@/stores/whatsappCloud.api'

function formatRemaining(minutes: number) {
  if (minutes <= 0) return 'Expired'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function urgencyClass(minutes: number) {
  const hours = minutes / 60
  if (hours < 1) return 'bg-destructive/15 text-destructive border-destructive/30'
  if (hours <= 6) return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
  return 'bg-[#00A884]/15 text-[#00A884] border-[#00A884]/30'
}

// Server-computed minutesRemaining is a snapshot from the last fetch; tick it down
// client-side between polls so the badges count down smoothly instead of jumping.
function useLiveCountdown(items: ExpiringConversation[]) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(id)
  }, [])
  return items.map((item) => ({
    ...item,
    minutesRemaining: Math.max(0, Math.round((new Date(item.expiresAt).getTime() - now) / 60000)),
  }))
}

export function ExpiringWindowsCard() {
  const { data, isLoading } = useGetExpiringWindowsQuery(undefined, { pollingInterval: 60000 })
  const items = useLiveCountdown(data?.items ?? [])
  const expiringWithinHour = items.filter((i) => i.minutesRemaining <= 60 && i.minutesRemaining > 0).length

  return (
    <Card>
      <CardHeader className='pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>24-Hour Window</CardTitle>
      </CardHeader>
      <CardContent className='space-y-3'>
        {isLoading ? (
          <div className='space-y-3'>
            <Skeleton className='h-8 w-24' />
            <Skeleton className='h-16 w-full' />
          </div>
        ) : (
          <>
            <div className='flex items-baseline gap-2'>
              <p className={cn('text-2xl font-bold', expiringWithinHour > 0 && 'text-destructive')}>
                {expiringWithinHour}
              </p>
              <p className='text-xs text-muted-foreground'>expiring within 1 hour</p>
            </div>

            {items.length === 0 ? (
              <p className='py-4 text-center text-sm text-muted-foreground'>No active conversations yet.</p>
            ) : (
              <ScrollArea className='h-[220px] [&_[data-slot=scroll-area-scrollbar]]:hidden'>
                <div className='space-y-2 pr-2'>
                  {items.map((item) => (
                    <div
                      key={item.conversationId}
                      className='flex items-center justify-between gap-2 rounded-md border px-2.5 py-2'
                    >
                      <div className='min-w-0'>
                        <p className='truncate text-sm font-medium'>{item.name}</p>
                        {item.phone && <p className='truncate text-xs text-muted-foreground'>{item.phone}</p>}
                      </div>
                      <Badge variant='outline' className={cn('shrink-0 gap-1', urgencyClass(item.minutesRemaining))}>
                        <Clock className='h-3 w-3' />
                        {formatRemaining(item.minutesRemaining)}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

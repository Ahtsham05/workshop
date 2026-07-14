import { useEffect } from 'react'
import { formatDistanceToNowStrict } from 'date-fns'
import {
  MessageCircle,
  Send,
  Clock,
  CheckCheck,
  AlertCircle,
  BadgeCheck,
  UserPlus,
  Radio,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { useGetActivityFeedQuery, type ActivityEvent, type ActivityEventType } from '@/stores/whatsappCloud.api'

const EVENT_ICON: Record<ActivityEventType, React.ElementType> = {
  message_received: MessageCircle,
  message_sent: Send,
  message_queued: Clock,
  message_delivered: CheckCheck,
  message_read: CheckCheck,
  message_failed: AlertCircle,
  template_approved: BadgeCheck,
  conversation_started: UserPlus,
}

const EVENT_ICON_CLASS: Record<ActivityEventType, string> = {
  message_received: 'text-[#00A884]',
  message_sent: 'text-muted-foreground',
  message_queued: 'text-muted-foreground',
  message_delivered: 'text-muted-foreground',
  message_read: 'text-[#53BDEB]',
  message_failed: 'text-destructive',
  template_approved: 'text-[#00A884]',
  conversation_started: 'text-[#00A884]',
}

function ActivityRow({ event }: { event: ActivityEvent }) {
  const Icon = EVENT_ICON[event.type] ?? Radio
  return (
    <div className='flex items-start gap-2.5 py-2'>
      <Icon className={cn('h-4 w-4 mt-0.5 shrink-0', EVENT_ICON_CLASS[event.type])} />
      <div className='min-w-0 flex-1'>
        <p className='text-sm leading-snug'>{event.description}</p>
        <p className='text-xs text-muted-foreground'>
          {event.phone ? `${event.phone} · ` : ''}
          {formatDistanceToNowStrict(new Date(event.timestamp), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

export function LiveActivityFeed() {
  const { data, isLoading, refetch } = useGetActivityFeedQuery(
    { limit: 15 },
    // 10s polling per spec; SSE below beats this most of the time but keeps
    // the feed correct if the stream connection ever drops.
    { pollingInterval: 10000 },
  )

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'
    const token = localStorage.getItem('accessToken')
    const branchId = localStorage.getItem('activeBranchId')
    const url = new URL(`${baseUrl}/whatsapp-cloud/events/stream`)
    if (token) url.searchParams.set('token', token)
    if (branchId) url.searchParams.set('branchId', branchId)

    const es = new EventSource(url.toString())
    es.onmessage = () => refetch()
    return () => es.close()
  }, [refetch])

  const events = data?.results ?? []

  return (
    <Card>
      <CardHeader className='flex flex-row items-center gap-2 pb-2'>
        <CardTitle className='text-sm font-medium text-muted-foreground'>Live Activity</CardTitle>
        <span className='flex h-2 w-2 rounded-full bg-[#00A884] animate-pulse' />
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className='space-y-3'>
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-10 w-full' />
            ))}
          </div>
        ) : events.length === 0 ? (
          <p className='py-6 text-center text-sm text-muted-foreground'>No activity yet.</p>
        ) : (
          <ScrollArea className='h-[360px] [&_[data-slot=scroll-area-scrollbar]]:hidden'>
            <div className='divide-y'>
              {events.map((event) => (
                <ActivityRow key={event.id} event={event} />
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  )
}

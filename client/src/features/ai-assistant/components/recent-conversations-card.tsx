import { formatDistanceToNow, isValid } from 'date-fns'
import { History, MessageSquareText } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { AiConversation } from '@/stores/aiAssistant.api'

function safeRelativeTime(value: string) {
  const date = new Date(value)
  return isValid(date) ? formatDistanceToNow(date, { addSuffix: true }) : ''
}

export function RecentConversationsCard({
  conversations,
  onSelect,
  onViewAll,
}: {
  conversations: AiConversation[]
  onSelect: (id: string) => void
  onViewAll: () => void
}) {
  const recent = conversations.slice(0, 3)

  return (
    <Card className='py-4'>
      <CardHeader className='px-4'>
        <CardTitle className='flex items-center gap-1.5 text-sm'>
          <MessageSquareText className='h-3.5 w-3.5 text-muted-foreground' />
          Recent Conversations
        </CardTitle>
      </CardHeader>
      <CardContent className='space-y-0.5 px-4'>
        {recent.length === 0 ? (
          <div className='flex flex-col items-center gap-1.5 py-3 text-center'>
            <MessageSquareText className='h-5 w-5 text-muted-foreground/40' />
            <p className='text-xs text-muted-foreground'>No conversations yet.</p>
          </div>
        ) : (
          recent.map((conv) => (
            <button
              key={conv.id}
              type='button'
              onClick={() => onSelect(conv.id)}
              className='flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted'
            >
              <span className='truncate text-sm'>{conv.title}</span>
              <span className='shrink-0 text-xs text-muted-foreground'>{safeRelativeTime(conv.lastMessageAt)}</span>
            </button>
          ))
        )}

        {conversations.length > 0 && (
          <Button variant='ghost' size='sm' onClick={onViewAll} className='mt-1 h-7 w-full justify-between text-xs text-primary'>
            View Full History
            <History className='h-3.5 w-3.5' />
          </Button>
        )}
      </CardContent>
    </Card>
  )
}

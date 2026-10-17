import type { ReactNode } from 'react'
import { Check, CheckCheck } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { UserAvatar } from '@/components/user-avatar'
import type { ChatMember, ChatMessage, ChatMessageStatus } from '@/stores/chat.api'
import { previewOf } from '../lib/chat-cache'
import { formatChatStamp, presenceLabel } from '../lib/chat-format'
import { useChatLive } from '../lib/chat-live'
import { MessageTicks } from './message-bubble'

interface MessageInfoDialogProps {
  message: ChatMessage | null
  /** Everyone in the conversation except me. */
  members: ChatMember[]
  status: ChatMessageStatus | null
  onOpenChange: (open: boolean) => void
}

/**
 * WhatsApp's "Message info": who has read one of my messages, whose device has it, and
 * who it is still waiting for. Read-state is kept per person as "read up to", so this shows
 * who — not the exact minute each one read this particular message.
 */
export function MessageInfoDialog({ message, members, status, onOpenChange }: MessageInfoDialogProps) {
  const live = useChatLive()
  if (!message) return null
  const at = new Date(message.createdAt).getTime()
  const reached = (value: string | null) => !!value && new Date(value).getTime() >= at
  const read = members.filter((m) => reached(m.lastReadAt))
  const delivered = members.filter((m) => !reached(m.lastReadAt) && reached(m.lastDeliveredAt))
  const waiting = members.filter((m) => !reached(m.lastDeliveredAt))

  const section = (title: string, icon: ReactNode, people: ChatMember[]) =>
    people.length > 0 && (
      <section>
        <p className='mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
          {icon} {title} · {people.length}
        </p>
        <ul className='space-y-1'>
          {people.map((person) => {
            const online = live.online.has(person.id)
            return (
              <li key={person.id} className='flex items-center gap-2.5 py-1'>
                <UserAvatar name={person.name} photoUrl={person.photoUrl} className='size-8' />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate text-sm'>{person.name}</span>
                  <span className='block text-[11px] text-muted-foreground'>{presenceLabel(online, live.lastSeen[person.id] ?? person.lastSeenAt)}</span>
                </span>
              </li>
            )
          })}
        </ul>
      </section>
    )

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[85dvh] overflow-y-auto sm:max-w-sm'>
        <DialogHeader>
          <DialogTitle>Message info</DialogTitle>
          <DialogDescription className='flex items-center gap-1.5'>
            Sent {formatChatStamp(message.createdAt)} <MessageTicks status={status} tone='list' />
          </DialogDescription>
        </DialogHeader>
        <p className='line-clamp-3 rounded-lg bg-muted px-3 py-2 text-sm'>{previewOf(message) || '—'}</p>
        <div className='space-y-4'>
          {section('Read by', <CheckCheck className='size-3.5 text-sky-500' />, read)}
          {section('Delivered to', <CheckCheck className='size-3.5' />, delivered)}
          {section('Not delivered yet', <Check className='size-3.5' />, waiting)}
          {!members.length && <p className='text-sm text-muted-foreground'>Nobody else is in this conversation yet.</p>}
        </div>
      </DialogContent>
    </Dialog>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Search, Send, MessageCircle, Clock, Check, CheckCheck, AlertCircle } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import {
  useGetCloudConnectionQuery,
  useGetConversationMessagesQuery,
  useGetConversationsQuery,
  useMarkConversationReadMutation,
  useSendInboxMessageMutation,
  type WhatsAppMessage,
} from '@/stores/whatsappCloud.api'

function MessageStatusIndicator({ status, errorMessage }: Pick<WhatsAppMessage, 'status' | 'errorMessage'>) {
  const icon = {
    queued: <Clock className='h-3 w-3 text-muted-foreground' />,
    sent: <Check className='h-3 w-3 text-muted-foreground' />,
    delivered: <CheckCheck className='h-3 w-3 text-muted-foreground' />,
    read: <CheckCheck className='h-3 w-3 text-blue-500' />,
    failed: <AlertCircle className='h-3 w-3 text-destructive' />,
  }[status]

  const label = {
    queued: 'Queued — waiting for WhatsApp to accept',
    sent: 'Sent to WhatsApp',
    delivered: 'Delivered',
    read: 'Read',
    failed: errorMessage || 'Failed to deliver',
  }[status]

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className='inline-flex'>{icon}</span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export default function WhatsAppInboxPage() {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [unreadOnly, setUnreadOnly] = useState(false)

  const { data: connection } = useGetCloudConnectionQuery()
  const { data: conversations, refetch: refetchConversations } = useGetConversationsQuery({
    search: search || undefined,
    unreadOnly,
    limit: 50,
  })
  const { data: messages, refetch: refetchMessages } = useGetConversationMessagesQuery(
    { id: selectedId!, limit: 100 },
    { skip: !selectedId },
  )
  const [markRead] = useMarkConversationReadMutation()
  const [sendMessage, { isLoading: sending }] = useSendInboxMessageMutation()

  const selected = useMemo(
    () => conversations?.results.find((c) => c.id === selectedId),
    [conversations, selectedId],
  )

  useEffect(() => {
    if (selectedId) {
      markRead(selectedId)
    }
  }, [selectedId, markRead])

  useEffect(() => {
    const baseUrl = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'
    const token = localStorage.getItem('accessToken')
    const branchId = localStorage.getItem('activeBranchId')
    const url = new URL(`${baseUrl}/whatsapp-cloud/events/stream`)
    if (token) url.searchParams.set('token', token)
    if (branchId) url.searchParams.set('branchId', branchId)

    const es = new EventSource(url.toString())
    es.onmessage = () => {
      refetchConversations()
      if (selectedId) refetchMessages()
    }
    return () => es.close()
  }, [refetchConversations, refetchMessages, selectedId])

  const handleSend = async () => {
    if (!selected || !draft.trim()) return
    await sendMessage({
      phone: selected.contactPhone,
      text: draft.trim(),
      conversationId: selected.id,
    }).unwrap()
    setDraft('')
    refetchMessages()
    refetchConversations()
  }

  if (!connection?.connected) {
    return (
      <div className='p-6 max-w-lg mx-auto text-center space-y-4'>
        <MessageCircle className='h-12 w-12 mx-auto text-muted-foreground' />
        <h1 className='text-xl font-semibold'>WhatsApp Inbox</h1>
        <p className='text-muted-foreground'>
          Connect WhatsApp Business in Settings → WhatsApp to use the shared inbox.
        </p>
      </div>
    )
  }

  return (
    <div className='flex h-[calc(100vh-4rem)] border rounded-lg overflow-hidden bg-background'>
      <aside className='w-full max-w-sm border-r flex flex-col'>
        <div className='p-3 border-b space-y-2'>
          <h1 className='font-semibold flex items-center gap-2'>
            <MessageCircle className='h-5 w-5 text-[#25D366]' />
            Inbox
          </h1>
          <div className='relative'>
            <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground' />
            <Input
              className='pl-8'
              placeholder='Search conversations…'
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button
            variant={unreadOnly ? 'default' : 'outline'}
            size='sm'
            onClick={() => setUnreadOnly((v) => !v)}
          >
            Unread only
          </Button>
        </div>
        <ScrollArea className='flex-1'>
          {conversations?.results.map((conv) => (
            <button
              key={conv.id}
              type='button'
              className={cn(
                'w-full text-left px-3 py-3 border-b hover:bg-muted/50 transition-colors',
                selectedId === conv.id && 'bg-muted',
              )}
              onClick={() => setSelectedId(conv.id)}
            >
              <div className='flex justify-between gap-2'>
                <span className='font-medium truncate'>{conv.contactName || conv.contactPhone}</span>
                {conv.unreadCount > 0 && (
                  <Badge className='shrink-0'>{conv.unreadCount}</Badge>
                )}
              </div>
              <p className='text-xs text-muted-foreground truncate mt-0.5'>
                {conv.lastMessagePreview || 'No messages yet'}
              </p>
            </button>
          ))}
        </ScrollArea>
      </aside>

      <main className='flex-1 flex flex-col min-w-0'>
        {selected ? (
          <>
            <div className='p-3 border-b'>
              <p className='font-medium'>{selected.contactName || selected.contactPhone}</p>
              <p className='text-xs text-muted-foreground'>+{selected.contactPhone}</p>
            </div>
            <ScrollArea className='flex-1 p-4'>
              <div className='space-y-3'>
                {messages?.results.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'max-w-[80%] rounded-lg px-3 py-2 text-sm',
                      msg.direction === 'outbound'
                        ? 'ml-auto bg-[#DCF8C6] text-foreground'
                        : 'bg-muted',
                    )}
                  >
                    <p>{msg.content.text || msg.content.caption || `[${msg.type}]`}</p>
                    <p className='flex items-center justify-end gap-1 text-[10px] text-muted-foreground mt-1'>
                      {new Date(msg.createdAt).toLocaleTimeString()}
                      {msg.direction === 'outbound' && (
                        <MessageStatusIndicator status={msg.status} errorMessage={msg.errorMessage} />
                      )}
                    </p>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className='p-3 border-t flex gap-2'>
              <Input
                placeholder='Type a message…'
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              />
              <Button onClick={handleSend} disabled={sending || !draft.trim()}>
                <Send className='h-4 w-4' />
              </Button>
            </div>
          </>
        ) : (
          <div className='flex-1 flex items-center justify-center text-muted-foreground'>
            Select a conversation
          </div>
        )}
      </main>
    </div>
  )
}

import { useState } from 'react'
import { Loader2, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useCreateChatGroupMutation, useGetChatDirectoryQuery, useOpenDirectChatMutation } from '@/stores/chat.api'
import { cn } from '@/lib/utils'
import { PeoplePicker } from './people-picker'

interface NewChatDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpened: (conversationId: string) => void
}

export function NewChatDialog({ open, onOpenChange, onOpened }: NewChatDialogProps) {
  const [mode, setMode] = useState<'person' | 'group'>('person')
  const [groupName, setGroupName] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const { data: people, isLoading } = useGetChatDirectoryQuery(undefined, { skip: !open })
  const [openDirect, { isLoading: opening }] = useOpenDirectChatMutation()
  const [createGroup, { isLoading: creating }] = useCreateChatGroupMutation()

  const reset = () => {
    setMode('person')
    setGroupName('')
    setSelected(new Set())
  }

  const close = (next: boolean) => {
    onOpenChange(next)
    if (!next) reset()
  }

  const startDirect = async (userId: string) => {
    try {
      const { id } = await openDirect(userId).unwrap()
      close(false)
      onOpened(id)
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || 'Could not open the chat')
    }
  }

  const submitGroup = async () => {
    if (!groupName.trim() || selected.size === 0) return
    try {
      const { id } = await createGroup({ name: groupName.trim(), participantIds: [...selected] }).unwrap()
      close(false)
      onOpened(id)
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || 'Could not create the group')
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>New conversation</DialogTitle>
          <DialogDescription>Message anyone in any branch, or put a group together.</DialogDescription>
        </DialogHeader>

        <div role='radiogroup' className='grid grid-cols-2 gap-1 rounded-lg bg-muted p-1'>
          {(
            [
              { key: 'person', label: 'Message a person', icon: User },
              { key: 'group', label: 'New group', icon: Users },
            ] as const
          ).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type='button'
              role='radio'
              aria-checked={mode === key}
              onClick={() => setMode(key)}
              className={cn(
                'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium transition-colors',
                mode === key ? 'bg-background shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Icon className='size-4' />
              {label}
            </button>
          ))}
        </div>

        {mode === 'group' && (
          <div className='space-y-1'>
            <label htmlFor='chat-group-name' className='text-xs font-medium text-muted-foreground'>
              Group name
            </label>
            <input
              id='chat-group-name'
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={80}
              placeholder='e.g. Branch managers, Stock team'
              className='h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm outline-none focus-visible:border-input-ring focus-visible:ring-[3px] focus-visible:ring-input-ring/50 dark:bg-input/30'
            />
          </div>
        )}

        <PeoplePicker
          people={people ?? []}
          loading={isLoading}
          selected={mode === 'group' ? selected : undefined}
          onToggle={(person) => {
            if (mode === 'person') {
              if (!opening) void startDirect(person.id)
              return
            }
            setSelected((current) => {
              const next = new Set(current)
              if (next.has(person.id)) next.delete(person.id)
              else next.add(person.id)
              return next
            })
          }}
        />

        {mode === 'group' && (
          <div className='flex items-center justify-between gap-2'>
            <span className='text-xs text-muted-foreground'>{selected.size} selected</span>
            <Button onClick={() => void submitGroup()} disabled={!groupName.trim() || selected.size === 0 || creating}>
              {creating && <Loader2 className='mr-2 size-4 animate-spin' />}
              Create group
            </Button>
          </div>
        )}
        {mode === 'person' && opening && (
          <p className='flex items-center gap-2 text-xs text-muted-foreground'>
            <Loader2 className='size-3.5 animate-spin' /> Opening chat…
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}

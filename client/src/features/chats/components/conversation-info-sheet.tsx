import { useState } from 'react'
import { LogOut, Pencil, UserMinus, UserPlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { UserAvatar } from '@/components/user-avatar'
import {
  useGetChatConversationQuery,
  useGetChatDirectoryQuery,
  useLeaveChatGroupMutation,
  useSetChatPreferencesMutation,
  useUpdateChatGroupMutation,
  type ChatConversation,
} from '@/stores/chat.api'
import { readChatSound, useChatLive, writeChatSound } from '../lib/chat-live'
import { ConversationIcon } from './conversation-list'
import { conversationSubtitle, presenceLabel } from '../lib/chat-format'
import { PeoplePicker } from './people-picker'

interface ConversationInfoSheetProps {
  conversation: ChatConversation | null
  open: boolean
  onOpenChange: (open: boolean) => void
  meId: string | undefined
  isOrgAdmin: boolean
  onLeft: () => void
}

export function ConversationInfoSheet({ conversation, open, onOpenChange, meId, isOrgAdmin, onLeft }: ConversationInfoSheetProps) {
  const live = useChatLive()
  const { data: detail } = useGetChatConversationQuery(conversation?.id ?? '', { skip: !conversation || !open })
  const [setPrefs] = useSetChatPreferencesMutation()
  const [updateGroup, { isLoading: saving }] = useUpdateChatGroupMutation()
  const [leaveGroup, { isLoading: leaving }] = useLeaveChatGroupMutation()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [sound, setSound] = useState(readChatSound)
  const isGroup = conversation?.type === 'group'
  const { data: people } = useGetChatDirectoryQuery(undefined, { skip: !open || !isGroup })

  if (!conversation) return null
  const canManage = isGroup && (isOrgAdmin || (detail?.adminIds ?? conversation.adminIds).includes(meId ?? ''))
  const memberIds = new Set((detail?.members ?? []).map((m) => m.id))

  const run = async (action: Promise<unknown>, done: string): Promise<boolean> => {
    try {
      await action
      toast.success(done)
      return true
    } catch (err) {
      toast.error((err as { data?: { message?: string } })?.data?.message || 'Something went wrong')
      return false
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className='flex w-full flex-col gap-0 p-0 sm:max-w-sm'>
        <SheetHeader className='border-b p-4'>
          <div className='flex items-center gap-3'>
            <ConversationIcon conversation={conversation} className='size-12' />
            <div className='min-w-0'>
              <SheetTitle className='truncate'>{conversation.name}</SheetTitle>
              <SheetDescription>{conversationSubtitle(conversation)}</SheetDescription>
            </div>
          </div>
          {canManage && (
            <div className='mt-3'>
              {renaming == null ? (
                <Button size='sm' variant='outline' onClick={() => setRenaming(conversation.name)}>
                  <Pencil className='mr-1.5 size-3.5' /> Rename
                </Button>
              ) : (
                <form
                  className='flex gap-2'
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (!renaming.trim()) return
                    void run(updateGroup({ id: conversation.id, name: renaming.trim() }).unwrap(), 'Group renamed').then((ok) => ok && setRenaming(null))
                  }}
                >
                  <input
                    autoFocus
                    value={renaming}
                    onChange={(e) => setRenaming(e.target.value)}
                    maxLength={80}
                    className='h-8 min-w-0 flex-1 rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-input-ring dark:bg-input/30'
                  />
                  <Button size='sm' type='submit' disabled={saving}>
                    Save
                  </Button>
                  <Button size='sm' type='button' variant='ghost' onClick={() => setRenaming(null)}>
                    Cancel
                  </Button>
                </form>
              )}
            </div>
          )}
        </SheetHeader>

        <div className='min-h-0 flex-1 overflow-y-auto'>
          <div className='space-y-3 border-b p-4'>
            <label className='flex items-center justify-between gap-3 text-sm'>
              <span>
                <span className='block font-medium'>Mute this conversation</span>
                <span className='block text-xs text-muted-foreground'>No pop-ups or sound; it still shows unread.</span>
              </span>
              <Switch checked={conversation.muted} onCheckedChange={(muted) => setPrefs({ id: conversation.id, muted })} />
            </label>
            <label className='flex items-center justify-between gap-3 text-sm'>
              <span className='font-medium'>Pin to the top</span>
              <Switch checked={conversation.pinned} onCheckedChange={(pinned) => setPrefs({ id: conversation.id, pinned })} />
            </label>
            <label className='flex items-center justify-between gap-3 text-sm'>
              <span>
                <span className='block font-medium'>Message sound</span>
                <span className='block text-xs text-muted-foreground'>For every chat, on this device.</span>
              </span>
              <Switch
                checked={sound}
                onCheckedChange={(on) => {
                  setSound(on)
                  writeChatSound(on)
                }}
              />
            </label>
          </div>

          <div className='p-4'>
            <div className='mb-2 flex items-center justify-between'>
              <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                Members{detail ? ` (${detail.members.length})` : ''}
              </p>
              {canManage && (
                <Button size='sm' variant='ghost' onClick={() => setAdding((v) => !v)}>
                  <UserPlus className='mr-1.5 size-3.5' /> {adding ? 'Done' : 'Add'}
                </Button>
              )}
            </div>
            {adding && (
              <div className='mb-3'>
                <PeoplePicker
                  people={people ?? []}
                  exclude={memberIds}
                  onToggle={(person) => void run(updateGroup({ id: conversation.id, addIds: [person.id] }).unwrap(), `${person.name} added`)}
                />
              </div>
            )}
            {conversation.type === 'branch' && (
              <p className='mb-2 text-xs text-muted-foreground'>Everyone who works in this branch, plus the organization's admins.</p>
            )}
            <ul className='space-y-1'>
              {(detail?.members ?? []).map((member) => {
                const online = live.online.has(member.id)
                const memberIsAdmin = detail?.adminIds.includes(member.id)
                return (
                  <li key={member.id} className='flex items-center gap-3 rounded-md px-1 py-1.5'>
                    <span className='relative shrink-0'>
                      <UserAvatar name={member.name} photoUrl={member.photoUrl} className='size-8' />
                      {online && <span className='absolute bottom-0 end-0 size-2.5 rounded-full border-2 border-card bg-emerald-500' />}
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='block truncate text-sm'>
                        {member.name}
                        {member.id === meId && <span className='text-muted-foreground'> (you)</span>}
                      </span>
                      <span className={online ? 'block text-[11px] text-emerald-600 dark:text-emerald-400' : 'block text-[11px] text-muted-foreground'}>
                        {member.id === meId ? 'online' : presenceLabel(online, live.lastSeen[member.id] ?? member.lastSeenAt)}
                        {isGroup && memberIsAdmin ? ' · Group admin' : ''}
                      </span>
                    </span>
                    {canManage && member.id !== meId && (
                      <Button
                        size='icon'
                        variant='ghost'
                        className='size-7 text-muted-foreground hover:text-destructive'
                        title={`Remove ${member.name}`}
                        aria-label={`Remove ${member.name}`}
                        onClick={() => void run(updateGroup({ id: conversation.id, removeIds: [member.id] }).unwrap(), `${member.name} removed`)}
                      >
                        <UserMinus className='size-4' />
                      </Button>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        </div>

        {isGroup && (
          <div className='border-t p-4'>
            <Button
              variant='outline'
              className='w-full text-destructive hover:text-destructive'
              disabled={leaving}
              onClick={() =>
                void run(leaveGroup(conversation.id).unwrap(), 'You left the group').then((ok) => {
                  if (!ok) return
                  onOpenChange(false)
                  onLeft()
                })
              }
            >
              <LogOut className='mr-2 size-4' /> Leave group
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

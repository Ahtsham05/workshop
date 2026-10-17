import { memo, useState } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Copy,
  FileText,
  MoreHorizontal,
  Package,
  Pencil,
  Reply,
  SmilePlus,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { UserAvatar } from '@/components/user-avatar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFormatMoney } from '@/lib/format-money'
import { REACTION_EMOJIS, useGetChatProductStockQuery, type ChatMessage } from '@/stores/chat.api'
import { formatChatTime, formatFileSize, linkify } from '../lib/chat-format'

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

export type SeenState = 'sent' | 'seen' | null

interface MessageBubbleProps {
  message: ChatMessage
  mine: boolean
  meId: string | undefined
  /** First bubble of a run from the same person — shows their name, branch and avatar. */
  groupStart: boolean
  /** Channels and groups name the sender; a direct thread doesn't need to. */
  showSender: boolean
  seen: SeenState
  seenByCount?: number
  canModerate: boolean
  highlighted?: boolean
  onReply: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onRetry: (message: ChatMessage) => void
  onDiscard: (message: ChatMessage) => void
  onJumpTo: (messageId: string) => void
}

function ProductCard({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const product = message.product!
  const formatMoney = useFormatMoney()
  const [showStock, setShowStock] = useState(false)
  const { data: stock, isFetching, isError } = useGetChatProductStockQuery(product.productId, { skip: !showStock || !!message.pending })

  return (
    <div className={cn('mb-1 w-64 max-w-full overflow-hidden rounded-lg border bg-background text-foreground', mine && 'border-primary-foreground/20')}>
      <div className='flex gap-2.5 p-2.5'>
        {product.imageUrl ? (
          <img src={product.imageUrl} alt='' className='size-14 shrink-0 rounded-md border object-cover' loading='lazy' />
        ) : (
          <span className='flex size-14 shrink-0 items-center justify-center rounded-md bg-muted'>
            <Package className='size-6 text-muted-foreground' />
          </span>
        )}
        <div className='min-w-0 flex-1'>
          <p className='line-clamp-2 text-sm font-semibold leading-tight'>{product.name}</p>
          {(product.sku || product.barcode) && <p className='truncate text-[11px] text-muted-foreground'>{product.sku || product.barcode}</p>}
          <div className='mt-1 flex flex-wrap items-baseline gap-x-2 text-xs'>
            {product.price != null && <span className='font-semibold tabular-nums'>{formatMoney(product.price)}</span>}
            {product.stock != null && (
              <span className={cn('tabular-nums', product.stock > 0 ? 'text-muted-foreground' : 'text-red-600 dark:text-red-400')}>
                {product.stock} in stock{message.senderBranchName ? ` at ${message.senderBranchName}` : ''}
              </span>
            )}
          </div>
        </div>
      </div>
      {!message.pending && (
        <div className='border-t'>
          <button
            type='button'
            onClick={() => setShowStock((v) => !v)}
            className='w-full px-2.5 py-1.5 text-start text-xs font-medium text-primary hover:bg-accent'
            aria-expanded={showStock}
          >
            {showStock ? 'Hide' : 'Check'} stock in every branch
          </button>
          {showStock && (
            <div className='border-t px-2.5 py-1.5'>
              {isFetching && !stock ? (
                <p className='text-xs text-muted-foreground'>Checking…</p>
              ) : isError ? (
                <p className='text-xs text-destructive'>Could not load stock.</p>
              ) : (
                <ul className='space-y-0.5'>
                  {stock?.map((row) => (
                    <li key={row.branchId} className='flex items-center justify-between gap-2 text-xs'>
                      <span className='truncate'>{row.branchName}</span>
                      <span
                        className={cn(
                          'shrink-0 tabular-nums font-semibold',
                          row.stock == null ? 'font-normal text-muted-foreground' : row.stock > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                        )}
                      >
                        {row.stock == null ? 'not stocked' : `${row.stock}${row.price != null ? ` · ${formatMoney(row.price)}` : ''}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Attachments({ message }: { message: ChatMessage }) {
  const images = message.attachments.filter((a) => a.mimeType.startsWith('image/'))
  const files = message.attachments.filter((a) => !a.mimeType.startsWith('image/'))
  return (
    <div className='mb-1 space-y-1'>
      {images.length > 0 && (
        <div className={cn('grid gap-1', images.length > 1 ? 'grid-cols-2' : 'grid-cols-1')}>
          {images.map((image) => (
            <a key={image.url} href={image.url} target='_blank' rel='noreferrer' className='block overflow-hidden rounded-lg'>
              <img
                src={image.url}
                alt={image.name || 'Image'}
                loading='lazy'
                className={cn('w-full bg-muted object-cover', images.length > 1 ? 'h-28' : 'max-h-72')}
              />
            </a>
          ))}
        </div>
      )}
      {files.map((file) => (
        <a
          key={file.url}
          href={file.url}
          target='_blank'
          rel='noreferrer'
          className='flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-foreground hover:bg-accent'
        >
          <FileText className='size-5 shrink-0 text-red-600' />
          <span className='min-w-0 flex-1'>
            <span className='block truncate text-xs font-medium'>{file.name || 'Document'}</span>
            <span className='block text-[10px] text-muted-foreground'>{formatFileSize(file.size)}</span>
          </span>
        </a>
      ))}
    </div>
  )
}

function MessageText({ text }: { text: string }) {
  return (
    <p className='whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]'>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target='_blank' rel='noreferrer noopener' className='underline underline-offset-2'>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
    </p>
  )
}

export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  meId,
  groupStart,
  showSender,
  seen,
  seenByCount,
  canModerate,
  highlighted,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
  onDiscard,
  onJumpTo,
}: MessageBubbleProps) {
  const [reactOpen, setReactOpen] = useState(false)

  if (message.kind === 'system') {
    return (
      <div className='my-2 flex justify-center px-4'>
        <span className='rounded-full bg-muted px-3 py-1 text-center text-[11px] text-muted-foreground'>{message.text}</span>
      </div>
    )
  }

  const deleted = !!message.deletedAt
  const live = !message.pending && !message.failed && !deleted
  const canEdit = live && mine && Date.now() - new Date(message.createdAt).getTime() < EDIT_WINDOW_MS
  const canDelete = live && (mine || canModerate)

  const copy = () => {
    void navigator.clipboard?.writeText(message.text || message.product?.name || '').then(() => toast.success('Copied'))
  }

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={cn('group flex gap-2 px-3 md:px-4', mine ? 'flex-row-reverse' : 'flex-row', groupStart ? 'mt-3' : 'mt-0.5')}
    >
      {!mine && (
        <div className='w-8 shrink-0'>
          {groupStart && <UserAvatar name={message.senderName} className='size-8' />}
        </div>
      )}

      <div className={cn('flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
        {groupStart && showSender && !mine && (
          <p className='mb-0.5 flex items-center gap-1.5 px-1 text-[11px]'>
            <span className='font-semibold'>{message.senderName}</span>
            {message.senderBranchName && (
              <span className='rounded bg-muted px-1 py-px text-[10px] text-muted-foreground'>{message.senderBranchName}</span>
            )}
          </p>
        )}

        <div className={cn('flex items-end gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
          <div
            className={cn(
              'relative min-w-0 rounded-2xl px-3 py-1.5 shadow-xs transition-shadow',
              mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              groupStart && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
              message.pending && 'opacity-70',
              message.failed && 'ring-2 ring-destructive',
              highlighted && 'ring-2 ring-amber-400',
              deleted && 'bg-transparent text-muted-foreground shadow-none ring-1 ring-border'
            )}
          >
            {deleted ? (
              <p className='text-sm italic'>This message was deleted</p>
            ) : (
              <>
                {message.replyTo && (
                  <button
                    type='button'
                    onClick={() => onJumpTo(message.replyTo!.messageId)}
                    className={cn(
                      'mb-1 block w-full rounded-md border-s-4 px-2 py-1 text-start text-xs',
                      mine ? 'border-primary-foreground/60 bg-primary-foreground/15' : 'border-primary bg-background/70'
                    )}
                  >
                    <span className='block font-semibold'>{message.replyTo.senderName}</span>
                    <span className='line-clamp-2 opacity-80'>{message.replyTo.text}</span>
                  </button>
                )}
                {message.kind === 'product' && message.product && <ProductCard message={message} mine={mine} />}
                {message.attachments.length > 0 && <Attachments message={message} />}
                {message.text && <MessageText text={message.text} />}
              </>
            )}
            <span className={cn('mt-0.5 flex items-center justify-end gap-1 text-[10px]', mine && !deleted ? 'text-primary-foreground/75' : 'text-muted-foreground')}>
              {message.editedAt && !deleted && <span>edited</span>}
              <span>{formatChatTime(message.createdAt)}</span>
              {mine && !deleted && (
                <span aria-label={message.failed ? 'Not sent' : message.pending ? 'Sending' : seen === 'seen' ? 'Seen' : 'Sent'}>
                  {message.failed ? (
                    <AlertCircle className='size-3 text-destructive' />
                  ) : message.pending ? (
                    <Clock className='size-3' />
                  ) : seen === 'seen' ? (
                    <CheckCheck className='size-3.5 text-sky-300' />
                  ) : seen === 'sent' ? (
                    <Check className='size-3.5' />
                  ) : null}
                </span>
              )}
            </span>
          </div>

          {/* Hover actions */}
          {live && (
            <div className={cn(// Touch screens have no hover, so the actions stay visible there.
                'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-60', (reactOpen) && 'opacity-100')}>
              <Popover open={reactOpen} onOpenChange={setReactOpen}>
                <PopoverTrigger asChild>
                  <button type='button' className='rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground' aria-label='React'>
                    <SmilePlus className='size-4' />
                  </button>
                </PopoverTrigger>
                <PopoverContent side='top' align={mine ? 'end' : 'start'} className='flex w-auto gap-0.5 rounded-full p-1'>
                  {REACTION_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type='button'
                      onClick={() => {
                        onReact(message, emoji)
                        setReactOpen(false)
                      }}
                      className='rounded-full p-1.5 text-lg leading-none transition-transform hover:scale-125 hover:bg-accent'
                    >
                      {emoji}
                    </button>
                  ))}
                </PopoverContent>
              </Popover>
              <button type='button' onClick={() => onReply(message)} className='rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground' aria-label='Reply'>
                <Reply className='size-4' />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type='button' className='rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground' aria-label='More actions'>
                    <MoreHorizontal className='size-4' />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? 'end' : 'start'}>
                  <DropdownMenuItem onClick={() => onReply(message)}>
                    <Reply className='mr-2 size-4' /> Reply
                  </DropdownMenuItem>
                  {(message.text || message.product) && (
                    <DropdownMenuItem onClick={copy}>
                      <Copy className='mr-2 size-4' /> Copy text
                    </DropdownMenuItem>
                  )}
                  {canEdit && message.kind === 'text' && (
                    <DropdownMenuItem onClick={() => onEdit(message)}>
                      <Pencil className='mr-2 size-4' /> Edit
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => onDelete(message)} className='text-destructive focus:text-destructive'>
                        <Trash2 className='mr-2 size-4' /> Delete{!mine ? ' (admin)' : ''}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>

        {message.failed && (
          <p className='mt-0.5 flex items-center gap-2 px-1 text-[11px] text-destructive'>
            Not sent
            <button type='button' onClick={() => onRetry(message)} className='font-semibold underline'>
              Retry
            </button>
            <button type='button' onClick={() => onDiscard(message)} className='text-muted-foreground underline'>
              Discard
            </button>
          </p>
        )}

        {!deleted && message.reactions.length > 0 && (
          <div className={cn('-mt-1 flex flex-wrap gap-1 px-1', mine ? 'justify-end' : 'justify-start')}>
            {message.reactions.map((reaction) => {
              const reacted = !!meId && reaction.userIds.includes(meId)
              return (
                <button
                  key={reaction.emoji}
                  type='button'
                  onClick={() => onReact(message, reaction.emoji)}
                  className={cn(
                    'flex items-center gap-0.5 rounded-full border bg-card px-1.5 py-px text-xs shadow-xs',
                    reacted && 'border-primary bg-primary/10'
                  )}
                  aria-pressed={reacted}
                >
                  <span>{reaction.emoji}</span>
                  {reaction.userIds.length > 1 && <span className='tabular-nums text-[10px]'>{reaction.userIds.length}</span>}
                </button>
              )
            })}
          </div>
        )}
        {mine && seenByCount != null && seenByCount > 0 && <p className='px-1 text-[10px] text-muted-foreground'>Seen by {seenByCount}</p>}
      </div>
    </div>
  )
})

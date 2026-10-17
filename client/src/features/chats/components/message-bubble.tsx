import { memo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  Check,
  CheckCheck,
  Clock,
  Copy,
  Download,
  Info,
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
import { REACTION_EMOJIS, useGetChatProductStockQuery, type ChatMessage, type ChatMessageStatus } from '@/stores/chat.api'
import { formatChatTime, linkify } from '../lib/chat-format'
import { downloadUrl, isVisual, mediaKind } from '../lib/chat-media'
import { AudioPlayer, DocumentCard, MediaAlbum } from './message-media'
import { PreviewText } from './preview-text'

const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000

const STATUS_LABEL: Record<ChatMessageStatus, string> = {
  pending: 'Sending',
  failed: 'Not sent',
  sent: 'Sent',
  delivered: 'Delivered',
  read: 'Read',
}

/**
 * WhatsApp ticks: clock while sending, ✓ sent, grey ✓✓ delivered, blue ✓✓ read.
 * `tone` picks the grey that reads on the surface behind it (own bubble vs. list row).
 */
export function MessageTicks({ status, tone = 'bubble', className }: { status: ChatMessageStatus | null | undefined; tone?: 'bubble' | 'list'; className?: string }) {
  if (!status) return null
  const grey = tone === 'bubble' ? 'text-primary-foreground/75' : 'text-muted-foreground'
  const label = STATUS_LABEL[status]
  return (
    <span role='img' aria-label={label} title={label} data-status={status} className={cn('inline-flex shrink-0', className)}>
      {status === 'failed' ? (
        <AlertCircle className='size-3.5 text-destructive' />
      ) : status === 'pending' ? (
        <Clock className={cn('size-3', grey)} />
      ) : status === 'sent' ? (
        <Check className={cn('size-3.5', grey)} />
      ) : (
        <CheckCheck className={cn('size-3.5', status === 'read' ? (tone === 'bubble' ? 'text-sky-400 drop-shadow-[0_0_1px_rgba(0,0,0,0.35)]' : 'text-sky-500') : grey)} />
      )}
    </span>
  )
}

interface MessageBubbleProps {
  message: ChatMessage
  mine: boolean
  meId: string | undefined
  /** First bubble after a pause, a day change or another sender — extra space and a tail. */
  groupStart: boolean
  /** First bubble of a run from the same person — their name, branch and avatar go here once. */
  runStart: boolean
  /** Channels and groups name the sender and show their avatar; a direct thread doesn't. */
  showSender: boolean
  /** My messages only: delivery state (see MessageTicks). */
  status: ChatMessageStatus | null
  canModerate: boolean
  highlighted?: boolean
  onReply: (message: ChatMessage) => void
  onEdit: (message: ChatMessage) => void
  onDelete: (message: ChatMessage) => void
  onReact: (message: ChatMessage, emoji: string) => void
  onRetry: (message: ChatMessage) => void
  onDiscard: (message: ChatMessage) => void
  onJumpTo: (messageId: string) => void
  /** Delivered to / read by, per person ("Message info"). */
  onInfo?: (message: ChatMessage) => void
  /** Opens a photo/video of this message in the full-screen viewer. */
  onOpenMedia?: (message: ChatMessage, attachmentIndex: number) => void
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

function MessageText({ text, children }: { text: string; children?: ReactNode }) {
  return (
    // overflow-wrap: anywhere (inline, so no utility can override it) lets one long unbroken
    // word or URL break and shrink the bubble; 'break-word' alone left it 787px wide.
    <p className='whitespace-pre-wrap text-sm leading-relaxed' style={{ overflowWrap: 'anywhere' }}>
      {linkify(text).map((part, i) =>
        part.href ? (
          <a key={i} href={part.href} target='_blank' rel='noreferrer noopener' className='underline underline-offset-2'>
            {part.text}
          </a>
        ) : (
          <span key={i}>{part.text}</span>
        )
      )}
      {children}
    </p>
  )
}

export const MessageBubble = memo(function MessageBubble({
  message,
  mine,
  meId,
  groupStart,
  runStart,
  showSender,
  status,
  canModerate,
  highlighted,
  onReply,
  onEdit,
  onDelete,
  onReact,
  onRetry,
  onDiscard,
  onJumpTo,
  onInfo,
  onOpenMedia,
}: MessageBubbleProps) {
  const [reactOpen, setReactOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

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

  // Time (+ ticks) — WhatsApp puts it in the bubble's bottom-right corner, on the last line
  // of text when there is room. An invisible copy at the end of the text reserves exactly
  // that room, so the line wraps (and the bubble grows a line) only when it must.
  const meta = (
    <>
      {message.editedAt && !deleted && <span>edited</span>}
      <span>{formatChatTime(message.createdAt)}</span>
      {mine && !deleted && <MessageTicks status={message.failed ? 'failed' : message.pending ? 'pending' : status} />}
    </>
  )
  const metaBase = 'inline-flex items-center gap-1 whitespace-nowrap text-[10px] leading-none'
  const metaTone = mine && !deleted ? 'text-primary-foreground/75' : 'text-muted-foreground'
  const endsWithText = deleted || !!message.text
  const files = deleted ? [] : message.attachments
  const hasVisual = files.some((a) => isVisual(a))
  const listed = files.map((a, index) => ({ a, index })).filter(({ a }) => !isVisual(a))
  // Photos/videos with nothing under them: the time sits on the picture, like WhatsApp.
  const mediaOnly = hasVisual && !listed.length && !message.text && !message.replyTo
  const sending = message.pending || message.failed
  const uploadActions = { onCancel: () => onDiscard(message), onRetry: () => onRetry(message) }
  const uploadOf = (a: (typeof files)[number]) =>
    sending ? { ...uploadActions, progress: a.progress ?? 0, failed: !!message.failed && !a.url } : undefined
  const metaSpacer = (
    <span aria-hidden className={cn(metaBase, 'invisible ms-2 select-none align-middle')} data-meta-spacer>
      {meta}
    </span>
  )
  const actionsShown = reactOpen || menuOpen

  const copy = () => {
    void navigator.clipboard?.writeText(message.text || message.product?.name || '').then(() => toast.success('Copied'))
  }

  return (
    <div
      id={`chat-msg-${message.id}`}
      className={cn('group flex gap-2 px-3 md:px-4', mine ? 'flex-row-reverse' : 'flex-row', groupStart ? 'mt-3' : 'mt-0.5')}
    >
      {/* A 1:1 chat has no avatars at all; groups show the sender's once per run. */}
      {!mine && showSender && (
        <div className='w-8 shrink-0'>
          {runStart && <UserAvatar name={message.senderName} className='size-8' />}
        </div>
      )}

      <div className={cn('flex min-w-0 max-w-[85%] flex-col sm:max-w-[70%]', mine ? 'items-end' : 'items-start')}>
        {runStart && showSender && !mine && (
          <p className='mb-0.5 flex items-center gap-1.5 px-1 text-[11px]'>
            <span className='font-semibold'>{message.senderName}</span>
            {message.senderBranchName && (
              <span className='rounded bg-muted px-1 py-px text-[10px] text-muted-foreground'>{message.senderBranchName}</span>
            )}
          </p>
        )}

        <div className={cn('relative flex items-end gap-1', mine ? 'flex-row-reverse' : 'flex-row')}>
          <div
            // Touch screens: tapping the bubble focuses it, which shows its actions (below).
            tabIndex={-1}
            className={cn(
              'relative min-w-0 rounded-2xl px-3 py-1.5 shadow-xs outline-none transition-shadow',
              // Photos sit in a thin frame of the bubble colour (WhatsApp's 3px border).
              hasVisual && 'p-1',
              mine ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground',
              groupStart && (mine ? 'rounded-tr-md' : 'rounded-tl-md'),
              // Media shows its own upload ring instead of dimming.
              message.pending && !files.length && 'opacity-70',
              message.failed && 'ring-2 ring-destructive',
              highlighted && 'ring-2 ring-amber-400',
              deleted && 'bg-transparent text-muted-foreground shadow-none ring-1 ring-border'
            )}
          >
            {deleted ? (
              <p className='text-sm italic'>
                This message was deleted
                {metaSpacer}
              </p>
            ) : (
              <>
                {message.replyTo && (
                  <button
                    type='button'
                    onClick={() => onJumpTo(message.replyTo!.messageId)}
                    className={cn(
                      'mb-1 block w-full rounded-md border-s-4 px-2 py-1 text-start text-xs',
                      hasVisual && 'w-[min(330px,68vw)]',
                      mine ? 'border-primary-foreground/60 bg-primary-foreground/15' : 'border-primary bg-background/70'
                    )}
                  >
                    <span className='block font-semibold'>{message.replyTo.senderName}</span>
                    <PreviewText text={message.replyTo.text} className='opacity-80' />
                  </button>
                )}
                {message.kind === 'product' && message.product && <ProductCard message={message} mine={mine} />}
                {hasVisual && (
                  <MediaAlbum message={message} upload={uploadActions} onOpen={(index) => onOpenMedia?.(message, index)} />
                )}
                {listed.map(({ a, index }) => (
                  <div key={`${a.url || a.localUrl}-${index}`} className={cn((hasVisual || index > 0) && 'mt-1')}>
                    {mediaKind(a.mimeType) === 'audio' ? (
                      <AudioPlayer attachment={a} mine={mine} upload={uploadOf(a)} />
                    ) : (
                      <DocumentCard attachment={a} mine={mine} upload={uploadOf(a)} />
                    )}
                  </div>
                ))}
                {message.text && (
                  <div className={cn(hasVisual && 'w-[min(330px,68vw)] px-2 pb-0.5 pt-1', listed.length && !hasVisual && 'mt-1')}>
                    <MessageText text={message.text}>{metaSpacer}</MessageText>
                  </div>
                )}
              </>
            )}
            {endsWithText ? (
              <span className={cn(metaBase, metaTone, 'absolute bottom-1.5 end-2.5')}>{meta}</span>
            ) : mediaOnly ? (
              <span
                className={cn(
                  metaBase,
                  'absolute bottom-2.5 end-2.5 rounded-full bg-black/45 px-1.5 py-1 text-white [&_[data-status]_svg]:text-white/85 [&_[data-status=read]_svg]:text-sky-300'
                )}
              >
                {meta}
              </span>
            ) : (
              <span className={cn(metaBase, metaTone, 'mt-1 flex justify-end')}>{meta}</span>
            )}
          </div>

          {/* Hover actions */}
          {live && (
            <div
              className={cn(
                // Mouse: beside the bubble, on hover. Touch: hidden (so bubbles keep their full
                // width) until the bubble is tapped, then a small floating bar above it.
                'flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                '[@media(hover:none)]:absolute [@media(hover:none)]:bottom-full [@media(hover:none)]:z-20 [@media(hover:none)]:mb-1 [@media(hover:none)]:hidden [@media(hover:none)]:rounded-full [@media(hover:none)]:border [@media(hover:none)]:bg-card [@media(hover:none)]:p-0.5 [@media(hover:none)]:opacity-100 [@media(hover:none)]:shadow-md [@media(hover:none)]:group-focus-within:flex',
                mine ? '[@media(hover:none)]:end-0' : '[@media(hover:none)]:start-0',
                actionsShown && 'opacity-100 [@media(hover:none)]:flex'
              )}
              data-message-actions
            >
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
              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
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
                  {files.length === 1 && files[0].url && (
                    <DropdownMenuItem asChild>
                      <a href={downloadUrl(files[0])} target='_blank' rel='noreferrer' download={files[0].name || true}>
                        <Download className='mr-2 size-4' /> Download
                      </a>
                    </DropdownMenuItem>
                  )}
                  {files.length > 1 && (
                    <DropdownMenuItem
                      onClick={() =>
                        files.forEach((a, i) =>
                          window.setTimeout(() => {
                            const link = Object.assign(document.createElement('a'), { href: downloadUrl(a), target: '_blank', rel: 'noreferrer', download: a.name || '' })
                            link.click()
                          }, i * 400)
                        )
                      }
                    >
                      <Download className='mr-2 size-4' /> Download all ({files.length})
                    </DropdownMenuItem>
                  )}
                  {mine && onInfo && (
                    <DropdownMenuItem onClick={() => onInfo(message)}>
                      <Info className='mr-2 size-4' /> Message info
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
      </div>
    </div>
  )
})

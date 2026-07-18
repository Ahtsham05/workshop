import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { format } from 'date-fns'
import {
  Search,
  Send,
  CheckCheck,
  Check,
  Clock,
  AlertCircle,
  RotateCw,
  Trash2,
  FileText,
  Image as ImageIcon,
  Video,
  Mic,
  MessageSquareText,
  ListTree,
  MapPin,
  Sticker,
  Loader2,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { cn } from '@/lib/utils'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { StatTile } from '@/features/whatsapp/analytics/stat-tile'
import {
  useGetAllMessagesQuery,
  useResendInboxMessageMutation,
  useDeleteInboxMessageMutation,
  type MessageLogDirectionFilter,
  type MessageLogStatusFilter,
  type WhatsAppLogMessage,
  type WhatsAppMessageSource,
} from '@/stores/whatsappCloud.api'

const SOURCE_LABELS: Record<WhatsAppMessageSource, string> = {
  inbox: 'Inbox',
  invoice: 'Invoice',
  campaign: 'Campaign',
  attendance: 'Attendance',
  fee: 'Fee Reminder',
  result: 'Result',
  ai: 'AI Assistant',
  api: 'API',
  homework: 'Homework',
  holiday: 'Holiday Notice',
}

const TYPE_ICON: Record<string, React.ElementType> = {
  text: MessageSquareText,
  image: ImageIcon,
  video: Video,
  audio: Mic,
  document: FileText,
  template: ListTree,
  interactive: ListTree,
  location: MapPin,
  sticker: Sticker,
  reaction: MessageSquareText,
}

const STATUS_META: Record<
  WhatsAppLogMessage['status'],
  { label: string; icon: React.ElementType; className: string }
> = {
  queued: { label: 'Queued', icon: Clock, className: 'text-muted-foreground border-muted-foreground/30' },
  sent: { label: 'Sent', icon: Check, className: 'text-muted-foreground border-muted-foreground/30' },
  delivered: { label: 'Delivered', icon: CheckCheck, className: 'text-wa-accent border-wa-accent/30' },
  read: { label: 'Read', icon: CheckCheck, className: 'text-[#53BDEB] border-[#53BDEB]/30' },
  failed: { label: 'Failed', icon: AlertCircle, className: 'text-destructive border-destructive/30' },
}

function StatusBadge({ status, errorMessage }: { status: WhatsAppLogMessage['status']; errorMessage?: string }) {
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const badge = (
    <Badge variant='outline' className={cn('gap-1', meta.className)}>
      <Icon className='h-3 w-3' />
      {meta.label}
    </Badge>
  )
  if (status !== 'failed' || !errorMessage) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent>{errorMessage}</TooltipContent>
    </Tooltip>
  )
}

function messagePreview(message: WhatsAppLogMessage): string {
  const { content, type } = message
  if (content.text) return content.text
  if (content.caption) return content.caption
  if (type === 'template' && content.templateName) return `Template: ${content.templateName}`
  if (content.filename) return content.filename
  return `[${type}]`
}

function extractErrorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'data' in err) {
    const message = (err as { data?: { message?: string } }).data?.message
    if (message) return message
  }
  return fallback
}

function ResendButton({ messageId, disabled }: { messageId: string; disabled?: boolean }) {
  const [resend, { isLoading }] = useResendInboxMessageMutation()

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='outline'
          size='sm'
          disabled={disabled || isLoading}
          onClick={async () => {
            try {
              const result = await resend(messageId).unwrap()
              if (result.blockedByWindow) {
                toast.error(result.message?.errorMessage || 'Still outside the 24-hour reply window.')
              } else {
                toast.success('Message resent')
              }
            } catch (error) {
              toast.error(extractErrorMessage(error, 'Failed to resend message'))
            }
          }}
        >
          <RotateCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
          Resend
        </Button>
      </TooltipTrigger>
      <TooltipContent>Resend this failed message</TooltipContent>
    </Tooltip>
  )
}

function DeleteButton({ disabled, onRequestDelete }: { disabled?: boolean; onRequestDelete: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant='outline'
          size='icon'
          className='text-destructive hover:text-destructive'
          disabled={disabled}
          onClick={onRequestDelete}
        >
          <Trash2 className='h-3.5 w-3.5' />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Delete this failed message</TooltipContent>
    </Tooltip>
  )
}

type DeleteConfirmTarget = { mode: 'single'; id: string } | { mode: 'bulk' }

const STATUS_TABS: { value: MessageLogStatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'success', label: 'Success' },
  { value: 'failed', label: 'Failed' },
  { value: 'queued', label: 'Pending' },
]

export function MessageLogPage() {
  const [status, setStatus] = useState<MessageLogStatusFilter>('all')
  const [direction, setDirection] = useState<MessageLogDirectionFilter>('outbound')
  const [source, setSource] = useState<WhatsAppMessageSource | 'all'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(20)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkAction, setBulkAction] = useState<{ type: 'resend' | 'delete'; done: number; total: number } | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmTarget | null>(null)
  const debouncedSearch = useDebouncedValue(search, 400)

  const { data, isLoading, isFetching, refetch } = useGetAllMessagesQuery({
    status,
    direction,
    source: source === 'all' ? undefined : source,
    search: debouncedSearch || undefined,
    page,
    limit,
  })
  const [resend] = useResendInboxMessageMutation()
  const [deleteMessage, { isLoading: isDeletingSingle }] = useDeleteInboxMessageMutation()

  // Live updates: any status change (delivered/read/failed) pushed over the same SSE
  // stream the inbox and analytics dashboard already use, so this list stays current
  // without the user needing to refresh.
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

  function handleStatusChange(value: string) {
    setStatus(value as MessageLogStatusFilter)
    setPage(1)
  }
  function handleDirectionChange(value: string) {
    setDirection(value as MessageLogDirectionFilter)
    setPage(1)
  }
  function handleSourceChange(value: string) {
    setSource(value as WhatsAppMessageSource | 'all')
    setPage(1)
  }
  function handleSearchChange(value: string) {
    setSearch(value)
    setPage(1)
  }

  const summary = data?.summary
  const messages = data?.results ?? []
  const resendableIds = messages
    .filter((m) => m.direction === 'outbound' && m.status === 'failed')
    .map((m) => m.id)

  // Selections are scoped to what's currently on screen — switching page or filters
  // starts a fresh selection rather than silently carrying over ids the user can no
  // longer see.
  useEffect(() => {
    setSelectedIds(new Set())
  }, [status, direction, source, debouncedSearch, page, limit])

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  function toggleSelectAll(checked: boolean) {
    setSelectedIds(checked ? new Set(resendableIds) : new Set())
  }

  async function handleBulkResend() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return

    setBulkAction({ type: 'resend', done: 0, total: ids.length })
    let succeeded = 0
    let blocked = 0
    let failed = 0

    // Sequential, not Promise.all — this fans out to Meta's real send API, so it
    // shouldn't burst all requests at once (the send rate limiter allows 60/min).
    for (const id of ids) {
      try {
        const result = await resend(id).unwrap()
        if (result.blockedByWindow) blocked += 1
        else succeeded += 1
      } catch {
        failed += 1
      }
      setBulkAction((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    setBulkAction(null)
    setSelectedIds(new Set())

    if (succeeded) toast.success(`${succeeded} message${succeeded === 1 ? '' : 's'} resent`)
    if (blocked) toast.error(`${blocked} still outside the 24-hour reply window`)
    if (failed) toast.error(`${failed} failed to resend`)
  }

  async function handleConfirmDelete() {
    if (!deleteConfirm) return

    if (deleteConfirm.mode === 'single') {
      const { id } = deleteConfirm
      setDeleteConfirm(null)
      try {
        await deleteMessage(id).unwrap()
        toast.success('Message deleted')
      } catch (error) {
        toast.error(extractErrorMessage(error, 'Failed to delete message'))
      }
      return
    }

    const ids = Array.from(selectedIds)
    setDeleteConfirm(null)
    setBulkAction({ type: 'delete', done: 0, total: ids.length })
    let succeeded = 0
    let failed = 0

    for (const id of ids) {
      try {
        await deleteMessage(id).unwrap()
        succeeded += 1
      } catch {
        failed += 1
      }
      setBulkAction((prev) => (prev ? { ...prev, done: prev.done + 1 } : prev))
    }

    setBulkAction(null)
    setSelectedIds(new Set())

    if (succeeded) toast.success(`${succeeded} message${succeeded === 1 ? '' : 's'} deleted`)
    if (failed) toast.error(`${failed} failed to delete`)
  }

  return (
    <div className='space-y-6 p-6'>
      <div>
        <h1 className='text-2xl font-semibold'>WhatsApp Message Log</h1>
        <p className='text-sm text-muted-foreground'>
          Every WhatsApp message sent from this branch — invoices, reminders, campaigns and inbox replies — with
          delivery status and one-click resend for anything that failed.
        </p>
      </div>

      <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-4'>
        <StatTile icon={<Send className='h-5 w-5' />} label='Total Messages' value={summary?.total ?? 0} color='slate' />
        <StatTile
          icon={<CheckCheck className='h-5 w-5' />}
          label='Successful'
          value={summary?.success ?? 0}
          color='green'
        />
        <StatTile icon={<AlertCircle className='h-5 w-5' />} label='Failed' value={summary?.failed ?? 0} color='red' />
        <StatTile icon={<Clock className='h-5 w-5' />} label='Pending' value={summary?.queued ?? 0} color='amber' />
      </div>

      <Card>
        <CardContent className='space-y-4 p-4'>
          <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
            <Tabs value={status} onValueChange={handleStatusChange}>
              <TabsList>
                {STATUS_TABS.map((tab) => (
                  <TabsTrigger key={tab.value} value={tab.value}>
                    {tab.label}
                    {summary && (
                      <span className='ml-1.5 text-xs text-muted-foreground'>
                        {tab.value === 'all'
                          ? summary.total
                          : tab.value === 'success'
                            ? summary.success
                            : tab.value === 'failed'
                              ? summary.failed
                              : summary.queued}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            <div className='flex flex-wrap items-center gap-2'>
              <div className='relative w-full sm:w-56'>
                <Search className='pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder='Search name or phone…'
                  value={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className='pl-8'
                />
              </div>

              <Select value={direction} onValueChange={handleDirectionChange}>
                <SelectTrigger className='w-[130px]'>
                  <SelectValue placeholder='Direction' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='outbound'>Sent</SelectItem>
                  <SelectItem value='inbound'>Received</SelectItem>
                  <SelectItem value='all'>All</SelectItem>
                </SelectContent>
              </Select>

              <Select value={source} onValueChange={handleSourceChange}>
                <SelectTrigger className='w-[150px]'>
                  <SelectValue placeholder='Source' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='all'>All sources</SelectItem>
                  {Object.entries(SOURCE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className='flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2'>
              <p className='text-sm'>
                {bulkAction
                  ? `${bulkAction.type === 'resend' ? 'Resending' : 'Deleting'} ${bulkAction.done} / ${bulkAction.total}…`
                  : `${selectedIds.size} failed message${selectedIds.size === 1 ? '' : 's'} selected`}
              </p>
              <div className='flex items-center gap-2'>
                <Button variant='ghost' size='sm' disabled={!!bulkAction} onClick={() => setSelectedIds(new Set())}>
                  Clear
                </Button>
                <Button
                  variant='outline'
                  size='sm'
                  className='text-destructive hover:text-destructive'
                  disabled={!!bulkAction}
                  onClick={() => setDeleteConfirm({ mode: 'bulk' })}
                >
                  {bulkAction?.type === 'delete' ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <Trash2 className='h-3.5 w-3.5' />
                  )}
                  Delete Selected
                </Button>
                <Button size='sm' disabled={!!bulkAction} onClick={handleBulkResend}>
                  {bulkAction?.type === 'resend' ? (
                    <Loader2 className='h-3.5 w-3.5 animate-spin' />
                  ) : (
                    <RotateCw className='h-3.5 w-3.5' />
                  )}
                  Resend Selected
                </Button>
              </div>
            </div>
          )}

          {isLoading ? (
            <div className='space-y-2'>
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className='h-12 w-full' />
              ))}
            </div>
          ) : messages.length === 0 ? (
            <div className='py-16 text-center text-sm text-muted-foreground'>
              No messages match these filters.
            </div>
          ) : (
            <div className={cn('rounded-md border', isFetching && 'opacity-60')}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className='w-10'>
                      {resendableIds.length > 0 && (
                        <Checkbox
                          checked={
                            resendableIds.every((id) => selectedIds.has(id))
                              ? true
                              : resendableIds.some((id) => selectedIds.has(id))
                                ? 'indeterminate'
                                : false
                          }
                          onCheckedChange={(checked) => toggleSelectAll(checked === true)}
                          disabled={!!bulkAction}
                          aria-label='Select all failed messages on this page'
                        />
                      )}
                    </TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className='text-right'>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {messages.map((message) => {
                    const conversation =
                      typeof message.conversationId === 'object' ? message.conversationId : undefined
                    const TypeIcon = TYPE_ICON[message.type] ?? MessageSquareText
                    const isResendable = message.direction === 'outbound' && message.status === 'failed'
                    return (
                      <TableRow key={message.id}>
                        <TableCell>
                          {isResendable && (
                            <Checkbox
                              checked={selectedIds.has(message.id)}
                              onCheckedChange={(checked) => toggleOne(message.id, checked === true)}
                              disabled={!!bulkAction}
                              aria-label='Select message'
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <div className='font-medium'>{conversation?.contactName || conversation?.contactPhone || '—'}</div>
                          {conversation?.contactName && (
                            <div className='text-xs text-muted-foreground'>{conversation.contactPhone}</div>
                          )}
                        </TableCell>
                        <TableCell className='max-w-[320px]'>
                          <div className='flex items-center gap-2'>
                            <TypeIcon className='h-4 w-4 shrink-0 text-muted-foreground' />
                            <span className='truncate whitespace-normal line-clamp-2 text-sm'>
                              {messagePreview(message)}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant='secondary'>{SOURCE_LABELS[message.source] ?? message.source}</Badge>
                        </TableCell>
                        <TableCell>
                          <StatusBadge status={message.status} errorMessage={message.errorMessage} />
                        </TableCell>
                        <TableCell className='text-sm text-muted-foreground'>
                          {format(new Date(message.createdAt), 'd MMM yyyy, h:mm a')}
                        </TableCell>
                        <TableCell className='text-right'>
                          {isResendable && (
                            <div className='flex items-center justify-end gap-1.5'>
                              <ResendButton messageId={message.id} disabled={!!bulkAction} />
                              <DeleteButton
                                disabled={!!bulkAction}
                                onRequestDelete={() => setDeleteConfirm({ mode: 'single', id: message.id })}
                              />
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {data && (
            <SimplePagination
              currentPage={data.page}
              totalPages={data.totalPages}
              totalResults={data.totalResults}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={setLimit}
            />
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteConfirm !== null}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
        handleConfirm={handleConfirmDelete}
        isLoading={deleteConfirm?.mode === 'single' && isDeletingSingle}
        destructive
        confirmText='Delete'
        title='Delete failed message?'
        desc={
          deleteConfirm?.mode === 'bulk'
            ? `This will permanently remove ${selectedIds.size} failed message${selectedIds.size === 1 ? '' : 's'} from the log. This can't be undone.`
            : "This will permanently remove this message from the log. This can't be undone."
        }
      />
    </div>
  )
}

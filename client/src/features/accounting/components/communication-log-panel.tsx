import { useState } from 'react'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Phone,
  MessageCircle,
  MessageSquare,
  Mail,
  Users,
  StickyNote,
  MapPin,
  MoreHorizontal,
  Plus,
  Pencil,
  Trash2,
  CalendarClock,
  ChevronDown,
  Check,
  X,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { TimePicker } from '@/components/ui/time-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useLanguage } from '@/context/language-context'
import { Can } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useGetCommunicationLogsQuery,
  useCreateCommunicationLogMutation,
  useUpdateCommunicationLogMutation,
  useDeleteCommunicationLogMutation,
  type CommunicationLog,
  type CommunicationType,
  type CommunicationOutcome,
  type RelatedRecordType,
} from '@/stores/communicationLog.api'

const TYPE_CONFIG: Record<CommunicationType, { label: string; icon: typeof Phone; iconBg: string; iconText: string; ring: string }> = {
  call: { label: 'Call', icon: Phone, iconBg: 'bg-blue-500/10', iconText: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500' },
  whatsapp: { label: 'WhatsApp', icon: MessageCircle, iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500' },
  sms: { label: 'SMS', icon: MessageSquare, iconBg: 'bg-violet-500/10', iconText: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500' },
  email: { label: 'Email', icon: Mail, iconBg: 'bg-amber-500/10', iconText: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500' },
  meeting: { label: 'Meeting', icon: Users, iconBg: 'bg-indigo-500/10', iconText: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500' },
  note: { label: 'Note', icon: StickyNote, iconBg: 'bg-slate-500/10', iconText: 'text-slate-600 dark:text-slate-400', ring: 'ring-slate-500' },
  visit: { label: 'Visit', icon: MapPin, iconBg: 'bg-rose-500/10', iconText: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500' },
  other: { label: 'Other', icon: MoreHorizontal, iconBg: 'bg-gray-500/10', iconText: 'text-gray-600 dark:text-gray-400', ring: 'ring-gray-500' },
}

const OUTCOME_CONFIG: Record<CommunicationOutcome, { label: string; className: string; activeClassName: string }> = {
  positive: {
    label: 'Positive',
    className: 'border-emerald-500/30 text-emerald-600 dark:text-emerald-400',
    activeClassName: 'border-emerald-500 bg-emerald-500 text-white',
  },
  neutral: {
    label: 'Neutral',
    className: 'border-slate-500/30 text-slate-600 dark:text-slate-400',
    activeClassName: 'border-slate-500 bg-slate-500 text-white',
  },
  negative: {
    label: 'Negative',
    className: 'border-red-500/30 text-red-600 dark:text-red-400',
    activeClassName: 'border-red-500 bg-red-500 text-white',
  },
  no_answer: {
    label: 'No Answer',
    className: 'border-amber-500/30 text-amber-600 dark:text-amber-400',
    activeClassName: 'border-amber-500 bg-amber-500 text-white',
  },
  follow_up_needed: {
    label: 'Follow-up Needed',
    className: 'border-blue-500/30 text-blue-600 dark:text-blue-400',
    activeClassName: 'border-blue-500 bg-blue-500 text-white',
  },
}

interface CommunicationLogPanelProps {
  relatedType: RelatedRecordType
  relatedId: string
  relatedName?: string
}

export function CommunicationLogPanel({ relatedType, relatedId, relatedName }: CommunicationLogPanelProps) {
  const { t } = useLanguage()
  const { data, isLoading } = useGetCommunicationLogsQuery(
    relatedId ? { relatedType, relatedId, limit: 100 } : undefined,
    { skip: !relatedId },
  )
  const logs = data?.results || []

  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editEntry, setEditEntry] = useState<CommunicationLog | null>(null)
  const [deleteEntry, setDeleteEntry] = useState<CommunicationLog | null>(null)

  return (
    <Card className="overflow-hidden">
      <Collapsible open={expanded} onOpenChange={setExpanded}>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md text-left transition-colors hover:text-primary"
              disabled={logs.length === 0}
            >
              <CardTitle className="text-base">{t('Communication Log')}</CardTitle>
              {logs.length > 0 && (
                <Badge variant="secondary" className="rounded-full px-2 tabular-nums">
                  {logs.length}
                </Badge>
              )}
              {logs.length > 0 && (
                <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-200', expanded && 'rotate-180')} />
              )}
            </button>
          </CollapsibleTrigger>
          <Can permission="createCommunicationLog">
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="mr-1.5 h-4 w-4" />
              {t('Log Interaction')}
            </Button>
          </Can>
        </CardHeader>
        <CollapsibleContent>
          <CardContent>
            {isLoading ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('Loading...')}</p>
            ) : logs.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">{t('No interactions logged yet')}</p>
            ) : (
              <div className="space-y-2">
                {logs.map((entry) => (
                  <LogEntryRow
                    key={entry.id || entry._id}
                    entry={entry}
                    onEdit={() => setEditEntry(entry)}
                    onDelete={() => setDeleteEntry(entry)}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
        {!expanded && logs.length > 0 && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">
              {t('Latest')}: <span className="text-foreground">{logs[0].subject || t(TYPE_CONFIG[logs[0].type]?.label || 'Other')}</span>
              {' · '}
              {formatDistanceToNow(new Date(logs[0].createdAt), { addSuffix: true })}
            </p>
          </CardContent>
        )}
      </Collapsible>

      <LogInteractionDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        relatedType={relatedType}
        relatedId={relatedId}
        relatedName={relatedName}
      />

      {editEntry && (
        <EditLogDialog entry={editEntry} open={!!editEntry} onOpenChange={(v) => !v && setEditEntry(null)} />
      )}

      <AlertDialog open={!!deleteEntry} onOpenChange={(v) => !v && setDeleteEntry(null)}>
        <DeleteLogDialogContent entry={deleteEntry} onClose={() => setDeleteEntry(null)} />
      </AlertDialog>
    </Card>
  )
}

function LogEntryRow({
  entry,
  onEdit,
  onDelete,
}: {
  entry: CommunicationLog
  onEdit: () => void
  onDelete: () => void
}) {
  const { t } = useLanguage()
  const config = TYPE_CONFIG[entry.type] || TYPE_CONFIG.other
  const Icon = config.icon
  const outcome = entry.outcome ? OUTCOME_CONFIG[entry.outcome] : null
  const createdByName =
    typeof entry.createdBy === 'object' && entry.createdBy ? entry.createdBy.name : undefined

  return (
    <div className="group flex gap-3 rounded-lg border border-transparent p-2 transition-colors hover:border-border hover:bg-muted/40">
      <div className={cn('mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full', config.iconBg)}>
        <Icon className={cn('h-4 w-4', config.iconText)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{entry.subject || t(config.label)}</span>
          <Badge variant="outline" className="text-[10px]">{t(config.label)}</Badge>
          {outcome && (
            <Badge variant="outline" className={cn('border text-[10px] font-normal', outcome.className)}>
              {t(outcome.label)}
            </Badge>
          )}
          {entry.reminderId && (
            <Badge variant="outline" className="gap-1 text-[10px]">
              <CalendarClock className="h-3 w-3" />
              {t('Follow-up set')}
            </Badge>
          )}
        </div>
        <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{entry.notes}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(entry.createdAt), { addSuffix: true })}
          {createdByName ? ` · ${createdByName}` : ''}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <Can permission="editCommunicationLog">
            <DropdownMenuItem onClick={onEdit}>
              <Pencil className="mr-2 h-3.5 w-3.5" />
              {t('Edit')}
            </DropdownMenuItem>
          </Can>
          <Can permission="deleteCommunicationLog">
            <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              {t('Delete')}
            </DropdownMenuItem>
          </Can>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function TypePicker({ value, onChange }: { value: CommunicationType; onChange: (v: CommunicationType) => void }) {
  const { t } = useLanguage()
  return (
    <div className="grid grid-cols-4 gap-2">
      {(Object.entries(TYPE_CONFIG) as [CommunicationType, (typeof TYPE_CONFIG)[CommunicationType]][]).map(([key, cfg]) => {
        const Icon = cfg.icon
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-lg border p-2.5 text-xs transition-all',
              active ? cn('border-transparent ring-2', cfg.ring, cfg.iconBg) : 'border-border hover:bg-muted/50',
            )}
          >
            <Icon className={cn('h-4 w-4', active ? cfg.iconText : 'text-muted-foreground')} />
            <span className={cn(active ? cfg.iconText : 'text-muted-foreground')}>{t(cfg.label)}</span>
          </button>
        )
      })}
    </div>
  )
}

function OutcomePicker({ value, onChange }: { value: CommunicationOutcome | ''; onChange: (v: CommunicationOutcome | '') => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.entries(OUTCOME_CONFIG) as [CommunicationOutcome, (typeof OUTCOME_CONFIG)[CommunicationOutcome]][]).map(([key, cfg]) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(active ? '' : key)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
              active ? cfg.activeClassName : cfg.className,
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {t(cfg.label)}
          </button>
        )
      })}
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
        >
          <X className="h-3 w-3" />
          {t('Clear')}
        </button>
      )}
    </div>
  )
}

function LogInteractionDialog({
  open,
  onOpenChange,
  relatedType,
  relatedId,
  relatedName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  relatedType: RelatedRecordType
  relatedId: string
  relatedName?: string
}) {
  const { t } = useLanguage()
  const [createLog, { isLoading }] = useCreateCommunicationLogMutation()

  const [type, setType] = useState<CommunicationType>('call')
  const [subject, setSubject] = useState('')
  const [notes, setNotes] = useState('')
  const [outcome, setOutcome] = useState<CommunicationOutcome | ''>('')
  const [setFollowUp, setSetFollowUp] = useState(false)
  const [followUpDate, setFollowUpDate] = useState<Date | undefined>(undefined)
  const [followUpTime, setFollowUpTime] = useState('09:00')

  const reset = () => {
    setType('call')
    setSubject('')
    setNotes('')
    setOutcome('')
    setSetFollowUp(false)
    setFollowUpDate(undefined)
    setFollowUpTime('09:00')
  }

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast.error(t('Notes are required'))
      return
    }
    if (setFollowUp && !followUpDate) {
      toast.error(t('Pick a follow-up date'))
      return
    }

    let followUpAt: string | undefined
    if (setFollowUp && followUpDate) {
      const [hours, minutes] = followUpTime.split(':').map(Number)
      const combined = new Date(followUpDate)
      combined.setHours(hours || 0, minutes || 0, 0, 0)
      followUpAt = combined.toISOString()
    }

    try {
      await createLog({
        relatedType,
        relatedId,
        type,
        subject: subject.trim() || undefined,
        notes: notes.trim(),
        outcome: outcome || undefined,
        followUpAt,
      }).unwrap()
      toast.success(t('Interaction logged'))
      reset()
      onOpenChange(false)
    } catch {
      toast.error(t('Failed to log interaction'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={cn('flex h-8 w-8 items-center justify-center rounded-full', TYPE_CONFIG[type].iconBg)}>
              {(() => { const Icon = TYPE_CONFIG[type].icon; return <Icon className={cn('h-4 w-4', TYPE_CONFIG[type].iconText)} /> })()}
            </span>
            {t('Log Interaction')}{relatedName ? ` — ${relatedName}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-0.5 py-1">
          <div className="space-y-2">
            <Label>{t('Type')}</Label>
            <TypePicker value={type} onChange={setType} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('Subject')}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder={t('e.g. Payment follow-up')} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('Notes')} *</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} placeholder={t('What was discussed...')} />
          </div>

          <div className="space-y-2">
            <Label>{t('Outcome')}</Label>
            <OutcomePicker value={outcome} onChange={setOutcome} />
          </div>

          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <Checkbox id="set-follow-up" checked={setFollowUp} onCheckedChange={(v) => setSetFollowUp(!!v)} />
              <Label htmlFor="set-follow-up" className="cursor-pointer font-normal">
                {t('Set a follow-up reminder')}
              </Label>
            </div>

            {setFollowUp && (
              <div className="flex gap-2 pl-6">
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="flex-1 justify-start font-normal">
                      <CalendarClock className="mr-2 h-4 w-4" />
                      {followUpDate ? format(followUpDate, 'PPP') : t('Pick a date')}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <Calendar mode="single" selected={followUpDate} onSelect={setFollowUpDate} initialFocus />
                  </PopoverContent>
                </Popover>
                <TimePicker value={followUpTime} onChange={setFollowUpTime} className="w-32" />
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditLogDialog({
  entry,
  open,
  onOpenChange,
}: {
  entry: CommunicationLog
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useLanguage()
  const [updateLog, { isLoading }] = useUpdateCommunicationLogMutation()
  const [subject, setSubject] = useState(entry.subject || '')
  const [notes, setNotes] = useState(entry.notes)
  const [outcome, setOutcome] = useState<CommunicationOutcome | ''>(entry.outcome || '')

  const handleSubmit = async () => {
    if (!notes.trim()) {
      toast.error(t('Notes are required'))
      return
    }
    try {
      await updateLog({
        id: entry.id || entry._id || '',
        subject: subject.trim() || undefined,
        notes: notes.trim(),
        outcome: outcome || undefined,
      }).unwrap()
      toast.success(t('Interaction updated'))
      onOpenChange(false)
    } catch {
      toast.error(t('Failed to update interaction'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Edit Interaction')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>{t('Subject')}</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('Notes')} *</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>{t('Outcome')}</Label>
            <OutcomePicker value={outcome} onChange={setOutcome} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('Cancel')}</Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading ? t('Saving...') : t('Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DeleteLogDialogContent({ entry, onClose }: { entry: CommunicationLog | null; onClose: () => void }) {
  const { t } = useLanguage()
  const [deleteLog, { isLoading }] = useDeleteCommunicationLogMutation()

  const handleDelete = async () => {
    if (!entry) return
    try {
      await deleteLog(entry.id || entry._id || '').unwrap()
      toast.success(t('Interaction deleted'))
      onClose()
    } catch {
      toast.error(t('Failed to delete interaction'))
    }
  }

  return (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{t('Delete Interaction')}</AlertDialogTitle>
        <AlertDialogDescription>{t('This communication log entry will be permanently removed.')}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel disabled={isLoading}>{t('Cancel')}</AlertDialogCancel>
        <AlertDialogAction
          onClick={handleDelete}
          disabled={isLoading}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
        >
          {isLoading ? t('Deleting...') : t('Delete')}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  )
}

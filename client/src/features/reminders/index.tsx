import { useMemo, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { format, isPast, isToday, startOfDay, subDays } from 'date-fns'
import {
  Plus,
  AlarmClock,
  CalendarClock,
  MoreHorizontal,
  Pencil,
  Trash2,
  Check,
  Clock,
  Bell,
  MessageCircle,
  User,
  Building2,
} from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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
  useGetRemindersQuery,
  useCompleteReminderMutation,
  useSnoozeReminderMutation,
  useDeleteReminderMutation,
  type Reminder,
  type ReminderPriority,
} from '@/stores/reminder.api'
import { ReminderMutateDialog } from './components/reminder-mutate-dialog'

const PRIORITY_STYLES: Record<ReminderPriority, string> = {
  low: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  high: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  urgent: 'bg-red-500/10 text-red-600 dark:text-red-400',
}

type StatusTab = 'active' | 'completed' | 'cancelled' | 'all'

export default function RemindersPage() {
  const { t } = useLanguage()
  const { data, isLoading } = useGetRemindersQuery({ limit: 500 })
  const reminders = useMemo(() => data?.results || [], [data])

  const [statusTab, setStatusTab] = useState<StatusTab>('active')
  const [priorityFilter, setPriorityFilter] = useState<ReminderPriority | 'all'>('all')
  const [search, setSearch] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [editReminder, setEditReminder] = useState<Reminder | null>(null)
  const [deleteReminder, setDeleteReminder] = useState<Reminder | null>(null)

  const [completeReminder] = useCompleteReminderMutation()
  const [snoozeReminder] = useSnoozeReminderMutation()
  const [deleteReminderMutation, { isLoading: isDeleting }] = useDeleteReminderMutation()

  const now = new Date()
  const todayStart = startOfDay(now)
  const weekAgo = subDays(now, 7)

  const stats = useMemo(() => {
    const active = reminders.filter((r) => r.status === 'pending' || r.status === 'snoozed')
    const overdue = active.filter((r) => isPast(new Date(r.dueAt)) && !isToday(new Date(r.dueAt)))
    const dueToday = active.filter((r) => isToday(new Date(r.dueAt)))
    const upcoming = active.filter((r) => new Date(r.dueAt) > todayStart && !isToday(new Date(r.dueAt)))
    const completedThisWeek = reminders.filter(
      (r) => r.status === 'completed' && r.completedAt && new Date(r.completedAt) >= weekAgo,
    )
    return { overdue, dueToday, upcoming, completedThisWeek }
  }, [reminders, todayStart, weekAgo])

  const filtered = useMemo(() => {
    let list = reminders
    if (statusTab === 'active') list = list.filter((r) => r.status === 'pending' || r.status === 'snoozed')
    else if (statusTab === 'completed') list = list.filter((r) => r.status === 'completed')
    else if (statusTab === 'cancelled') list = list.filter((r) => r.status === 'cancelled')

    if (priorityFilter !== 'all') list = list.filter((r) => r.priority === priorityFilter)
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter((r) => r.title.toLowerCase().includes(q) || r.description?.toLowerCase().includes(q))
    }
    return [...list].sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime())
  }, [reminders, statusTab, priorityFilter, search])

  const groups = useMemo(() => {
    if (statusTab !== 'active') return { overdue: [], today: [], upcoming: [], other: filtered }
    const overdue = filtered.filter((r) => isPast(new Date(r.dueAt)) && !isToday(new Date(r.dueAt)))
    const today = filtered.filter((r) => isToday(new Date(r.dueAt)))
    const upcoming = filtered.filter((r) => new Date(r.dueAt) > todayStart && !isToday(new Date(r.dueAt)))
    return { overdue, today, upcoming, other: [] }
  }, [filtered, statusTab, todayStart])

  const handleComplete = async (reminder: Reminder) => {
    try {
      await completeReminder(reminder.id || reminder._id || '').unwrap()
      toast.success(t('Reminder completed'))
    } catch {
      toast.error(t('Failed to update reminder'))
    }
  }

  const handleSnooze = async (reminder: Reminder, snoozedUntil: Date) => {
    try {
      await snoozeReminder({ id: reminder.id || reminder._id || '', snoozedUntil: snoozedUntil.toISOString() }).unwrap()
      toast.success(t('Reminder snoozed'))
    } catch {
      toast.error(t('Failed to snooze reminder'))
    }
  }

  const handleDelete = async () => {
    if (!deleteReminder) return
    try {
      await deleteReminderMutation(deleteReminder.id || deleteReminder._id || '').unwrap()
      toast.success(t('Reminder deleted'))
      setDeleteReminder(null)
    } catch {
      toast.error(t('Failed to delete reminder'))
    }
  }

  return (
    <div className="h-full w-full space-y-6 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <AlarmClock className="h-7 w-7" />
            {t('Tasks & Reminders')}
          </h1>
          <p className="text-muted-foreground">{t('Follow-ups and alarms for customers, suppliers, and general tasks')}</p>
        </div>
        <Can permission="createReminders">
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            {t('New Reminder')}
          </Button>
        </Can>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Overdue')} value={stats.overdue.length} tone="text-red-600" />
        <StatCard label={t('Due Today')} value={stats.dueToday.length} tone="text-amber-600" />
        <StatCard label={t('Upcoming')} value={stats.upcoming.length} tone="text-blue-600" />
        <StatCard label={t('Completed this week')} value={stats.completedThisWeek.length} tone="text-emerald-600" />
      </div>

      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as StatusTab)}>
              <TabsList>
                <TabsTrigger value="active">{t('Active')}</TabsTrigger>
                <TabsTrigger value="completed">{t('Completed')}</TabsTrigger>
                <TabsTrigger value="cancelled">{t('Cancelled')}</TabsTrigger>
                <TabsTrigger value="all">{t('All')}</TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('Search reminders...')}
                className="w-48"
              />
              <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v as ReminderPriority | 'all')}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t('All priorities')}</SelectItem>
                  <SelectItem value="low">{t('Low')}</SelectItem>
                  <SelectItem value="medium">{t('Medium')}</SelectItem>
                  <SelectItem value="high">{t('High')}</SelectItem>
                  <SelectItem value="urgent">{t('Urgent')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {isLoading ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('Loading...')}</p>
          ) : filtered.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">{t('No reminders found')}</p>
          ) : statusTab === 'active' ? (
            <div className="space-y-6">
              {groups.overdue.length > 0 && (
                <ReminderGroup
                  title={t('Overdue')}
                  items={groups.overdue}
                  onComplete={handleComplete}
                  onSnooze={handleSnooze}
                  onEdit={setEditReminder}
                  onDelete={setDeleteReminder}
                />
              )}
              {groups.today.length > 0 && (
                <ReminderGroup
                  title={t('Today')}
                  items={groups.today}
                  onComplete={handleComplete}
                  onSnooze={handleSnooze}
                  onEdit={setEditReminder}
                  onDelete={setDeleteReminder}
                />
              )}
              {groups.upcoming.length > 0 && (
                <ReminderGroup
                  title={t('Upcoming')}
                  items={groups.upcoming}
                  onComplete={handleComplete}
                  onSnooze={handleSnooze}
                  onEdit={setEditReminder}
                  onDelete={setDeleteReminder}
                />
              )}
            </div>
          ) : (
            <ReminderGroup
              items={filtered}
              onComplete={handleComplete}
              onSnooze={handleSnooze}
              onEdit={setEditReminder}
              onDelete={setDeleteReminder}
            />
          )}
        </CardContent>
      </Card>

      <ReminderMutateDialog open={addOpen} onOpenChange={setAddOpen} />
      {editReminder && (
        <ReminderMutateDialog
          open={!!editReminder}
          onOpenChange={(v) => !v && setEditReminder(null)}
          reminder={editReminder}
        />
      )}

      <AlertDialog open={!!deleteReminder} onOpenChange={(v) => !v && setDeleteReminder(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Delete Reminder')}</AlertDialogTitle>
            <AlertDialogDescription>{t('This reminder will be permanently removed.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t('Deleting...') : t('Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('mt-1 text-2xl font-semibold tabular-nums', tone)}>{value}</p>
      </CardContent>
    </Card>
  )
}

function ReminderGroup({
  title,
  items,
  onComplete,
  onSnooze,
  onEdit,
  onDelete,
}: {
  title?: string
  items: Reminder[]
  onComplete: (r: Reminder) => void
  onSnooze: (r: Reminder, until: Date) => void
  onEdit: (r: Reminder) => void
  onDelete: (r: Reminder) => void
}) {
  const { t } = useLanguage()
  return (
    <div>
      {title && <h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t(title)}</h3>}
      <div className="space-y-2">
        {items.map((reminder) => (
          <ReminderRow
            key={reminder.id || reminder._id}
            reminder={reminder}
            onComplete={onComplete}
            onSnooze={onSnooze}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  )
}

function ReminderRow({
  reminder,
  onComplete,
  onSnooze,
  onEdit,
  onDelete,
}: {
  reminder: Reminder
  onComplete: (r: Reminder) => void
  onSnooze: (r: Reminder, until: Date) => void
  onEdit: (r: Reminder) => void
  onDelete: (r: Reminder) => void
}) {
  const { t } = useLanguage()
  const isDone = reminder.status === 'completed'
  const dueDate = new Date(reminder.dueAt)
  const overdue = !isDone && isPast(dueDate) && !isToday(dueDate)

  return (
    <div className={cn('flex items-start gap-3 rounded-lg border p-3', overdue && 'border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20')}>
      <Checkbox
        checked={isDone}
        disabled={isDone}
        onCheckedChange={() => !isDone && onComplete(reminder)}
        className="mt-0.5"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm font-medium', isDone && 'text-muted-foreground line-through')}>
            {reminder.title}
          </span>
          <Badge className={cn('text-[10px] font-normal', PRIORITY_STYLES[reminder.priority])}>
            {t(reminder.priority.charAt(0).toUpperCase() + reminder.priority.slice(1))}
          </Badge>
          {reminder.relatedType && reminder.relatedId && (
            <Link
              to="/accounting"
              search={
                reminder.relatedType === 'Customer'
                  ? { tab: 'customer-ledger', customerId: reminder.relatedId }
                  : { tab: 'supplier-ledger', supplierId: reminder.relatedId }
              }
            >
              <Badge variant="outline" className="gap-1 text-[10px] hover:bg-muted">
                {reminder.relatedType === 'Customer' ? <User className="h-3 w-3" /> : <Building2 className="h-3 w-3" />}
                {reminder.relatedType}
              </Badge>
            </Link>
          )}
          {reminder.notifyChannels.includes('whatsapp') && (
            <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
          )}
          {reminder.notifyChannels.includes('push') && (
            <Bell className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        {reminder.description && (
          <p className="mt-1 text-sm text-muted-foreground">{reminder.description}</p>
        )}
        <p className={cn('mt-1 flex items-center gap-1 text-xs', overdue ? 'font-medium text-red-600' : 'text-muted-foreground')}>
          <Clock className="h-3 w-3" />
          {format(dueDate, 'PPP p')}
        </p>
      </div>

      {!isDone && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <Can permission="editReminders">
              <DropdownMenuItem onClick={() => onComplete(reminder)}>
                <Check className="mr-2 h-3.5 w-3.5" />
                {t('Mark complete')}
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <CalendarClock className="mr-2 h-3.5 w-3.5" />
                  {t('Snooze')}
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  <DropdownMenuItem onClick={() => onSnooze(reminder, new Date(Date.now() + 60 * 60 * 1000))}>
                    {t('1 hour')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const tomorrow = new Date()
                      tomorrow.setDate(tomorrow.getDate() + 1)
                      tomorrow.setHours(9, 0, 0, 0)
                      onSnooze(reminder, tomorrow)
                    }}
                  >
                    {t('Tomorrow, 9 AM')}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => {
                      const nextWeek = new Date()
                      nextWeek.setDate(nextWeek.getDate() + 7)
                      nextWeek.setHours(9, 0, 0, 0)
                      onSnooze(reminder, nextWeek)
                    }}
                  >
                    {t('Next week')}
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem onClick={() => onEdit(reminder)}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                {t('Edit')}
              </DropdownMenuItem>
            </Can>
            <Can permission="deleteReminders">
              <DropdownMenuItem onClick={() => onDelete(reminder)} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                {t('Delete')}
              </DropdownMenuItem>
            </Can>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}

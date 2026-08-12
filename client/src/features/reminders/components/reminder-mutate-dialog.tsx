import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { AlarmClock, BellOff, BellRing, CalendarIcon, Check, Info, Loader2, Repeat as RepeatIcon } from 'lucide-react'
import { usePushNotifications } from '@/hooks/use-push-notifications'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Calendar } from '@/components/ui/calendar'
import { TimePicker } from '@/components/ui/time-picker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { RelatedRecordPicker, type RelatedRecordValue } from './related-record-picker'
import {
  useCreateReminderMutation,
  useUpdateReminderMutation,
  type Reminder,
  type ReminderPriority,
  type ReminderRepeat,
  type ReminderChannel,
} from '@/stores/reminder.api'

const PRIORITIES: ReminderPriority[] = ['low', 'medium', 'high', 'urgent']
const REPEATS: ReminderRepeat[] = ['none', 'daily', 'weekly', 'monthly']

const PRIORITY_STYLES: Record<ReminderPriority, { className: string; activeClassName: string }> = {
  low: { className: 'border-slate-500/30 text-slate-600 dark:text-slate-400', activeClassName: 'border-slate-500 bg-slate-500 text-white' },
  medium: { className: 'border-blue-500/30 text-blue-600 dark:text-blue-400', activeClassName: 'border-blue-500 bg-blue-500 text-white' },
  high: { className: 'border-amber-500/30 text-amber-600 dark:text-amber-400', activeClassName: 'border-amber-500 bg-amber-500 text-white' },
  urgent: { className: 'border-red-500/30 text-red-600 dark:text-red-400', activeClassName: 'border-red-500 bg-red-500 text-white' },
}

function PriorityPicker({ value, onChange }: { value: ReminderPriority; onChange: (v: ReminderPriority) => void }) {
  const { t } = useLanguage()
  return (
    <div className="flex flex-wrap gap-1.5">
      {PRIORITIES.map((p) => {
        const active = value === p
        const style = PRIORITY_STYLES[p]
        return (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-all',
              active ? style.activeClassName : style.className,
            )}
          >
            {active && <Check className="h-3 w-3" />}
            {t(p.charAt(0).toUpperCase() + p.slice(1))}
          </button>
        )
      })}
    </div>
  )
}

interface ReminderMutateDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  reminder?: Reminder | null
}

export function ReminderMutateDialog({ open, onOpenChange, reminder }: ReminderMutateDialogProps) {
  const { t } = useLanguage()
  const isEdit = !!reminder
  const [createReminder, { isLoading: creating }] = useCreateReminderMutation()
  const [updateReminder, { isLoading: updating }] = useUpdateReminderMutation()
  const isLoading = creating || updating

  const { supported: pushSupported, subscribed: pushSubscribed, loading: pushRequesting, subscribe: subscribePush } = usePushNotifications()
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>(
    typeof Notification !== 'undefined' ? Notification.permission : 'unsupported',
  )

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [dueDate, setDueDate] = useState<Date | undefined>(undefined)
  const [dueTime, setDueTime] = useState('09:00')
  const [priority, setPriority] = useState<ReminderPriority>('medium')
  const [repeat, setRepeat] = useState<ReminderRepeat>('none')
  const [related, setRelated] = useState<RelatedRecordValue | null>(null)
  const [notifyPush, setNotifyPush] = useState(true)
  const [notifyWhatsapp, setNotifyWhatsapp] = useState(false)
  const [whatsappPhone, setWhatsappPhone] = useState('')

  useEffect(() => {
    if (!open) return
    setNotificationPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
    if (reminder) {
      setTitle(reminder.title)
      setDescription(reminder.description || '')
      const due = new Date(reminder.dueAt)
      setDueDate(due)
      setDueTime(format(due, 'HH:mm'))
      setPriority(reminder.priority)
      setRepeat(reminder.repeat)
      setRelated(
        reminder.relatedType && reminder.relatedId
          ? { relatedType: reminder.relatedType, relatedId: reminder.relatedId, name: '' }
          : null,
      )
      setNotifyPush(reminder.notifyChannels.includes('push'))
      setNotifyWhatsapp(reminder.notifyChannels.includes('whatsapp'))
      setWhatsappPhone(reminder.whatsappPhone || '')
    } else {
      setTitle('')
      setDescription('')
      setDueDate(undefined)
      setDueTime('09:00')
      setPriority('medium')
      setRepeat('none')
      setRelated(null)
      setNotifyPush(true)
      setNotifyWhatsapp(false)
      setWhatsappPhone('')
    }
  }, [open, reminder])

  useEffect(() => {
    if (related?.whatsapp || related?.phone) {
      setWhatsappPhone(related.whatsapp || related.phone || '')
    }
  }, [related])

  // Force the browser's notification-permission prompt the moment push alerts are
  // wanted — the alarm scheduler silently no-ops without a subscription, so this is
  // the one moment we can actually get the user to grant it.
  const requestPushPermission = async () => {
    if (!pushSupported || pushSubscribed) return
    await subscribePush()
    setNotificationPermission(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported')
  }

  useEffect(() => {
    if (!open || !notifyPush) return
    if (!pushSupported || pushSubscribed) return
    if (notificationPermission !== 'default') return
    requestPushPermission()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, notifyPush, pushSupported, pushSubscribed, notificationPermission])

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error(t('Title is required'))
      return
    }
    if (!dueDate) {
      toast.error(t('Due date is required'))
      return
    }
    if (notifyWhatsapp && !whatsappPhone.trim()) {
      toast.error(t('Enter a WhatsApp number for the alert'))
      return
    }

    const [hours, minutes] = dueTime.split(':').map(Number)
    const combined = new Date(dueDate)
    combined.setHours(hours || 0, minutes || 0, 0, 0)

    const notifyChannels: ReminderChannel[] = [
      ...(notifyPush ? (['push'] as const) : []),
      ...(notifyWhatsapp ? (['whatsapp'] as const) : []),
    ]

    const payload = {
      title: title.trim(),
      description: description.trim() || undefined,
      relatedType: related?.relatedType,
      relatedId: related?.relatedId,
      dueAt: combined.toISOString(),
      priority,
      repeat,
      notifyChannels,
      whatsappPhone: notifyWhatsapp ? whatsappPhone.trim() : undefined,
    }

    try {
      if (isEdit && reminder) {
        await updateReminder({ id: reminder.id || reminder._id || '', ...payload }).unwrap()
        toast.success(t('Reminder updated'))
      } else {
        await createReminder(payload).unwrap()
        toast.success(t('Reminder created'))
      }
      onOpenChange(false)
    } catch {
      toast.error(t('Failed to save reminder'))
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
              <AlarmClock className="h-4 w-4 text-primary" />
            </span>
            {isEdit ? t('Edit Reminder') : t('New Reminder')}
          </DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-0.5 py-1">
          <div className="space-y-1.5">
            <Label>{t('Title')} *</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('e.g. Call about overdue payment')} />
          </div>

          <div className="space-y-1.5">
            <Label>{t('Description')}</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('Due Date')} *</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {dueDate ? format(dueDate, 'PPP') : t('Pick a date')}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={dueDate} onSelect={setDueDate} initialFocus />
                </PopoverContent>
              </Popover>
            </div>
            <div className="space-y-1.5">
              <Label>{t('Due Time')}</Label>
              <TimePicker value={dueTime} onChange={setDueTime} className="w-full" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Priority')}</Label>
            <PriorityPicker value={priority} onChange={setPriority} />
          </div>

          <div className="space-y-1.5">
            <Label className="flex items-center gap-1"><RepeatIcon className="h-3.5 w-3.5" />{t('Repeat')}</Label>
            <Select value={repeat} onValueChange={(v) => setRepeat(v as ReminderRepeat)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPEATS.map((r) => (
                  <SelectItem key={r} value={r}>{t(r.charAt(0).toUpperCase() + r.slice(1))}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>{t('Related Customer / Supplier')}</Label>
            <RelatedRecordPicker value={related} onChange={setRelated} />
          </div>

          <div className="space-y-2 rounded-lg border bg-muted/30 p-3">
            <Label className="text-xs text-muted-foreground">{t('Notify via')}</Label>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Checkbox id="notify-push" checked={notifyPush} onCheckedChange={(v) => setNotifyPush(!!v)} />
                <Label htmlFor="notify-push" className="cursor-pointer font-normal">{t('In-app + browser push')}</Label>
              </div>
              {notifyPush && pushSupported && (
                <>
                  {pushRequesting ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('Requesting...')}
                    </span>
                  ) : notificationPermission === 'granted' || pushSubscribed ? (
                    <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <BellRing className="h-3 w-3" />
                      {t('Enabled')}
                    </span>
                  ) : notificationPermission === 'denied' ? (
                    <button
                      type="button"
                      onClick={() => toast.info(t('Notifications are blocked — enable them in your browser\'s site settings for alerts to reach you when this tab is closed.'))}
                      className="flex items-center gap-1 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                    >
                      <BellOff className="h-3 w-3" />
                      {t('Blocked')}
                    </button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={requestPushPermission}>
                      {t('Enable')}
                    </Button>
                  )}
                </>
              )}
            </div>
            {notifyPush && notificationPermission === 'denied' && (
              <p className="flex items-start gap-1 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3 w-3 shrink-0" />
                {t('Browser alerts are blocked, but you’ll still get an in-app alarm (toast + sound) whenever this tab is open.')}
              </p>
            )}
            <div className="flex items-center gap-2">
              <Checkbox id="notify-whatsapp" checked={notifyWhatsapp} onCheckedChange={(v) => setNotifyWhatsapp(!!v)} />
              <Label htmlFor="notify-whatsapp" className="cursor-pointer font-normal">{t('WhatsApp alert')}</Label>
            </div>
            {notifyWhatsapp && (
              <div className="space-y-1.5 pl-6">
                <Input
                  value={whatsappPhone}
                  onChange={(e) => setWhatsappPhone(e.target.value)}
                  placeholder={t('WhatsApp number')}
                />
                <p className="flex items-start gap-1 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  {t('Requires an active WhatsApp connection and either a recent chat with this number or an approved message template.')}
                </p>
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

import { useEffect, useMemo, useState } from 'react'
import { useSelector } from 'react-redux'
import {
  AlarmClock,
  CalendarClock,
  Check,
  CheckCircle2,
  Circle,
  Copy,
  Flame,
  Loader2,
  LogIn,
  Mail,
  MessageCircle,
  NotebookPen,
  Phone,
  RotateCcw,
  SkipForward,
  Snowflake,
  Sun,
  Trophy,
  Users,
  Video,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import type { RootState } from '@/stores/store'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { formatAppDateTime } from '@/lib/date-format'
import { cn } from '@/lib/utils'
import {
  useAdminAcknowledgeLeadsMutation,
  useAdminAddLeadActivityMutation,
  useAdminGetLeadQuery,
  useAdminSetLeadTouchpointMutation,
  useAdminSnoozeLeadMutation,
  useAdminUpdateLeadMutation,
  type LeadActivityInput,
  type LeadDetail,
  type LeadStage,
  type LeadTemperature,
  type Touchpoint,
} from '@/stores/admin-leads.api'
import { LoginAsDialog, type LoginAsTarget } from '../support/login-as-dialog'
import {
  DEFAULT_TEMPLATE_KEY,
  DUE_CLASS,
  LOST_REASONS,
  MESSAGE_TEMPLATES,
  OUTCOMES,
  STAGES,
  businessTypeLabel,
  dueState,
  followUpPresets,
  fromPktLocalInput,
  initials,
  mailLink,
  planLabel,
  relativeTime,
  stageMeta,
  subscriptionPill,
  telLink,
  templateFor,
  toPktLocalInput,
  toPlainText,
  whatsappLink,
} from './lead-utils'

type ActivityType = LeadActivityInput['type']

const ACTIVITY_TYPES: { key: ActivityType; label: string; icon: typeof Phone }[] = [
  { key: 'call', label: 'Call', icon: Phone },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'email', label: 'Email', icon: Mail },
  { key: 'meeting', label: 'Demo / Meeting', icon: Video },
  { key: 'note', label: 'Note', icon: NotebookPen },
]

const ACTIVITY_ICON: Record<string, typeof Phone> = {
  call: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  meeting: Video,
  note: NotebookPen,
  stage: Trophy,
  system: CalendarClock,
}

const TEMP_ICON: Record<LeadTemperature, typeof Flame> = { hot: Flame, warm: Sun, cold: Snowflake }
const TEMP_ACTIVE: Record<LeadTemperature, string> = {
  hot: 'border-red-300 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-300',
  warm: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300',
  cold: 'border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950/50 dark:text-sky-300',
}

const CHANNEL_ICON = { call: Phone, whatsapp: MessageCircle, email: Mail } as const

function touchpointState(t: Touchpoint, now: number) {
  if (t.doneAt) return 'done'
  if (t.skippedAt) return 'skipped'
  return dueState(t.dueAt, now)
}

const errMsg = (e: unknown, fallback: string) =>
  (e as { data?: { message?: string } })?.data?.message ?? fallback

// ── WhatsApp / email composer ─────────────────────────────────────────────────────────

function MessageComposer({
  lead,
  open,
  onOpenChange,
  initialTemplate,
  touchpointKey,
  channel,
}: {
  lead: LeadDetail
  open: boolean
  onOpenChange: (v: boolean) => void
  initialTemplate?: string
  touchpointKey?: string | null
  channel: 'whatsapp' | 'email'
}) {
  const me = useSelector((s: RootState) => s.auth.data?.user) as { name?: string } | undefined
  const [templateKey, setTemplateKey] = useState(initialTemplate ?? DEFAULT_TEMPLATE_KEY)
  const [text, setText] = useState('')
  const [logIt, setLogIt] = useState(true)
  const [addActivity, { isLoading }] = useAdminAddLeadActivityMutation()
  const org = lead.organization

  const build = (key: string) =>
    templateFor(key).build({
      ownerName: org.owner?.name,
      businessName: org.name,
      businessType: org.businessType,
      daysLeft: org.subscription.daysRemaining,
      senderName: me?.name,
    })

  useEffect(() => {
    if (!open) return
    const key = initialTemplate ?? DEFAULT_TEMPLATE_KEY
    setTemplateKey(key)
    setText(build(key))
    setLogIt(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialTemplate])

  const email = org.owner?.email || org.email
  const href =
    channel === 'whatsapp'
      ? whatsappLink(org.phone, text)
      : mailLink(email, `Your Logix Plus trial — ${org.name}`, toPlainText(text))

  const send = async () => {
    if (!href) return
    window.open(href, '_blank', 'noopener,noreferrer')
    if (logIt) {
      try {
        await addActivity({
          orgId: lead.organizationId,
          body: {
            type: channel,
            outcome: 'reached',
            text: `${templateFor(templateKey).label} message sent:\n${text}`,
            completeTouchpoint: touchpointKey ?? null,
          },
        }).unwrap()
        toast.success(touchpointKey ? 'Message logged and step marked done' : 'Message logged')
      } catch (e) {
        toast.error(errMsg(e, 'Could not log the message'))
      }
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-lg'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            {channel === 'whatsapp' ? <MessageCircle className='size-5 text-emerald-600' /> : <Mail className='size-5' />}
            {channel === 'whatsapp' ? 'WhatsApp' : 'Email'} {org.owner?.name ?? org.name}
          </DialogTitle>
          <DialogDescription>
            {channel === 'whatsapp' ? (org.phone || 'No phone number on this account') : (email || 'No email on this account')}
            {' · '}Pick a template, edit it, then send.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='flex flex-wrap gap-1.5'>
            {MESSAGE_TEMPLATES.map((t) => (
              <button
                key={t.key}
                type='button'
                onClick={() => { setTemplateKey(t.key); setText(build(t.key)) }}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs transition-colors',
                  templateKey === t.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={9} className='text-sm' />
          <label className='flex items-center gap-2 text-sm'>
            <input type='checkbox' checked={logIt} onChange={(e) => setLogIt(e.target.checked)} className='size-4 accent-primary' />
            Log it in the timeline{touchpointKey ? ' and mark this follow-up step done' : ''}
          </label>
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={send} disabled={!href || isLoading} className={channel === 'whatsapp' ? 'bg-emerald-600 text-white hover:bg-emerald-700' : ''}>
            {isLoading ? <Loader2 className='mr-2 size-4 animate-spin' /> : channel === 'whatsapp' ? <MessageCircle className='mr-2 size-4' /> : <Mail className='mr-2 size-4' />}
            Open {channel === 'whatsapp' ? 'WhatsApp' : 'email'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// ── Follow-up scheduler (shared by the "next follow-up" card and the log form) ──────────

function FollowUpPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const presets = useMemo(() => followUpPresets(), [])
  return (
    <div className='space-y-2'>
      <div className='flex flex-wrap gap-1.5'>
        {presets.map((p) => {
          const v = toPktLocalInput(p.date)
          return (
            <button
              key={p.label}
              type='button'
              onClick={() => onChange(value === v ? '' : v)}
              className={cn('rounded-full border px-2.5 py-1 text-xs', value === v ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {p.label}
            </button>
          )
        })}
      </div>
      <Input type='datetime-local' value={value} onChange={(e) => onChange(e.target.value)} className='h-9' />
    </div>
  )
}

// ── Sheet ──────────────────────────────────────────────────────────────────────────────

export function LeadSheet({ orgId, onOpenChange }: { orgId: string | null; onOpenChange: (open: boolean) => void }) {
  const { data: lead, isLoading, isFetching } = useAdminGetLeadQuery(orgId ?? '', { skip: !orgId })
  const [updateLead, { isLoading: isUpdating }] = useAdminUpdateLeadMutation()
  const [addActivity, { isLoading: isLogging }] = useAdminAddLeadActivityMutation()
  const [setTouchpoint] = useAdminSetLeadTouchpointMutation()
  const [snooze] = useAdminSnoozeLeadMutation()
  const [acknowledge] = useAdminAcknowledgeLeadsMutation()

  const [composer, setComposer] = useState<{ channel: 'whatsapp' | 'email'; template?: string; touchpoint?: string | null } | null>(null)
  const [lostOpen, setLostOpen] = useState(false)
  const [lostReason, setLostReason] = useState('')
  const [loginAs, setLoginAs] = useState<LoginAsTarget | null>(null)
  const [rescheduleOpen, setRescheduleOpen] = useState(false)
  const [rescheduleAt, setRescheduleAt] = useState('')
  const [rescheduleNote, setRescheduleNote] = useState('')

  // Log-activity form
  const [actType, setActType] = useState<ActivityType>('call')
  const [outcome, setOutcome] = useState<string>('reached')
  const [notes, setNotes] = useState('')
  const [completeStep, setCompleteStep] = useState<string>('none')
  const [nextAt, setNextAt] = useState('')
  const [nextNote, setNextNote] = useState('')

  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])

  const openStep = useMemo(
    () => lead?.playbook.filter((t) => !t.doneAt && !t.skippedAt).sort((a, b) => +new Date(a.dueAt) - +new Date(b.dueAt))[0],
    [lead?.playbook],
  )

  // Reset the form whenever another lead opens; pre-select the step being worked on.
  useEffect(() => {
    setActType('call')
    setOutcome('reached')
    setNotes('')
    setNextAt('')
    setNextNote('')
    setCompleteStep('none')
  }, [orgId])
  useEffect(() => {
    setCompleteStep(openStep && dueState(openStep.dueAt) !== 'upcoming' ? openStep.key : 'none')
  }, [openStep])

  // Opening the lead counts as seeing its "new signup" alert.
  useEffect(() => {
    if (lead?.isNew && orgId) acknowledge({ organizationIds: [orgId] }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead?.isNew, orgId])

  const org = lead?.organization
  const pill = subscriptionPill(org?.subscription)
  const due = dueState(lead?.nextFollowUpAt, now)

  const changeStage = async (stage: LeadStage) => {
    if (!orgId || !lead || stage === lead.stage) return
    if (stage === 'lost') {
      setLostReason(lead.lostReason || '')
      setLostOpen(true)
      return
    }
    try {
      await updateLead({ orgId, body: { stage } }).unwrap()
      toast.success(`Moved to ${stageMeta(stage).label}`)
    } catch (e) {
      toast.error(errMsg(e, 'Could not change stage'))
    }
  }

  const confirmLost = async () => {
    if (!orgId) return
    try {
      await updateLead({ orgId, body: { stage: 'lost', lostReason } }).unwrap()
      toast.success('Marked as lost')
      setLostOpen(false)
    } catch (e) {
      toast.error(errMsg(e, 'Could not update'))
    }
  }

  const setTemp = async (temperature: LeadTemperature) => {
    if (!orgId) return
    try {
      await updateLead({ orgId, body: { temperature } }).unwrap()
    } catch (e) {
      toast.error(errMsg(e, 'Could not update'))
    }
  }

  const doSnooze = async (minutes: number, label: string) => {
    if (!orgId) return
    try {
      await snooze({ orgId, minutes }).unwrap()
      toast.success(`Follow-up moved ${label}`)
    } catch (e) {
      toast.error(errMsg(e, 'Could not snooze'))
    }
  }

  const saveReschedule = async () => {
    if (!orgId) return
    const iso = fromPktLocalInput(rescheduleAt)
    if (!iso) return toast.error('Pick a date and time')
    try {
      await updateLead({ orgId, body: { nextFollowUpAt: iso, nextFollowUpNote: rescheduleNote } }).unwrap()
      toast.success('Follow-up scheduled')
      setRescheduleOpen(false)
    } catch (e) {
      toast.error(errMsg(e, 'Could not schedule'))
    }
  }

  const backToPlan = async () => {
    if (!orgId) return
    try {
      await updateLead({ orgId, body: { nextFollowUpAt: null } }).unwrap()
    } catch (e) {
      toast.error(errMsg(e, 'Could not update'))
    }
  }

  const step = async (key: string, action: 'done' | 'skip' | 'reopen') => {
    if (!orgId) return
    try {
      await setTouchpoint({ orgId, key, action }).unwrap()
    } catch (e) {
      toast.error(errMsg(e, 'Could not update the step'))
    }
  }

  const logActivity = async () => {
    if (!orgId) return
    if (actType === 'note' && !notes.trim()) return toast.error('Write the note first')
    const nextIso = nextAt ? fromPktLocalInput(nextAt) : null
    if (nextAt && !nextIso) return toast.error('Next follow-up time is not valid')
    try {
      await addActivity({
        orgId,
        body: {
          type: actType,
          outcome: actType === 'note' ? null : outcome,
          text: notes.trim(),
          completeTouchpoint: completeStep === 'none' ? null : completeStep,
          nextFollowUpAt: nextIso,
          nextFollowUpNote: nextNote.trim(),
        },
      }).unwrap()
      toast.success('Activity logged')
      setNotes('')
      setNextAt('')
      setNextNote('')
    } catch (e) {
      toast.error(errMsg(e, 'Could not log the activity'))
    }
  }

  const copy = (v: string) => {
    navigator.clipboard?.writeText(v).then(() => toast.success('Copied'), () => {})
  }

  const meta = stageMeta(lead?.stage)

  return (
    <>
      <Sheet open={!!orgId} onOpenChange={onOpenChange}>
        <SheetContent className='w-full gap-0 overflow-y-auto p-0 sm:max-w-xl'>
          {isLoading || !lead || !org ? (
            <div className='space-y-4 p-6'>
              <SheetHeader className='sr-only'>
                <SheetTitle>Lead</SheetTitle>
                <SheetDescription>Loading lead</SheetDescription>
              </SheetHeader>
              <Skeleton className='h-12 w-2/3' />
              <Skeleton className='h-24' />
              <Skeleton className='h-48' />
            </div>
          ) : (
            <>
              {/* Header */}
              <SheetHeader className='space-y-3 border-b bg-muted/30 p-5 pr-12'>
                <div className='flex items-start gap-3'>
                  <div className='flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-sm font-semibold text-primary'>
                    {initials(org.name)}
                  </div>
                  <div className='min-w-0'>
                    <SheetTitle className='flex flex-wrap items-center gap-2 text-left text-lg leading-tight'>
                      <span className='break-words'>{org.name}</span>
                      {lead.isNew && <Badge className='bg-sky-600 text-[10px] text-white'>NEW SIGNUP</Badge>}
                      {isFetching && <Loader2 className='size-3.5 animate-spin text-muted-foreground' />}
                    </SheetTitle>
                    <SheetDescription className='text-left'>
                      {businessTypeLabel(org.businessType)}
                      {org.city ? ` · ${org.city}` : ''} · signed up {relativeTime(org.createdAt, now)}
                    </SheetDescription>
                  </div>
                </div>

                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant='outline' className={cn('font-medium', pill.className)}>{pill.label}</Badge>
                  <Badge variant='outline'>{planLabel(org.subscription.planKey)}</Badge>
                  <div className='ml-auto flex items-center gap-1'>
                    {(['hot', 'warm', 'cold'] as LeadTemperature[]).map((t) => {
                      const Icon = TEMP_ICON[t]
                      return (
                        <button
                          key={t}
                          type='button'
                          onClick={() => setTemp(t)}
                          title={`Mark ${t}`}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs capitalize',
                            lead.temperature === t ? TEMP_ACTIVE[t] : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          <Icon className='size-3' /> {t}
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Stage stepper */}
                <div className='-mx-1 flex gap-1 overflow-x-auto px-1 pb-0.5'>
                  {STAGES.map((s) => {
                    const active = lead.stage === s.key
                    return (
                      <button
                        key={s.key}
                        type='button'
                        disabled={isUpdating}
                        onClick={() => changeStage(s.key)}
                        title={s.hint}
                        className={cn(
                          'inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                          active ? s.chip : 'text-muted-foreground hover:bg-muted',
                        )}
                      >
                        <span className={cn('size-1.5 rounded-full', active ? s.dot : 'bg-muted-foreground/40')} />
                        {s.label}
                      </button>
                    )
                  })}
                </div>
                {lead.stage === 'lost' && lead.lostReason && (
                  <p className='text-xs text-muted-foreground'>Lost reason: {lead.lostReason}</p>
                )}
              </SheetHeader>

              <div className='space-y-5 p-5'>
                {/* Contact */}
                <section className='grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2'>
                  <div className='min-w-0 space-y-1 text-sm'>
                    <p className='font-medium'>{org.owner?.name ?? 'Owner'}</p>
                    {org.phone && (
                      <button type='button' onClick={() => copy(org.phone)} className='flex items-center gap-1 text-muted-foreground hover:text-foreground'>
                        <Phone className='size-3' /> {org.phone} <Copy className='size-3 opacity-60' />
                      </button>
                    )}
                    {org.owner && (
                      <button
                        type='button'
                        onClick={() => setLoginAs({ id: org.owner!.id, name: org.owner!.name, email: org.owner!.email, organizationName: org.name })}
                        className='flex items-center gap-1 text-primary hover:underline'
                      >
                        <LogIn className='size-3' /> Login as owner (support)
                      </button>
                    )}
                    {(org.owner?.email || org.email) && (
                      <button type='button' onClick={() => copy(org.owner?.email || org.email)} className='flex max-w-full items-center gap-1 text-muted-foreground hover:text-foreground'>
                        <Mail className='size-3 shrink-0' /> <span className='truncate'>{org.owner?.email || org.email}</span>
                      </button>
                    )}
                  </div>
                  <div className='grid grid-cols-3 gap-2 self-center'>
                    <Button asChild={!!telLink(org.phone)} variant='outline' size='sm' disabled={!org.phone}>
                      {telLink(org.phone) ? <a href={telLink(org.phone)!}><Phone className='mr-1 size-3.5' /> Call</a> : <span><Phone className='mr-1 size-3.5' /> Call</span>}
                    </Button>
                    <Button
                      size='sm'
                      className='bg-emerald-600 text-white hover:bg-emerald-700'
                      disabled={!org.phone}
                      onClick={() => setComposer({ channel: 'whatsapp', template: DEFAULT_TEMPLATE_KEY, touchpoint: null })}
                    >
                      <MessageCircle className='mr-1 size-3.5' /> Chat
                    </Button>
                    <Button
                      variant='outline'
                      size='sm'
                      disabled={!(org.owner?.email || org.email)}
                      onClick={() => setComposer({ channel: 'email', template: DEFAULT_TEMPLATE_KEY, touchpoint: null })}
                    >
                      <Mail className='mr-1 size-3.5' /> Email
                    </Button>
                  </div>
                </section>

                {/* Next follow-up */}
                <section
                  className={cn(
                    'rounded-lg border p-3',
                    (due === 'overdue' || due === 'now') && 'border-orange-300 bg-orange-50/60 dark:border-orange-900 dark:bg-orange-950/20',
                  )}
                >
                  <div className='flex flex-wrap items-start justify-between gap-2'>
                    <div className='min-w-0'>
                      <p className='flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                        <AlarmClock className='size-3.5' /> Next follow-up
                      </p>
                      {lead.nextFollowUpAt ? (
                        <>
                          <p className={cn('mt-0.5 font-semibold', DUE_CLASS[due])}>
                            {due === 'overdue' || due === 'now' ? `Due ${relativeTime(lead.nextFollowUpAt, now)}` : relativeTime(lead.nextFollowUpAt, now)}
                            <span className='ml-1.5 text-xs font-normal text-muted-foreground'>{formatAppDateTime(new Date(lead.nextFollowUpAt))}</span>
                          </p>
                          <p className='text-sm text-muted-foreground'>
                            {lead.nextFollowUpNote || 'Follow up'}
                            {lead.manualFollowUp ? ' · set by you' : ' · from the follow-up plan'}
                          </p>
                        </>
                      ) : (
                        <p className='mt-0.5 text-sm text-muted-foreground'>
                          {lead.stage === 'won' || lead.stage === 'lost' ? 'Closed — no follow-up needed.' : 'Nothing scheduled.'}
                        </p>
                      )}
                    </div>
                    <div className='flex flex-wrap gap-1'>
                      {lead.nextFollowUpAt && (
                        <>
                          <Button size='sm' variant='outline' className='h-7 px-2 text-xs' onClick={() => doSnooze(60, '1 hour later')}>+1h</Button>
                          <Button size='sm' variant='outline' className='h-7 px-2 text-xs' onClick={() => doSnooze(24 * 60, 'to tomorrow')}>Tomorrow</Button>
                        </>
                      )}
                      <Button
                        size='sm'
                        variant='outline'
                        className='h-7 px-2 text-xs'
                        onClick={() => {
                          setRescheduleAt(lead.nextFollowUpAt ? toPktLocalInput(new Date(lead.nextFollowUpAt)) : '')
                          setRescheduleNote(lead.manualFollowUp ? lead.nextFollowUpNote : '')
                          setRescheduleOpen(true)
                        }}
                      >
                        <CalendarClock className='mr-1 size-3' /> Schedule
                      </Button>
                      {lead.manualFollowUp && (
                        <Button size='sm' variant='ghost' className='h-7 px-2 text-xs' onClick={backToPlan} title='Use the follow-up plan again'>
                          <RotateCcw className='size-3' />
                        </Button>
                      )}
                    </div>
                  </div>
                </section>

                {/* Trial health */}
                <section>
                  <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Trial activity</h4>
                  <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                    {[
                      { label: 'Products', value: lead.usage.products },
                      { label: 'Invoices', value: lead.usage.invoices },
                      { label: 'Users', value: lead.usage.users },
                      { label: 'Branches', value: lead.usage.branches },
                    ].map((s) => (
                      <div key={s.label} className='rounded-lg border px-3 py-2'>
                        <p className='text-lg font-semibold tabular-nums'>{s.value.toLocaleString()}</p>
                        <p className='text-[11px] text-muted-foreground'>{s.label}</p>
                      </div>
                    ))}
                  </div>
                  <p className='mt-2 text-xs text-muted-foreground'>
                    {lead.usage.invoices === 0
                      ? 'No real sale yet (sample data excluded) — they may need setup help.'
                      : `Last real invoice ${relativeTime(lead.usage.lastInvoiceAt, now)}.`}
                    {lead.usage.ownerLastSeenAt ? ` Owner last seen ${relativeTime(lead.usage.ownerLastSeenAt, now)}.` : ''}
                    {lead.lastContactedAt ? ` You last contacted them ${relativeTime(lead.lastContactedAt, now)}.` : ' Not contacted yet.'}
                  </p>
                </section>

                {/* Playbook */}
                {lead.playbook.length > 0 && (
                  <section>
                    <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Follow-up plan</h4>
                    <ol className='relative space-y-0'>
                      {lead.playbook.map((t, i) => {
                        const st = touchpointState(t, now)
                        const Icon = CHANNEL_ICON[t.channel] ?? Phone
                        const isOpen = st !== 'done' && st !== 'skipped'
                        return (
                          <li key={t.key} className='relative flex gap-3 pb-4 last:pb-0'>
                            {i < lead.playbook.length - 1 && <span className='absolute left-[11px] top-6 h-[calc(100%-1.25rem)] w-px bg-border' />}
                            <span className='relative z-10 mt-0.5 shrink-0 bg-background'>
                              {st === 'done' ? (
                                <CheckCircle2 className='size-6 text-emerald-600' />
                              ) : st === 'skipped' ? (
                                <SkipForward className='size-6 p-0.5 text-muted-foreground' />
                              ) : (
                                <Circle className={cn('size-6', st === 'overdue' || st === 'now' ? 'text-orange-500' : 'text-muted-foreground/50')} />
                              )}
                            </span>
                            <div className='min-w-0 flex-1'>
                              <div className='flex flex-wrap items-center gap-x-2'>
                                <p className={cn('text-sm font-medium', !isOpen && 'text-muted-foreground line-through decoration-muted-foreground/40')}>
                                  Day {t.day} · {t.title}
                                </p>
                                <Icon className='size-3 text-muted-foreground' />
                                <span className={cn('text-xs', isOpen ? DUE_CLASS[st as keyof typeof DUE_CLASS] : 'text-muted-foreground')}>
                                  {st === 'done' ? `done ${relativeTime(t.doneAt, now)}` : st === 'skipped' ? 'skipped' : relativeTime(t.dueAt, now)}
                                </span>
                              </div>
                              {isOpen && <p className='text-xs text-muted-foreground'>{t.goal}</p>}
                              <div className='mt-1 flex flex-wrap gap-1'>
                                {isOpen ? (
                                  <>
                                    {t.channel === 'whatsapp' && org.phone && (
                                      <Button size='sm' variant='outline' className='h-6 px-2 text-[11px]' onClick={() => setComposer({ channel: 'whatsapp', template: t.key, touchpoint: t.key })}>
                                        <MessageCircle className='mr-1 size-3 text-emerald-600' /> Send message
                                      </Button>
                                    )}
                                    {t.channel === 'call' && telLink(org.phone) && (
                                      <Button asChild size='sm' variant='outline' className='h-6 px-2 text-[11px]'>
                                        <a href={telLink(org.phone)!}><Phone className='mr-1 size-3' /> Call</a>
                                      </Button>
                                    )}
                                    <Button size='sm' variant='ghost' className='h-6 px-2 text-[11px]' onClick={() => step(t.key, 'done')}>
                                      <Check className='mr-1 size-3' /> Done
                                    </Button>
                                    <Button size='sm' variant='ghost' className='h-6 px-2 text-[11px] text-muted-foreground' onClick={() => step(t.key, 'skip')}>
                                      Skip
                                    </Button>
                                  </>
                                ) : (
                                  <Button size='sm' variant='ghost' className='h-6 px-2 text-[11px] text-muted-foreground' onClick={() => step(t.key, 'reopen')}>
                                    <RotateCcw className='mr-1 size-3' /> Reopen
                                  </Button>
                                )}
                              </div>
                            </div>
                          </li>
                        )
                      })}
                    </ol>
                  </section>
                )}

                {/* Log activity */}
                <section className='space-y-3 rounded-lg border p-3'>
                  <h4 className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>Log what happened</h4>
                  <div className='flex flex-wrap gap-1.5'>
                    {ACTIVITY_TYPES.map((a) => (
                      <button
                        key={a.key}
                        type='button'
                        onClick={() => setActType(a.key)}
                        className={cn(
                          'inline-flex items-center gap-1 rounded-md border px-2.5 py-1 text-xs',
                          actType === a.key ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                        )}
                      >
                        <a.icon className='size-3' /> {a.label}
                      </button>
                    ))}
                  </div>
                  {actType !== 'note' && (
                    <div className='flex flex-wrap gap-1.5'>
                      {OUTCOMES.map((o) => (
                        <button
                          key={o.key}
                          type='button'
                          onClick={() => setOutcome(o.key)}
                          className={cn(
                            'rounded-full border px-2.5 py-0.5 text-xs',
                            outcome === o.key ? 'border-foreground/60 bg-foreground/5 font-medium' : 'text-muted-foreground hover:bg-muted',
                          )}
                        >
                          {o.label}
                        </button>
                      ))}
                    </div>
                  )}
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    placeholder={actType === 'note' ? 'Write a note…' : 'What did they say? Needs, objections, promises…'}
                  />
                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <div className='space-y-1.5'>
                      <Label className='text-xs'>Completes plan step</Label>
                      <Select value={completeStep} onValueChange={setCompleteStep}>
                        <SelectTrigger className='h-9'><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value='none'>— None —</SelectItem>
                          {lead.playbook.filter((t) => !t.doneAt).map((t) => (
                            <SelectItem key={t.key} value={t.key}>Day {t.day} · {t.title}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className='space-y-1.5'>
                      <Label className='text-xs'>Next follow-up note</Label>
                      <Input value={nextNote} onChange={(e) => setNextNote(e.target.value)} placeholder='e.g. Call back after Jumma' className='h-9' />
                    </div>
                  </div>
                  <div className='space-y-1.5'>
                    <Label className='text-xs'>Schedule next follow-up (optional)</Label>
                    <FollowUpPicker value={nextAt} onChange={setNextAt} />
                  </div>
                  <div className='flex justify-end'>
                    <Button onClick={logActivity} disabled={isLogging}>
                      {isLogging && <Loader2 className='mr-2 size-4 animate-spin' />}
                      Save activity
                    </Button>
                  </div>
                </section>

                {/* Timeline */}
                <section>
                  <h4 className='mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground'>Timeline</h4>
                  {lead.activities.length === 0 ? (
                    <p className='text-sm text-muted-foreground'>Nothing logged yet.</p>
                  ) : (
                    <ul className='space-y-3'>
                      {lead.activities.map((a) => {
                        const Icon = ACTIVITY_ICON[a.type] ?? NotebookPen
                        const outcomeLabel = OUTCOMES.find((o) => o.key === a.outcome)?.label
                        return (
                          <li key={a.id} className='flex gap-3'>
                            <span className='mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted'>
                              <Icon className='size-3.5 text-muted-foreground' />
                            </span>
                            <div className='min-w-0 flex-1'>
                              <p className='text-xs text-muted-foreground'>
                                <span className='font-medium capitalize text-foreground'>{a.type === 'system' ? 'Update' : a.type === 'stage' ? 'Stage' : a.type}</span>
                                {outcomeLabel ? ` · ${outcomeLabel}` : ''}
                                {a.byName ? ` · ${a.byName}` : ''} · <span title={formatAppDateTime(new Date(a.at))}>{relativeTime(a.at, now)}</span>
                              </p>
                              {a.text && <p className='whitespace-pre-wrap break-words text-sm'>{a.text}</p>}
                            </div>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <p className='flex items-center gap-1.5 pb-2 text-[11px] text-muted-foreground'>
                  <Users className='size-3' /> Stage: <span className={cn('size-1.5 rounded-full', meta.dot)} /> {meta.label} ·{' '}
                  {lead.source === 'self_signup' ? 'Self signup' : 'Existing account'}
                  {lead.wonAt && <> · <Trophy className='size-3 text-emerald-600' /> Won {relativeTime(lead.wonAt, now)}</>}
                  {lead.lostAt && <> · <XCircle className='size-3' /> Lost {relativeTime(lead.lostAt, now)}</>}
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {lead && composer && (
        <MessageComposer
          lead={lead}
          open={!!composer}
          onOpenChange={(v) => !v && setComposer(null)}
          channel={composer.channel}
          initialTemplate={composer.template}
          touchpointKey={composer.touchpoint}
        />
      )}

      <LoginAsDialog target={loginAs} onOpenChange={(open) => !open && setLoginAs(null)} />

      {/* Lost reason */}
      <Dialog open={lostOpen} onOpenChange={setLostOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Why was this lead lost?</DialogTitle>
            <DialogDescription>Knowing the reason shows what to fix in the product or the pitch.</DialogDescription>
          </DialogHeader>
          <div className='flex flex-wrap gap-1.5'>
            {LOST_REASONS.map((r) => (
              <button
                key={r}
                type='button'
                onClick={() => setLostReason(r)}
                className={cn('rounded-full border px-2.5 py-1 text-xs', lostReason === r ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted')}
              >
                {r}
              </button>
            ))}
          </div>
          <Input value={lostReason} onChange={(e) => setLostReason(e.target.value)} placeholder='Or type a reason' />
          <DialogFooter>
            <Button variant='outline' onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant='destructive' onClick={confirmLost} disabled={isUpdating}>Mark as lost</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reschedule */}
      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent className='max-w-md'>
          <DialogHeader>
            <DialogTitle>Schedule follow-up</DialogTitle>
            <DialogDescription>You'll get an alarm in the app (and a push notification if enabled) at this time — Pakistan time.</DialogDescription>
          </DialogHeader>
          <FollowUpPicker value={rescheduleAt} onChange={setRescheduleAt} />
          <Input value={rescheduleNote} onChange={(e) => setRescheduleNote(e.target.value)} placeholder='What to do, e.g. Share pricing' />
          <DialogFooter>
            <Button variant='outline' onClick={() => setRescheduleOpen(false)}>Cancel</Button>
            <Button onClick={saveReschedule} disabled={isUpdating || !rescheduleAt}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

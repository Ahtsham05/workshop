import { useEffect, useRef, useState } from 'react'
import {
  AlertTriangle,
  Ban,
  Boxes,
  ChevronDown,
  Eye,
  EyeOff,
  Lock,
  MessageSquarePlus,
  MoreHorizontal,
  Pencil,
  Plus,
  Printer,
  Save,
  RotateCcw,
  ShieldCheck,
  Tag,
  Trash2,
  Undo2,
  Wallet,
  X,
  XCircle,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import { toast } from 'sonner'
import {
  useAddRepairNoteMutation,
  useChangeRepairStatusMutation,
  useDeleteRepairJobMutation,
  useGetRepairJobQuery,
  useRemoveRepairPaymentMutation,
  useUpdateRepairJobMutation,
  type RepairJobRecord,
  type RepairPriority,
  type RepairStatus,
} from '@/stores/mobile-shop.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import {
  getBusinessTimeZone,
  formatBusinessDate,
  parseBusinessDateTimeLocal,
} from '@/lib/business-timezone'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { buildMobileShopReceiptMessage } from '@/utils/sms-messages'
import { useWhatsAppOptional } from '@/context/whatsapp-context'
import { useBranchName } from '@/hooks/use-branch-name'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import {
  BOARD_STATUSES,
  SKIPPED_STATUSES,
  NEXT_STEP,
  PRIORITY_META,
  STATUS_META,
  balanceOf,
  deviceMeta,
  isOverdue,
  jobRef,
  salesmanLabel,
  statusMeta,
} from '../lib/repair-meta'
import { useBillDraft } from '../lib/use-bill-draft'
import { useRepairPrint } from '../lib/use-repair-print'
import { AddLineDialog, type LineMode } from './add-line-dialog'
import { BillLines } from './bill-lines'
import { PaymentDialog, type PaymentDialogMode } from './payment-dialog'
import { TechnicianPicker } from './technician-picker'

const errMsg = (e: unknown, fallback: string) =>
  (e as { data?: { message?: string } })?.data?.message || fallback

/** Customer-facing message for the job's current state. */
function customerMessage(
  job: RepairJobRecord,
  branchName: string | undefined,
  fmt: (n: number) => string
) {
  const balance = balanceOf(job)
  const device = [job.brand, job.deviceModel].filter(Boolean).join(' ')
  const lines: { label: string; value: string }[] = [
    { label: 'Job', value: jobRef(job) },
    { label: 'Status', value: statusMeta(job.status).label },
  ]
  if (job.status === 'waiting_approval')
    lines.push({ label: 'Estimate', value: fmt(job.charges ?? 0) })
  else lines.push({ label: 'Bill', value: fmt(job.charges ?? 0) })
  lines.push({ label: 'Balance', value: balance > 0 ? fmt(balance) : 'Paid' })
  if (job.status === 'completed')
    lines.push({
      label: 'Note',
      value: 'Your device is ready — please collect it.',
    })
  if (job.status === 'waiting_approval')
    lines.push({
      label: 'Note',
      value: 'Please reply YES to approve the repair.',
    })
  return buildMobileShopReceiptMessage({
    branchName,
    name: job.customerName,
    title: `${device} Repair`,
    lines,
  })
}

function StatusStepper({ status }: { status: RepairStatus }) {
  // Jobs start In repair; an older job still at Received / Diagnosing shows that step first.
  const early = status === 'pending' || status === 'diagnosing'
  const steps: RepairStatus[] = early
    ? [status, 'in_progress', 'completed', 'delivered']
    : ['in_progress', 'completed', 'delivered']
  if (status === 'cancelled') {
    return (
      <div className='flex items-center gap-2 rounded-md bg-rose-500/10 px-3 py-2 text-sm font-medium text-rose-700 dark:text-rose-300'>
        <Ban className='h-4 w-4' aria-hidden /> Cancelled
      </div>
    )
  }
  // Waiting for approval / parts sits on the In repair step.
  const at =
    status === 'waiting_approval' || status === 'waiting_parts'
      ? 0
      : Math.max(0, steps.indexOf(status))
  return (
    <ol className='flex items-center gap-1' aria-label='Progress'>
      {steps.map((s, i) => {
        const done = i < at || (i === at && s === 'delivered')
        const current = i === at && s !== 'delivered'
        const Icon = STATUS_META[s].icon
        return (
          <li key={s} className='flex min-w-0 flex-1 items-center gap-1'>
            <span
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs',
                done && 'border-primary bg-primary text-primary-foreground',
                current && 'border-primary text-primary ring-primary/30 ring-4',
                !done && !current && 'text-muted-foreground'
              )}
              title={STATUS_META[s].label}
              aria-current={current ? 'step' : undefined}
            >
              <Icon className='h-3.5 w-3.5' aria-hidden />
            </span>
            <span
              className={cn(
                'hidden truncate text-[11px] md:inline',
                current ? 'font-semibold' : 'text-muted-foreground'
              )}
            >
              {STATUS_META[s].short}
            </span>
            {i < steps.length - 1 && (
              <span
                className={cn(
                  'h-px flex-1',
                  i < at ? 'bg-primary' : 'bg-border'
                )}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

function Field({
  label,
  value,
  mono,
}: {
  label: string
  value?: React.ReactNode
  mono?: boolean
}) {
  if (value == null || value === '' || (Array.isArray(value) && !value.length))
    return null
  return (
    <div className='min-w-0'>
      <dt className='text-muted-foreground text-xs'>{label}</dt>
      <dd className={cn('text-sm break-words', mono && 'font-mono')}>
        {value}
      </dd>
    </div>
  )
}

export function JobSheet({
  jobId,
  canManage,
  autoComplete: _autoComplete,
  onOpenChange,
}: {
  jobId: string | null
  canManage: boolean
  /** Open straight into the Complete repair step (e.g. a card dropped on Ready). */
  autoComplete?: boolean
  onOpenChange: (open: boolean) => void
}) {
  const wa = useWhatsAppOptional()
  const dispatch = useDispatch()
  const currencyMeta = useCurrencyMeta()
  const fmt = (n?: number) => formatMoneyWithMeta(n ?? 0, currencyMeta)
  const branchName = useBranchName()
  const { printReceipt, printTag } = useRepairPrint()
  const {
    data: job,
    isFetching,
    isError,
  } = useGetRepairJobQuery(jobId!, { skip: !jobId })
  // The bill is edited as a draft and saved in one request (invoice style).
  const draft = useBillDraft(job)
  const [leaveOpen, setLeaveOpen] = useState(false)
  /** Saves pending bill lines before anything that depends on the bill. */
  const ensureSaved = async () => (draft.dirty ? !!(await draft.save()) : true)
  // Ctrl+S saves the bill from anywhere while the job is open — focus may have left the
  // panel (Enter in a cell blurs it), and the browser's own "Save page" must not open.
  const draftRef = useRef(draft)
  draftRef.current = draft
  useEffect(() => {
    if (!jobId) return
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 's') return
      e.preventDefault()
      const d = draftRef.current
      if (d.dirty && !d.saving)
        void d.save().then((saved) => saved && toast.success('Bill saved'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jobId])
  const requestClose = (o: boolean) => {
    if (!o && draft.dirty) return setLeaveOpen(true)
    onOpenChange(o)
  }

  const [tab, setTab] = useState('bill')
  const [lineMode, setLineMode] = useState<LineMode | null>(null)
  const [payMode, setPayMode] = useState<PaymentDialogMode | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [showLock, setShowLock] = useState(false)
  const [note, setNote] = useState('')
  const [diagnosis, setDiagnosis] = useState('')

  const [changeStatus, { isLoading: moving }] = useChangeRepairStatusMutation()
  const [updateJob] = useUpdateRepairJobMutation()
  const [removePayment] = useRemoveRepairPaymentMutation()
  const [addNote, { isLoading: noting }] = useAddRepairNoteMutation()
  const [deleteJob, { isLoading: deleting }] = useDeleteRepairJobMutation()

  useEffect(() => {
    setShowLock(false)
    setTab('bill')
  }, [jobId])
  useEffect(() => {
    setDiagnosis(job?.diagnosis ?? '')
  }, [job?.id, job?.diagnosis])

  const refreshStock = () =>
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))

  const move = async (
    status: RepairStatus,
    extra: Record<string, unknown> = {}
  ) => {
    if (!job) return
    if (!(await ensureSaved())) return
    try {
      const updated = await changeStatus({
        id: job.id,
        status,
        ...extra,
      }).unwrap()
      toast.success(`${jobRef(updated)} → ${statusMeta(status).label}`)
      if (status === 'cancelled') refreshStock()
      return updated
    } catch (e) {
      toast.error(errMsg(e, 'Could not change status'))
    }
  }

  /** Opens the "ready for pickup" WhatsApp message for the customer. */
  const notifyCustomer = (j: RepairJobRecord) => {
    if (!j.phone) return
    const text = customerMessage(j, branchName, fmt)
    if (wa?.isReady) {
      wa.openComposeDialog({
        phone: j.phone,
        name: j.customerName,
        defaultMessage: text,
        templateCategory: 'repair_receipt',
        templateParams: [
          j.customerName,
          j.deviceModel,
          statusMeta(j.status).label,
          String(Math.max(0, balanceOf(j))),
        ],
      })
    } else {
      window.open(
        `https://wa.me/${j.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`,
        '_blank',
        'noopener,noreferrer'
      )
    }
  }

  /** Saves the bill and marks the job ready — no dialog; WhatsApp is offered on the toast. */
  const markReady = async (
    outcome: 'repaired' | 'not_repairable' = 'repaired'
  ) => {
    if (!job) return
    if (!(await ensureSaved())) return
    try {
      const updated = await changeStatus({
        id: job.id,
        status: 'completed',
        outcome,
      }).unwrap()
      toast.success(
        `${jobRef(updated)} is ready for pickup${outcome === 'not_repairable' ? ' (not repairable)' : ''}`,
        updated.phone
          ? {
              action: {
                label: 'Send WhatsApp',
                onClick: () => notifyCustomer(updated),
              },
              duration: 8000,
            }
          : undefined
      )
    } catch (e) {
      toast.error(errMsg(e, 'Could not mark ready'))
    }
  }

  const patch = async (
    body: Partial<RepairJobRecord> & Record<string, unknown>,
    ok = 'Saved'
  ) => {
    if (!job) return
    try {
      await updateJob({ id: job.id, body: body as never }).unwrap()
      toast.success(ok)
    } catch (e) {
      toast.error(errMsg(e, 'Could not save'))
    }
  }

  const open = !!jobId
  const device = deviceMeta(job?.deviceType)
  const DeviceIcon = device.icon
  // While the bill has unsaved lines, the strip shows what it will be once saved.
  const shownCharges = job
    ? draft.dirty
      ? draft.totals.charges
      : (job.charges ?? 0)
    : 0
  const balance = job
    ? Math.round((shownCharges - (job.advanceAmount ?? 0)) * 100) / 100
    : 0
  const closed = job?.status === 'delivered' || job?.status === 'cancelled'
  const next = job ? NEXT_STEP[job.status] : undefined
  const items = job?.items ?? []
  const payments = job?.payments ?? []

  return (
    <Sheet open={open} onOpenChange={requestClose}>
      <SheetContent
        side='right'
        showCloseButton={false}
        // Esc inside the bill's entry row clears that row; it must not close the job.
        onEscapeKeyDown={(e) => {
          const el = document.activeElement as HTMLInputElement | null
          if (el?.dataset.be === 'search' && el.value) e.preventDefault()
        }}
        className='w-full gap-0 overflow-y-auto p-0 sm:max-w-2xl'
      >
        {!job ? (
          <div className='space-y-3 p-6'>
            <SheetHeader className='p-0'>
              <SheetTitle>
                {isError ? 'Job not found' : 'Loading job…'}
              </SheetTitle>
              <SheetDescription className='sr-only'>
                Repair job details
              </SheetDescription>
            </SheetHeader>
            {!isError && (
              <>
                <Skeleton className='h-8 w-1/2' />
                <Skeleton className='h-24 w-full' />
                <Skeleton className='h-48 w-full' />
              </>
            )}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className='bg-primary text-primary-foreground space-y-3 px-4 py-4 sm:px-6'>
              <div className='flex items-start justify-between gap-3'>
                <SheetHeader className='min-w-0 gap-1 p-0'>
                  <div className='flex flex-wrap items-center gap-2'>
                    <SheetTitle className='text-primary-foreground font-mono text-lg'>
                      {jobRef(job)}
                    </SheetTitle>
                    <span
                      className={cn(
                        'rounded-full px-2 py-0.5 text-xs font-medium',
                        statusMeta(job.status).pill
                      )}
                    >
                      {statusMeta(job.status).label}
                    </span>
                    {job.priority && job.priority !== 'normal' && (
                      <span
                        className={cn(
                          'rounded-full px-2 py-0.5 text-xs font-medium',
                          PRIORITY_META[job.priority].pill
                        )}
                      >
                        {PRIORITY_META[job.priority].label}
                      </span>
                    )}
                    {isOverdue(job) && (
                      <span className='inline-flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-xs font-medium text-white'>
                        <AlertTriangle className='h-3 w-3' aria-hidden />{' '}
                        Overdue
                      </span>
                    )}
                    {isFetching && (
                      <span className='text-primary-foreground/60 text-xs'>
                        updating…
                      </span>
                    )}
                  </div>
                  <SheetDescription className='text-primary-foreground/80 flex flex-wrap items-center gap-x-2 text-sm'>
                    <DeviceIcon className='h-4 w-4' aria-hidden />
                    <span className='font-medium'>
                      {[job.brand, job.deviceModel].filter(Boolean).join(' ')}
                    </span>
                    <span>·</span>
                    <span>{job.customerName}</span>
                    {job.phone && <span dir='ltr'>{job.phone}</span>}
                  </SheetDescription>
                </SheetHeader>
                <Button
                  size='icon'
                  variant='ghost'
                  className='text-primary-foreground hover:text-primary-foreground shrink-0 hover:bg-white/10'
                  onClick={() => requestClose(false)}
                  aria-label='Close'
                >
                  <X className='h-5 w-5' />
                </Button>
              </div>
              <div className='bg-background text-foreground rounded-lg p-2'>
                <StatusStepper status={job.status} />
              </div>
            </div>

            {/* Actions */}
            <div className='flex flex-wrap items-center gap-2 border-b px-4 py-3 sm:px-6'>
              {canManage && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='outline'>
                      Move to <ChevronDown className='ml-1 h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='start'>
                    <DropdownMenuLabel>Set status</DropdownMenuLabel>
                    {job.status === 'delivered' ? (
                      <DropdownMenuItem
                        onClick={() =>
                          move('completed', { note: 'Delivery undone' })
                        }
                      >
                        <Undo2 className='mr-2 h-4 w-4' /> Undo delivery
                      </DropdownMenuItem>
                    ) : job.status === 'cancelled' ? (
                      <DropdownMenuItem
                        onClick={() => move('pending', { note: 'Reopened' })}
                      >
                        <RotateCcw className='mr-2 h-4 w-4' /> Reopen job
                      </DropdownMenuItem>
                    ) : (
                      <>
                        {BOARD_STATUSES.filter(
                          (s) =>
                            s !== job.status && !SKIPPED_STATUSES.includes(s)
                        ).map((s) => {
                          const Icon = STATUS_META[s].icon
                          return (
                            <DropdownMenuItem
                              key={s}
                              onClick={() =>
                                s === 'completed'
                                  ? markReady('repaired')
                                  : move(s)
                              }
                            >
                              <Icon className='mr-2 h-4 w-4' />{' '}
                              {STATUS_META[s].label}
                            </DropdownMenuItem>
                          )
                        })}
                        <DropdownMenuItem
                          onClick={() => markReady('not_repairable')}
                        >
                          <XCircle className='mr-2 h-4 w-4' /> Ready — not
                          repairable
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className='text-destructive'
                          onClick={() => setCancelOpen(true)}
                        >
                          <Ban className='mr-2 h-4 w-4' /> Cancel job…
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <div className='ml-auto flex items-center gap-1'>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant='outline' size='icon' aria-label='Print'>
                      <Printer className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end'>
                    <DropdownMenuItem
                      onClick={async () =>
                        (await ensureSaved()) && printReceipt(job, 'job_card')
                      }
                    >
                      <Printer className='mr-2 h-4 w-4' /> Job card
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={async () =>
                        (await ensureSaved()) && printReceipt(job, 'invoice')
                      }
                    >
                      <Printer className='mr-2 h-4 w-4' /> Repair invoice
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => printTag(job)}>
                      <Tag className='mr-2 h-4 w-4' /> Device tag
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <WhatsAppSendButton
                  phone={job.phone}
                  name={job.customerName}
                  variant='outline'
                  message={customerMessage(job, branchName, fmt)}
                  templateCategory='repair_receipt'
                  templateParams={[
                    job.customerName,
                    job.deviceModel,
                    statusMeta(job.status).label,
                    balance > 0 ? balance.toLocaleString() : '0',
                  ]}
                />
                <SmsSendButton
                  phone={job.phone}
                  name={job.customerName}
                  variant='outline'
                  defaultMessage={customerMessage(job, branchName, fmt)}
                />
                {canManage && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant='ghost' size='icon' aria-label='More'>
                        <MoreHorizontal className='h-4 w-4' />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                      <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        <Pencil className='mr-2 h-4 w-4' /> Edit details
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className='text-destructive'
                        onClick={() => setDeleteOpen(true)}
                      >
                        <Trash2 className='mr-2 h-4 w-4' /> Delete job
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Money strip */}
            <div className='grid grid-cols-3 divide-x border-b text-center'>
              <div className='px-2 py-3'>
                <div className='text-muted-foreground text-xs'>
                  {draft.lines.length ? 'Bill' : 'Estimate'}
                  {draft.dirty && (
                    <span className='text-amber-600'> · unsaved</span>
                  )}
                </div>
                <div className='font-semibold tabular-nums'>
                  {fmt(shownCharges)}
                </div>
              </div>
              <div className='px-2 py-3'>
                <div className='text-muted-foreground text-xs'>Paid</div>
                <div className='font-semibold text-emerald-600 tabular-nums'>
                  {fmt(job.advanceAmount)}
                </div>
              </div>
              <div className='px-2 py-3'>
                <div className='text-muted-foreground text-xs'>
                  {balance < 0 ? 'Refund due' : 'Balance'}
                </div>
                <div
                  className={cn(
                    'font-semibold tabular-nums',
                    balance > 0
                      ? 'text-destructive'
                      : balance < 0
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                  )}
                >
                  {balance === 0 ? 'Paid ✓' : fmt(Math.abs(balance))}
                </div>
              </div>
            </div>

            <Tabs
              value={tab}
              onValueChange={setTab}
              className='px-4 py-4 sm:px-6'
            >
              <TabsList className='grid w-full grid-cols-4'>
                <TabsTrigger value='bill'>Bill</TabsTrigger>
                <TabsTrigger value='details'>Details</TabsTrigger>
                <TabsTrigger value='payments'>Payments</TabsTrigger>
                <TabsTrigger value='activity'>Activity</TabsTrigger>
              </TabsList>

              {/* ── Bill ── */}
              <TabsContent value='bill' className='mt-4'>
                <BillLines
                  job={job}
                  draft={draft}
                  editable={canManage && !closed}
                  showCost={canManage}
                  onAdd={setLineMode}
                />
              </TabsContent>

              {/* ── Details ── */}
              <TabsContent value='details' className='mt-4 space-y-5'>
                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>Problem</h3>
                  {!!job.problems?.length && (
                    <div className='flex flex-wrap gap-1.5'>
                      {job.problems.map((p) => (
                        <span
                          key={p}
                          className='bg-primary/10 text-primary rounded-full px-2 py-0.5 text-xs font-medium'
                        >
                          {p}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className='text-sm whitespace-pre-wrap'>{job.issue}</p>
                </section>

                <section className='space-y-2'>
                  <Label
                    htmlFor='js-diagnosis'
                    className='text-sm font-semibold'
                  >
                    Technician's diagnosis
                  </Label>
                  <Textarea
                    id='js-diagnosis'
                    rows={3}
                    placeholder='What was found, what needs replacing…'
                    value={diagnosis}
                    disabled={!canManage}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                  {canManage && diagnosis !== (job.diagnosis ?? '') && (
                    <div className='flex justify-end gap-2'>
                      <Button
                        size='sm'
                        variant='ghost'
                        onClick={() => setDiagnosis(job.diagnosis ?? '')}
                      >
                        Discard
                      </Button>
                      <Button
                        size='sm'
                        onClick={() => patch({ diagnosis }, 'Diagnosis saved')}
                      >
                        Save diagnosis
                      </Button>
                    </div>
                  )}
                </section>

                <section className='grid grid-cols-1 gap-3 sm:grid-cols-3'>
                  <div className='space-y-1'>
                    <Label>Technician</Label>
                    <TechnicianPicker
                      disabled={!canManage}
                      placeholder='Unassigned'
                      value={{
                        id: job.technicianId || null,
                        name: job.technician || '',
                      }}
                      onChange={(t) =>
                        patch(
                          t.id
                            ? { technicianId: t.id }
                            : { technicianId: null, technician: t.name },
                          t.name ? `Assigned to ${t.name}` : 'Unassigned'
                        )
                      }
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label>Priority</Label>
                    <Select
                      disabled={!canManage}
                      value={job.priority ?? 'normal'}
                      onValueChange={(v) =>
                        patch(
                          { priority: v as RepairPriority },
                          'Priority saved'
                        )
                      }
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(PRIORITY_META) as RepairPriority[]).map(
                          (p) => (
                            <SelectItem key={p} value={p}>
                              {PRIORITY_META[p].label}
                            </SelectItem>
                          )
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='js-due'>Promised by</Label>
                    <Input
                      id='js-due'
                      type='date'
                      disabled={!canManage}
                      key={`${job.id}-${job.dueDate}`}
                      defaultValue={
                        job.dueDate
                          ? new Date(job.dueDate).toLocaleDateString('en-CA', {
                              timeZone: getBusinessTimeZone(),
                            })
                          : ''
                      }
                      onChange={(e) => {
                        const v = e.target.value
                        patch(
                          {
                            dueDate: v
                              ? parseBusinessDateTimeLocal(`${v}T18:00`)
                              : null,
                          },
                          'Due date saved'
                        )
                      }}
                    />
                  </div>
                </section>

                <section className='space-y-2'>
                  <h3 className='text-sm font-semibold'>Device</h3>
                  <dl className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                    <Field label='Type' value={device.label} />
                    <Field label='Brand' value={job.brand} />
                    <Field label='Model' value={job.deviceModel} />
                    <Field
                      label={device.serialLabel}
                      value={job.serialNumber}
                      mono
                    />
                    <Field label='Color' value={job.color} />
                    <Field
                      label='Received'
                      value={formatBusinessDate(job.date)}
                    />
                    {job.lockType && job.lockType !== 'none' && (
                      <div className='min-w-0'>
                        <dt className='text-muted-foreground flex items-center gap-1 text-xs'>
                          <Lock className='h-3 w-3' aria-hidden />{' '}
                          {job.lockType === 'pattern'
                            ? 'Pattern'
                            : job.lockType === 'pin'
                              ? 'PIN'
                              : 'Password'}
                        </dt>
                        <dd className='flex items-center gap-1 font-mono text-sm'>
                          {showLock ? job.lockCode || '—' : '••••'}
                          <button
                            type='button'
                            className='text-muted-foreground hover:text-foreground'
                            onClick={() => setShowLock((v) => !v)}
                            aria-label={showLock ? 'Hide code' : 'Show code'}
                          >
                            {showLock ? (
                              <EyeOff className='h-3.5 w-3.5' />
                            ) : (
                              <Eye className='h-3.5 w-3.5' />
                            )}
                          </button>
                        </dd>
                      </div>
                    )}
                    <Field
                      label='Salesman'
                      value={salesmanLabel(job.salesmanId)}
                    />
                  </dl>
                  {!!job.conditionChecks?.length && (
                    <div>
                      <div className='text-muted-foreground mb-1 text-xs'>
                        Condition at intake
                      </div>
                      <div className='flex flex-wrap gap-1.5'>
                        {job.conditionChecks.map((c) => (
                          <span
                            key={c}
                            className='rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-900 dark:text-amber-200'
                          >
                            {c}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  <Field label='Accessories received' value={job.accessories} />
                </section>

                <section className='flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm'>
                  <ShieldCheck
                    className='h-4 w-4 text-emerald-600'
                    aria-hidden
                  />
                  <span className='font-medium'>Repair warranty</span>
                  <Select
                    disabled={!canManage || job.status === 'delivered'}
                    value={String(job.warrantyDays ?? 0)}
                    onValueChange={(v) =>
                      patch({ warrantyDays: Number(v) }, 'Warranty saved')
                    }
                  >
                    <SelectTrigger className='h-8 w-32'>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['0', '7', '15', '30', '60', '90', '180'].map((d) => (
                        <SelectItem key={d} value={d}>
                          {d === '0' ? 'None' : `${d} days`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {job.warrantyUntil && (
                    <span
                      className={cn(
                        'text-xs',
                        new Date(job.warrantyUntil) >= new Date()
                          ? 'text-emerald-600'
                          : 'text-muted-foreground'
                      )}
                    >
                      {new Date(job.warrantyUntil) >= new Date()
                        ? 'Covered until'
                        : 'Expired'}{' '}
                      {formatBusinessDate(job.warrantyUntil)}
                    </span>
                  )}
                </section>
                {job.status === 'cancelled' && job.cancelReason && (
                  <p className='rounded-md bg-rose-500/10 p-3 text-sm text-rose-800 dark:text-rose-200'>
                    Cancelled: {job.cancelReason}
                  </p>
                )}
                {job.outcome === 'not_repairable' && (
                  <p className='rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200'>
                    Marked not repairable.
                  </p>
                )}
              </TabsContent>

              {/* ── Payments ── */}
              <TabsContent value='payments' className='mt-4 space-y-3'>
                {canManage && (
                  <div className='flex flex-wrap gap-2'>
                    {balance > 0 && job.status !== 'cancelled' && (
                      <Button
                        onClick={async () =>
                          (await ensureSaved()) && setPayMode('payment')
                        }
                      >
                        <Plus className='mr-1.5 h-4 w-4' /> Receive payment
                      </Button>
                    )}
                    {(job.advanceAmount ?? 0) > 0 && (
                      <Button
                        variant='outline'
                        onClick={() => setPayMode('refund')}
                      >
                        <Undo2 className='mr-1.5 h-4 w-4' /> Refund
                      </Button>
                    )}
                  </div>
                )}
                {payments.length === 0 ? (
                  <p className='text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm'>
                    No payments yet.
                  </p>
                ) : (
                  <ul className='divide-y rounded-lg border'>
                    {payments.map((p) => (
                      <li
                        key={p.id}
                        className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
                      >
                        <div className='min-w-0'>
                          <div className='font-medium'>
                            {p.kind === 'refund'
                              ? 'Refund'
                              : p.kind === 'advance'
                                ? 'Advance'
                                : 'Payment'}{' '}
                            ·{' '}
                            {p.paymentMethod === 'wallet'
                              ? p.walletType
                              : p.paymentMethod === 'cash'
                                ? 'Cash'
                                : p.paymentMethod}
                          </div>
                          <div className='text-muted-foreground truncate text-xs'>
                            {formatBusinessDate(p.date)}
                            {p.note ? ` · ${p.note}` : ''}
                          </div>
                        </div>
                        <div className='flex items-center gap-1'>
                          <span
                            className={cn(
                              'font-semibold tabular-nums',
                              p.kind === 'refund'
                                ? 'text-amber-600'
                                : 'text-emerald-600'
                            )}
                          >
                            {p.kind === 'refund' ? '−' : '+'}
                            {fmt(p.amount)}
                          </span>
                          {canManage && (
                            <Button
                              size='icon'
                              variant='ghost'
                              aria-label='Delete payment'
                              title='Delete (entered by mistake) — also removes it from the cash book'
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    `Delete this ${fmt(p.amount)} ${p.kind === 'refund' ? 'refund' : 'payment'}? It is also removed from the cash book.`
                                  )
                                )
                                  return
                                try {
                                  await removePayment({
                                    id: job.id,
                                    paymentId: p.id,
                                  }).unwrap()
                                  toast.success('Payment deleted')
                                } catch (e) {
                                  toast.error(errMsg(e, 'Could not delete'))
                                }
                              }}
                            >
                              <Trash2 className='text-destructive h-4 w-4' />
                            </Button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <p className='text-muted-foreground text-xs'>
                  Each payment goes into the cash book (or its bank / wallet
                  account) on its own date.
                </p>
              </TabsContent>

              {/* ── Activity ── */}
              <TabsContent value='activity' className='mt-4 space-y-4'>
                {canManage && (
                  <form
                    className='flex gap-2'
                    onSubmit={async (e) => {
                      e.preventDefault()
                      if (!note.trim()) return
                      try {
                        await addNote({
                          id: job.id,
                          note: note.trim(),
                        }).unwrap()
                        setNote('')
                      } catch (err) {
                        toast.error(errMsg(err, 'Could not add note'))
                      }
                    }}
                  >
                    <Input
                      placeholder='Add a note (called customer, waiting for…)'
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                    />
                    <Button
                      type='submit'
                      disabled={noting || !note.trim()}
                      aria-label='Add note'
                    >
                      <MessageSquarePlus className='h-4 w-4' />
                    </Button>
                  </form>
                )}
                <ol className='relative space-y-3 border-l pl-4'>
                  {[...(job.timeline ?? [])].reverse().map((t, idx) => {
                    const Icon = t.status
                      ? statusMeta(t.status).icon
                      : t.action === 'payment'
                        ? Wallet
                        : t.action === 'part'
                          ? Boxes
                          : MessageSquarePlus
                    return (
                      <li key={`${t.at}-${idx}`} className='relative'>
                        <span className='bg-background absolute top-0.5 -left-[25px] flex h-4 w-4 items-center justify-center rounded-full border'>
                          <Icon className='h-2.5 w-2.5' aria-hidden />
                        </span>
                        <div className='text-sm'>
                          {t.note || statusMeta(t.status).label}
                        </div>
                        <div className='text-muted-foreground text-xs'>
                          {new Date(t.at).toLocaleString('en-GB', {
                            timeZone: getBusinessTimeZone(),
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                          {t.byUserName ? ` · ${t.byUserName}` : ''}
                        </div>
                      </li>
                    )
                  })}
                  {!job.timeline?.length && (
                    <li className='text-muted-foreground text-sm'>
                      Received {formatBusinessDate(job.date)}.
                    </li>
                  )}
                </ol>
              </TabsContent>
            </Tabs>

            {/* Bottom bar — the bill's Save and the job's next step, always in reach. */}
            {canManage &&
              (draft.dirty || next || job.status === 'completed') && (
                <div className='bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-[calc(var(--push-banner-height,0px)+var(--pwa-banner-height,0px))] z-20 flex flex-wrap items-center gap-2 border-t px-4 py-3 backdrop-blur sm:px-6'>
                  {draft.dirty ? (
                    <>
                      <span className='mr-auto text-sm font-medium text-amber-700 dark:text-amber-300'>
                        {draft.pendingCount} unsaved change
                        {draft.pendingCount === 1 ? '' : 's'}
                      </span>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={draft.discard}
                        disabled={draft.saving}
                      >
                        <Undo2 className='mr-1 h-4 w-4' /> Discard
                      </Button>
                      <Button
                        type='button'
                        variant='outline'
                        onClick={() => void draft.save()}
                        disabled={draft.saving}
                      >
                        <Save className='mr-1.5 h-4 w-4' />{' '}
                        {draft.saving ? 'Saving…' : 'Save bill'}
                      </Button>
                    </>
                  ) : (
                    <span className='mr-auto' />
                  )}
                  {canManage && job.status === 'completed' && (
                    <Button
                      onClick={async () =>
                        (await ensureSaved()) && setPayMode('deliver')
                      }
                    >
                      <Wallet className='mr-1.5 h-4 w-4' />{' '}
                      {balance > 0
                        ? `Collect ${fmt(balance)} & deliver`
                        : 'Deliver'}
                    </Button>
                  )}
                  {canManage && next && (
                    <Button
                      disabled={moving}
                      onClick={() =>
                        next.to === 'completed'
                          ? markReady('repaired')
                          : move(next.to)
                      }
                      variant={
                        job.status === 'completed' ? 'outline' : 'default'
                      }
                    >
                      {next.label}
                    </Button>
                  )}
                </div>
              )}

            {/* Dialogs */}
            <AddLineDialog
              jobId={job.id}
              open={!!lineMode}
              initialMode={lineMode ?? 'stock'}
              onOpenChange={(o) => !o && setLineMode(null)}
              onAddLine={draft.add}
            />
            <PaymentDialog
              job={job}
              mode={payMode ?? 'payment'}
              open={!!payMode}
              onOpenChange={(o) => !o && setPayMode(null)}
              onDone={(updated) => {
                if (payMode === 'deliver' && updated.status === 'delivered')
                  printReceipt(updated, 'invoice')
              }}
            />
            <CancelDialog
              open={cancelOpen}
              onOpenChange={setCancelOpen}
              busy={moving}
              hasStockParts={items.some((i) => !!i.productId)}
              paid={job.advanceAmount ?? 0}
              fmt={fmt}
              onConfirm={async (reason, fee) => {
                const updated = await move('cancelled', {
                  cancelReason: reason,
                  fee,
                })
                if (updated) setCancelOpen(false)
              }}
            />
            <EditDetailsDialog
              job={job}
              open={editOpen}
              onOpenChange={setEditOpen}
              onSave={(body) =>
                patch(body, 'Details saved').then(() => setEditOpen(false))
              }
            />
            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogContent className='sm:max-w-sm'>
                <DialogHeader>
                  <DialogTitle>Delete {jobRef(job)}?</DialogTitle>
                  <DialogDescription>
                    Parts go back to stock and every payment is removed from the
                    cash book. This can't be undone — to stop a job, cancel it
                    instead.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant='outline'
                    onClick={() => setDeleteOpen(false)}
                  >
                    Keep
                  </Button>
                  <Button
                    variant='destructive'
                    disabled={deleting}
                    onClick={async () => {
                      try {
                        await deleteJob(job.id).unwrap()
                        refreshStock()
                        toast.success('Job deleted')
                        setDeleteOpen(false)
                        onOpenChange(false)
                      } catch (e) {
                        toast.error(errMsg(e, 'Could not delete'))
                      }
                    }}
                  >
                    Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        )}
        <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
          <DialogContent className='sm:max-w-sm'>
            <DialogHeader>
              <DialogTitle>Save the bill?</DialogTitle>
              <DialogDescription>
                {draft.pendingCount} change{draft.pendingCount === 1 ? '' : 's'}{' '}
                to this job's bill{' '}
                {draft.pendingCount === 1 ? "hasn't" : "haven't"} been saved —
                stock is only taken when you save.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className='gap-2'>
              <Button variant='ghost' onClick={() => setLeaveOpen(false)}>
                Keep editing
              </Button>
              <Button
                variant='outline'
                onClick={() => {
                  draft.discard()
                  setLeaveOpen(false)
                  onOpenChange(false)
                }}
              >
                Discard
              </Button>
              <Button
                disabled={draft.saving}
                onClick={async () => {
                  if (await draft.save()) {
                    setLeaveOpen(false)
                    onOpenChange(false)
                  }
                }}
              >
                {draft.saving ? 'Saving…' : 'Save & close'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SheetContent>
    </Sheet>
  )
}

function CancelDialog({
  open,
  onOpenChange,
  busy,
  hasStockParts,
  paid,
  fmt,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  busy: boolean
  hasStockParts: boolean
  paid: number
  fmt: (n: number) => string
  onConfirm: (reason: string, fee: number) => void
}) {
  const [reason, setReason] = useState('')
  const [fee, setFee] = useState('')
  useEffect(() => {
    if (open) {
      setReason('')
      setFee('')
    }
  }, [open])
  const feeNum = Number(fee) || 0
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='sm:max-w-md'>
        <DialogHeader>
          <DialogTitle>Cancel job</DialogTitle>
          <DialogDescription>
            {hasStockParts
              ? 'Parts taken from stock go back on the shelf. '
              : ''}
            The bill becomes just the checking fee below.
          </DialogDescription>
        </DialogHeader>
        <div className='space-y-3'>
          <div className='space-y-1'>
            <Label htmlFor='cd-reason'>Reason</Label>
            <Input
              id='cd-reason'
              placeholder='e.g. Customer declined the estimate'
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <div className='space-y-1'>
            <Label htmlFor='cd-fee'>Checking / cancellation fee</Label>
            <Input
              id='cd-fee'
              type='number'
              min='0'
              placeholder='0'
              value={fee}
              onChange={(e) => setFee(e.target.value)}
            />
          </div>
          {paid > feeNum && (
            <p className='rounded-md bg-amber-500/10 p-3 text-sm text-amber-900 dark:text-amber-200'>
              {fmt(paid)} was collected — refund {fmt(paid - feeNum)} from the
              Payments tab after cancelling.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Back
          </Button>
          <Button
            variant='destructive'
            disabled={busy}
            onClick={() => onConfirm(reason.trim(), feeNum)}
          >
            Cancel job
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EditDetailsDialog({
  job,
  open,
  onOpenChange,
  onSave,
}: {
  job: RepairJobRecord
  open: boolean
  onOpenChange: (o: boolean) => void
  onSave: (body: Record<string, unknown>) => void
}) {
  const [v, setV] = useState({
    customerName: '',
    phone: '',
    brand: '',
    deviceModel: '',
    serialNumber: '',
    color: '',
    accessories: '',
    issue: '',
    estimatedCharges: '',
    lockCode: '',
  })
  useEffect(() => {
    if (!open) return
    setV({
      customerName: job.customerName ?? '',
      phone: job.phone ?? '',
      brand: job.brand ?? '',
      deviceModel: job.deviceModel ?? '',
      serialNumber: job.serialNumber ?? '',
      color: job.color ?? '',
      accessories: job.accessories ?? '',
      issue: job.issue ?? '',
      estimatedCharges: String(job.estimatedCharges ?? ''),
      lockCode: job.lockCode ?? '',
    })
  }, [open, job])
  const f = (
    key: keyof typeof v,
    label: string,
    extra: React.ComponentProps<typeof Input> = {}
  ) => (
    <div className='space-y-1'>
      <Label htmlFor={`ed-${key}`}>{label}</Label>
      <Input
        id={`ed-${key}`}
        value={v[key]}
        onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))}
        {...extra}
      />
    </div>
  )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Edit details</DialogTitle>
          <DialogDescription>{jobRef(job)}</DialogDescription>
        </DialogHeader>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          {f('customerName', 'Customer name')}
          {f('phone', 'Phone')}
          {f('brand', 'Brand')}
          {f('deviceModel', 'Model')}
          {f('serialNumber', 'Serial / IMEI', { showVoiceInput: false })}
          {f('color', 'Color')}
          {f('estimatedCharges', 'Estimate', { type: 'number', min: '0' })}
          {job.lockType &&
            job.lockType !== 'none' &&
            f('lockCode', 'Lock code', {
              autoComplete: 'off',
              showVoiceInput: false,
            })}
        </div>
        {f('accessories', 'Accessories received')}
        <div className='space-y-1'>
          <Label htmlFor='ed-issue'>Problem</Label>
          <Textarea
            id='ed-issue'
            rows={3}
            value={v.issue}
            onChange={(e) => setV((p) => ({ ...p, issue: e.target.value }))}
          />
        </div>
        <DialogFooter>
          <Button variant='outline' onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              if (
                !v.customerName.trim() ||
                !v.deviceModel.trim() ||
                !v.issue.trim()
              )
                return toast.error('Name, model and problem are required')
              onSave({
                customerName: v.customerName.trim(),
                phone: v.phone.trim(),
                brand: v.brand.trim(),
                deviceModel: v.deviceModel.trim(),
                serialNumber: v.serialNumber.trim(),
                color: v.color.trim(),
                accessories: v.accessories.trim(),
                issue: v.issue.trim(),
                estimatedCharges: Number(v.estimatedCharges) || 0,
                ...(job.lockType && job.lockType !== 'none'
                  ? { lockCode: v.lockCode.trim() }
                  : {}),
              })
            }}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

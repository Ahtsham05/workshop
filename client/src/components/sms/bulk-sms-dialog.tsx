import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import {
  MessageSquare, Send, Loader2, Users, ChevronRight, ChevronLeft,
  CheckCircle2, XCircle, Phone, Check,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { useSendSmsMutation, useSendBulkSmsMutation } from '@/stores/smsGateway.api'
import { buildCustomerBalanceMessage, buildSupplierBalanceMessage } from '@/utils/sms-messages'

export type BulkSmsRecipient = {
  _id?: string
  id?: string
  name: string
  phone?: string | null
  balance?: number
}

/** Some callers populate `id`, others `_id` — never assume either is set. Phone is the
 * last-resort key since every recipient here has already been filtered to have one. */
function resolveId(r: BulkSmsRecipient): string {
  return r._id || r.id || r.phone || ''
}

type Props = {
  open: boolean
  onOpenChange: (v: boolean) => void
  recipients: BulkSmsRecipient[]
  entityType: 'customer' | 'supplier'
  branchName?: string
}

type Step = 'select' | 'compose' | 'sending' | 'done'
type MessageMode = 'personalized' | 'custom'

const STEP_LABELS: Record<Step, string> = {
  select: 'Select Recipients',
  compose: 'Compose Message',
  sending: 'Sending…',
  done: 'Report',
}

function buildPersonalizedMessage(r: BulkSmsRecipient, entityType: 'customer' | 'supplier', branchName?: string) {
  return entityType === 'customer'
    ? buildCustomerBalanceMessage({ branchName, name: r.name, balance: r.balance })
    : buildSupplierBalanceMessage({ branchName, name: r.name, balance: r.balance })
}

function applyTemplate(template: string, r: BulkSmsRecipient) {
  return template
    .replace(/\{name\}/g, r.name)
    .replace(/\{balance\}/g, `Rs ${Math.abs(r.balance ?? 0).toFixed(0)}`)
}

function BalancePill({ balance }: { balance?: number }) {
  if (balance === undefined) return null
  const abs = Math.abs(balance).toFixed(0)
  if (balance === 0)
    return <span className='text-xs font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full'>Rs 0</span>
  if (balance > 0)
    return <span className='text-xs font-semibold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full'>Rs {abs}</span>
  return <span className='text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full'>Rs {abs}</span>
}

export function BulkSmsDialog({ open, onOpenChange, recipients, entityType, branchName }: Props) {
  const [step, setStep] = useState<Step>('select')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [messageMode, setMessageMode] = useState<MessageMode>('personalized')
  const [template, setTemplate] = useState('')
  const [progress, setProgress] = useState({ sent: 0, failed: 0, total: 0 })
  const [results, setResults] = useState<{ name: string; phone: string; ok: boolean }[]>([])

  const [sendSms] = useSendSmsMutation()
  const [sendBulkSms] = useSendBulkSmsMutation()

  const withPhone = useMemo(() => recipients.filter((r) => r.phone?.trim()), [recipients])
  const selectedList = useMemo(() => withPhone.filter((r) => selected.has(resolveId(r))), [withPhone, selected])

  const autoSelectedRef = useRef(false)

  // Reset UI state when dialog opens
  useEffect(() => {
    if (open) {
      setStep('select')
      setMessageMode('personalized')
      setTemplate('')
      setProgress({ sent: 0, failed: 0, total: 0 })
      setResults([])
      autoSelectedRef.current = false
    }
  }, [open])

  // Select all by default once the recipient list has actually loaded. `recipients` is
  // fetched asynchronously by the parent page, so it may still be empty/stale right when
  // the dialog opens — this re-syncs once real data arrives instead of freezing the
  // selection at whatever `withPhone` looked like at open time. Runs only once per dialog
  // session (not on every `withPhone` change) so it never clobbers manual toggles.
  useEffect(() => {
    if (open && !autoSelectedRef.current && withPhone.length > 0) {
      setSelected(new Set(withPhone.map(resolveId)))
      autoSelectedRef.current = true
    }
  }, [open, withPhone])

  const allSelected = selected.size === withPhone.length && withPhone.length > 0
  const someSelected = selected.size > 0 && selected.size < withPhone.length

  const toggleAll = () => {
    setSelected(allSelected ? new Set() : new Set(withPhone.map(resolveId)))
  }

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSend = useCallback(async () => {
    if (selectedList.length === 0) return
    setStep('sending')
    setProgress({ sent: 0, failed: 0, total: selectedList.length })
    const res: { name: string; phone: string; ok: boolean }[] = []

    if (messageMode === 'custom') {
      try {
        await sendBulkSms({
          recipients: selectedList.map((r) => ({ to: r.phone!, name: r.name })),
          message: template,
          source: 'bulk',
        }).unwrap()
        selectedList.forEach((r) => res.push({ name: r.name, phone: r.phone!, ok: true }))
        setProgress({ sent: selectedList.length, failed: 0, total: selectedList.length })
      } catch {
        selectedList.forEach((r) => res.push({ name: r.name, phone: r.phone!, ok: false }))
        setProgress({ sent: 0, failed: selectedList.length, total: selectedList.length })
      }
    } else {
      let sent = 0
      let failed = 0
      for (const r of selectedList) {
        try {
          await sendSms({ to: r.phone!, message: buildPersonalizedMessage(r, entityType, branchName), source: 'bulk' }).unwrap()
          sent++
          res.push({ name: r.name, phone: r.phone!, ok: true })
        } catch {
          failed++
          res.push({ name: r.name, phone: r.phone!, ok: false })
        }
        setProgress({ sent, failed, total: selectedList.length })
      }
    }

    setResults(res)
    setStep('done')
    toast.success(`SMS sent to ${res.filter((r) => r.ok).length} of ${selectedList.length}`)
  }, [selectedList, messageMode, template, entityType, branchName, sendSms, sendBulkSms])

  const pct = progress.total > 0 ? Math.round(((progress.sent + progress.failed) / progress.total) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className='p-0 gap-0 sm:max-w-[520px] flex flex-col overflow-hidden'
        style={{ maxHeight: '85vh' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className='px-6 pt-5 pb-4 border-b bg-muted/20 shrink-0'>
          <div className='flex items-center gap-2.5 mb-3'>
            <div className='h-8 w-8 rounded-lg bg-blue-100 flex items-center justify-center shrink-0'>
              <MessageSquare className='h-4 w-4 text-blue-600' />
            </div>
            <div>
              <h2 className='text-base font-semibold leading-tight'>Bulk SMS</h2>
              <p className='text-xs text-muted-foreground'>{STEP_LABELS[step]}</p>
            </div>
          </div>

          {/* Step indicator */}
          <div className='flex items-center gap-0'>
            {(['select', 'compose', 'done'] as const).map((s, i) => {
              const idx = ['select', 'compose', 'done'].indexOf(step === 'sending' ? 'compose' : step)
              const done = i < idx
              const active = i === idx
              return (
                <div key={s} className='flex items-center'>
                  <div className={cn(
                    'h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors',
                    done ? 'bg-blue-600 text-white' : active ? 'bg-blue-600 text-white ring-2 ring-blue-200' : 'bg-muted text-muted-foreground',
                  )}>
                    {done ? <Check className='h-3 w-3' /> : i + 1}
                  </div>
                  <span className={cn('text-[11px] ml-1.5 font-medium', active ? 'text-foreground' : 'text-muted-foreground')}>
                    {STEP_LABELS[s]}
                  </span>
                  {i < 2 && <div className={cn('h-px w-8 mx-2', i < idx ? 'bg-blue-400' : 'bg-border')} />}
                </div>
              )
            })}
          </div>
        </div>

        {/* ── STEP 1: SELECT ── */}
        {step === 'select' && (
          <div className='flex-1 min-h-0 grid overflow-hidden' style={{ gridTemplateRows: 'auto minmax(0,1fr) auto' }}>
            {/* Sub-toolbar */}
            <div className='flex items-center justify-between px-5 py-2.5 border-b bg-background'>
              <div className='flex items-center gap-2'>
                <Checkbox
                  id='select-all'
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={toggleAll}
                />
                <label htmlFor='select-all' className='text-sm cursor-pointer select-none'>
                  <span className='font-medium'>{selected.size}</span>
                  <span className='text-muted-foreground'> / {withPhone.length} selected</span>
                </label>
              </div>
              <button
                onClick={toggleAll}
                className='text-xs font-medium text-blue-600 hover:text-blue-700 hover:underline'
              >
                {allSelected ? 'Deselect all' : 'Select all'}
              </button>
            </div>

            {/* List */}
            <ScrollArea className='min-h-0'>
              <div className='px-3 py-2 space-y-0.5'>
                {withPhone.length === 0 ? (
                  <div className='flex flex-col items-center justify-center py-12 text-muted-foreground'>
                    <Phone className='h-8 w-8 mb-2 opacity-30' />
                    <p className='text-sm'>No {entityType}s with phone numbers</p>
                  </div>
                ) : (
                  withPhone.map((r) => {
                    const rId = resolveId(r)
                    const isSelected = selected.has(rId)
                    return (
                      <label
                        key={rId}
                        className={cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                          isSelected ? 'bg-blue-50/70 hover:bg-blue-50' : 'hover:bg-muted/50',
                        )}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleOne(rId)}
                          className='shrink-0'
                        />
                        <div className='flex-1 min-w-0'>
                          <p className={cn('text-sm font-medium truncate', isSelected ? 'text-blue-900' : 'text-foreground')}>
                            {r.name}
                          </p>
                          <p className='text-xs text-muted-foreground flex items-center gap-1 mt-0.5'>
                            <Phone className='h-3 w-3' />
                            {r.phone}
                          </p>
                        </div>
                        <BalancePill balance={r.balance} />
                      </label>
                    )
                  })
                )}
              </div>
            </ScrollArea>

            {/* Footer */}
            <div className='flex items-center justify-between px-6 py-4 border-t bg-background'>
              <Button variant='ghost' onClick={() => onOpenChange(false)} className='text-muted-foreground'>
                Cancel
              </Button>
              <Button onClick={() => setStep('compose')} disabled={selected.size === 0}>
                Next — {selected.size} {selected.size === 1 ? 'recipient' : 'recipients'}
                <ChevronRight className='h-4 w-4 ml-1' />
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 2: COMPOSE ── */}
        {step === 'compose' && (
          <>
            <div className='flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4'>
              {/* Recipient chip */}
              <div className='flex items-center gap-2 text-sm bg-blue-50 border border-blue-100 rounded-lg px-3 py-2'>
                <Users className='h-4 w-4 text-blue-500 shrink-0' />
                <span className='text-blue-700'>
                  Sending to <strong>{selectedList.length}</strong> {entityType}{selectedList.length !== 1 ? 's' : ''}
                </span>
              </div>

              {/* Mode toggle */}
              <div className='space-y-2'>
                <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                  Message Type
                </Label>
                <RadioGroup
                  value={messageMode}
                  onValueChange={(v) => setMessageMode(v as MessageMode)}
                  className='grid grid-cols-2 gap-2'
                >
                  {([
                    { value: 'personalized', label: 'Personalized', desc: 'Balance per person' },
                    { value: 'custom', label: 'Same for all', desc: 'One message, all recipients' },
                  ] as const).map((opt) => (
                    <label
                      key={opt.value}
                      className={cn(
                        'flex items-start gap-2.5 rounded-lg border-2 px-3 py-2.5 cursor-pointer transition-colors',
                        messageMode === opt.value ? 'border-blue-500 bg-blue-50/50' : 'border-border hover:border-blue-200',
                      )}
                    >
                      <RadioGroupItem value={opt.value} className='mt-0.5 shrink-0' />
                      <div>
                        <p className='text-sm font-medium leading-none'>{opt.label}</p>
                        <p className='text-xs text-muted-foreground mt-0.5'>{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </RadioGroup>
              </div>

              {/* Message area */}
              {messageMode === 'personalized' ? (
                <div className='space-y-1.5'>
                  <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                    Message Preview — {selectedList[0]?.name}
                  </Label>
                  <div className='rounded-lg border bg-muted/30 p-3.5'>
                    <pre className='text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed'>
                      {selectedList[0]
                        ? buildPersonalizedMessage(selectedList[0], entityType, branchName)
                        : '—'}
                    </pre>
                  </div>
                  <p className='text-xs text-muted-foreground'>
                    Each person receives a unique message with their name and balance.
                  </p>
                </div>
              ) : (
                <div className='space-y-2'>
                  <div className='flex items-center justify-between'>
                    <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                      Your Message
                    </Label>
                    <span className='text-xs text-muted-foreground'>
                      use <code className='bg-muted px-1 rounded'>{'{name}'}</code> and <code className='bg-muted px-1 rounded'>{'{balance}'}</code>
                    </span>
                  </div>
                  <Textarea
                    rows={5}
                    autoFocus
                    value={template}
                    onChange={(e) => setTemplate(e.target.value)}
                    placeholder={`Dear {name},\n\nYour balance is {balance}. Please contact us.\n\nRegards,\n${branchName || 'Us'}`}
                    className='resize-none font-sans text-sm'
                  />
                  <div className='flex items-center justify-between text-xs text-muted-foreground'>
                    <span>{template.length} characters</span>
                    {template.length > 160 && (
                      <span className='text-amber-600'>{Math.ceil(template.length / 160)} SMS parts</span>
                    )}
                  </div>

                  {selectedList[0] && template && (
                    <div className='space-y-1'>
                      <Label className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>
                        Preview for {selectedList[0].name}
                      </Label>
                      <div className='rounded-lg border bg-muted/30 p-3'>
                        <pre className='text-sm whitespace-pre-wrap font-sans text-foreground leading-relaxed'>
                          {applyTemplate(template, selectedList[0])}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className='flex items-center justify-between px-6 py-4 border-t bg-background shrink-0'>
              <Button variant='ghost' onClick={() => setStep('select')} className='text-muted-foreground'>
                <ChevronLeft className='h-4 w-4 mr-1' /> Back
              </Button>
              <Button
                onClick={handleSend}
                disabled={messageMode === 'custom' && !template.trim()}
                className='bg-blue-600 hover:bg-blue-700'
              >
                <Send className='h-4 w-4 mr-2' />
                Send to {selectedList.length}
              </Button>
            </div>
          </>
        )}

        {/* ── STEP 3: SENDING ── */}
        {step === 'sending' && (
          <div className='flex-1 flex flex-col items-center justify-center gap-6 px-8 py-10'>
            <div className='relative'>
              <div className='h-16 w-16 rounded-full bg-blue-100 flex items-center justify-center'>
                <Loader2 className='h-8 w-8 animate-spin text-blue-600' />
              </div>
            </div>
            <div className='text-center space-y-1'>
              <p className='font-semibold'>Sending messages…</p>
              <p className='text-sm text-muted-foreground'>
                {progress.sent + progress.failed} of {progress.total} processed
              </p>
            </div>
            <div className='w-full space-y-2'>
              <Progress value={pct} className='h-2.5 rounded-full' />
              <div className='flex justify-between text-xs text-muted-foreground'>
                <span className='text-emerald-600 font-medium'>{progress.sent} sent</span>
                {progress.failed > 0 && (
                  <span className='text-red-500 font-medium'>{progress.failed} failed</span>
                )}
                <span>{pct}%</span>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 4: DONE ── */}
        {step === 'done' && (
          <div className='flex-1 min-h-0 grid overflow-hidden' style={{ gridTemplateRows: 'auto minmax(0,1fr) auto' }}>
            {/* Summary banner */}
            <div className='px-6 py-4'>
              <div className='grid grid-cols-2 gap-3'>
                <div className='rounded-xl bg-emerald-50 border border-emerald-100 p-3 flex items-center gap-3'>
                  <div className='h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0'>
                    <CheckCircle2 className='h-4 w-4 text-emerald-600' />
                  </div>
                  <div>
                    <p className='text-xl font-bold text-emerald-700'>{results.filter((r) => r.ok).length}</p>
                    <p className='text-xs text-emerald-600'>Sent successfully</p>
                  </div>
                </div>
                <div className='rounded-xl bg-red-50 border border-red-100 p-3 flex items-center gap-3'>
                  <div className='h-8 w-8 rounded-full bg-red-100 flex items-center justify-center shrink-0'>
                    <XCircle className='h-4 w-4 text-red-500' />
                  </div>
                  <div>
                    <p className='text-xl font-bold text-red-600'>{results.filter((r) => !r.ok).length}</p>
                    <p className='text-xs text-red-500'>Failed</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Result list */}
            <ScrollArea className='min-h-0 border-t'>
              <div className='px-4 py-2 space-y-0.5'>
                {results.map((r, i) => (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg',
                      r.ok ? 'bg-emerald-50/40' : 'bg-red-50/40',
                    )}
                  >
                    {r.ok
                      ? <CheckCircle2 className='h-4 w-4 text-emerald-500 shrink-0' />
                      : <XCircle className='h-4 w-4 text-red-400 shrink-0' />}
                    <span className='text-sm font-medium flex-1 truncate'>{r.name}</span>
                    <span className='text-xs text-muted-foreground tabular-nums'>{r.phone}</span>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className='flex justify-end px-6 py-4 border-t bg-background'>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

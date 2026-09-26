import { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import { AlertTriangle, Check, Copy, FileCheck2, Upload } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  billingErrorMessage,
  METHOD_LABELS,
  useCreateManualIntentMutation,
  useSubmitManualPaymentMutation,
  type BillingPlan,
  type ManualIntent,
  type ManualMethod,
} from '@/stores/billing.api'
import { formatDate, formatPkr, formatUsd } from './format'

const MONTH_OPTIONS = [1, 3, 6, 12] as const
const MAX_BYTES = 5 * 1024 * 1024
const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'

function CopyValue({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  if (!value) return null
  return (
    <div className='flex items-center justify-between gap-2 py-1.5'>
      <div className='min-w-0'>
        <p className='text-muted-foreground text-xs'>{label}</p>
        <p className='font-mono text-sm break-all'>{value}</p>
      </div>
      <Button
        type='button'
        variant='ghost'
        size='icon'
        className='h-8 w-8 shrink-0'
        aria-label={`Copy ${label}`}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          } catch {
            toast.error('Copy failed — please select and copy manually')
          }
        }}
      >
        {copied ? <Check className='h-4 w-4 text-emerald-600' /> : <Copy className='h-4 w-4' />}
      </Button>
    </div>
  )
}

function AccountBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className='rounded-md border px-3 py-2'>
      <p className='text-sm font-semibold'>{title}</p>
      <div className='divide-y'>{children}</div>
    </div>
  )
}

const todayInPakistan = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Karachi', year: 'numeric', month: '2-digit', day: '2-digit' }).format(
    new Date()
  )

interface Props {
  plan: BillingPlan | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ManualPaymentDialog({ plan, open, onOpenChange }: Props) {
  const [step, setStep] = useState<'period' | 'instructions' | 'submit' | 'done'>('period')
  const [months, setMonths] = useState<number>(1)
  const [intent, setIntent] = useState<ManualIntent | null>(null)
  const [method, setMethod] = useState<ManualMethod>('bank_transfer')
  const [transactionId, setTransactionId] = useState('')
  const [payerName, setPayerName] = useState('')
  const [paidAmount, setPaidAmount] = useState('')
  const [paidOn, setPaidOn] = useState(todayInPakistan())
  const [file, setFile] = useState<File | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [createIntent, { isLoading: creating }] = useCreateManualIntentMutation()
  const [submitPayment, { isLoading: submitting }] = useSubmitManualPaymentMutation()

  useEffect(() => {
    if (!open) return
    setStep('period')
    setMonths(1)
    setIntent(null)
    setMethod('bank_transfer')
    setTransactionId('')
    setPayerName('')
    setPaidAmount('')
    setPaidOn(todayInPakistan())
    setFile(null)
    setFieldErrors({})
  }, [open, plan?.key])

  const details = intent?.paymentDetails
  const availableMethods = useMemo(() => {
    if (!details) return [] as ManualMethod[]
    const list: ManualMethod[] = []
    if (details.bank.accountNumber || details.bank.iban) list.push('bank_transfer')
    if (details.jazzcash.accountNumber) list.push('jazzcash')
    if (details.easypaisa.accountNumber) list.push('easypaisa')
    return list
  }, [details])

  if (!plan) return null

  const handleCreateIntent = async () => {
    try {
      const result = await createIntent({ planKey: plan.key, months }).unwrap()
      setIntent(result)
      setPaidAmount(String(result.amountPkr))
      setStep('instructions')
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const validate = () => {
    const errors: Record<string, string> = {}
    if (transactionId.trim().length < 4) errors.transactionId = 'Enter the transaction / reference ID from your receipt'
    else if (!/^[A-Za-z0-9\-_/ .]+$/.test(transactionId.trim())) errors.transactionId = 'Only letters, digits and - _ / .'
    if (payerName.trim().length < 2) errors.payerName = 'Enter the name of the account that paid'
    if (!(Number(paidAmount) > 0)) errors.paidAmount = 'Enter the amount you sent'
    if (!paidOn) errors.paidOn = 'Enter the payment date'
    if (!file) errors.file = 'Attach a screenshot or PDF of the payment'
    else if (file.size > MAX_BYTES) errors.file = 'File is larger than 5 MB'
    else if (!ACCEPT.split(',').includes(file.type)) errors.file = 'Use a JPG, PNG, WEBP or PDF file'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleSubmit = async () => {
    if (!intent || !validate() || !file) return
    const form = new FormData()
    form.append('reference', intent.reference)
    form.append('method', method)
    form.append('transactionId', transactionId.trim())
    form.append('payerName', payerName.trim())
    form.append('paidAmountPkr', paidAmount)
    // Noon PKT on the chosen day, so no timezone shift can move it to another date.
    form.append('paidOn', new Date(`${paidOn}T12:00:00+05:00`).toISOString())
    form.append('proof', file)
    try {
      await submitPayment(form).unwrap()
      setStep('done')
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  const amountShort = intent && Number(paidAmount) > 0 && Number(paidAmount) < intent.amountPkr

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>
            {step === 'done' ? 'Payment submitted' : `Pay for ${plan.name} by bank or mobile wallet`}
          </DialogTitle>
          <DialogDescription>
            {step === 'period' && 'Choose how many months to pay for. Prices are in Pakistani rupees.'}
            {step === 'instructions' && 'Send the exact amount to one of the accounts below, then submit your proof.'}
            {step === 'submit' && 'Enter the details exactly as they appear on your payment receipt.'}
            {step === 'done' && 'We will verify it and activate your plan, usually within one business day.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'period' && (
          <RadioGroup
            value={String(months)}
            onValueChange={(v) => setMonths(Number(v))}
            className='grid grid-cols-1 gap-2 sm:grid-cols-2'
          >
            {MONTH_OPTIONS.map((m) => (
              <Label
                key={m}
                htmlFor={`months-${m}`}
                className='has-[:checked]:border-primary flex cursor-pointer items-center justify-between gap-3 rounded-md border p-3'
              >
                <span className='flex items-center gap-2'>
                  <RadioGroupItem id={`months-${m}`} value={String(m)} />
                  {m} month{m === 1 ? '' : 's'}
                </span>
                <span className='text-sm font-semibold tabular-nums'>{formatPkr(plan.pricePkrMonthly * m)}</span>
              </Label>
            ))}
          </RadioGroup>
        )}

        {step === 'instructions' && intent && details && (
          <div className='space-y-3'>
            {intent.warnings.length > 0 && (
              <Alert>
                <AlertTriangle className='h-4 w-4' />
                <AlertTitle>Your usage is above the {intent.plan.name} plan</AlertTitle>
                <AlertDescription>
                  <ul className='list-disc pl-4'>
                    {intent.warnings.map((w) => (
                      <li key={w.limit}>{w.message}</li>
                    ))}
                  </ul>
                  Nothing is deleted, but you won't be able to add more until you're under the limit.
                </AlertDescription>
              </Alert>
            )}
            <div className='bg-muted/50 rounded-md border p-3'>
              <div className='flex flex-wrap items-baseline justify-between gap-2'>
                <span className='text-muted-foreground text-sm'>Amount to send</span>
                <span className='text-2xl font-bold tabular-nums'>{formatPkr(intent.amountPkr)}</span>
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                {intent.plan.name} × {intent.months} month{intent.months === 1 ? '' : 's'} = {formatUsd(intent.usdAmount)} at
                PKR {intent.pkrPerUsd}/USD. This quote is held until {formatDate(intent.expiresAt)}.
              </p>
              <CopyValue label='Payment reference — put this in the transfer note' value={intent.reference} />
            </div>
            <div className='grid grid-cols-1 gap-2'>
              {(details.bank.accountNumber || details.bank.iban) && (
                <AccountBlock title={`Bank transfer — ${details.bank.bankName}`}>
                  <CopyValue label='Account title' value={details.bank.accountTitle} />
                  <CopyValue label='Account number' value={details.bank.accountNumber} />
                  <CopyValue label='IBAN' value={details.bank.iban} />
                </AccountBlock>
              )}
              {details.jazzcash.accountNumber && (
                <AccountBlock title='JazzCash'>
                  <CopyValue label='Account title' value={details.jazzcash.accountTitle} />
                  <CopyValue label='Mobile account' value={details.jazzcash.accountNumber} />
                </AccountBlock>
              )}
              {details.easypaisa.accountNumber && (
                <AccountBlock title='Easypaisa'>
                  <CopyValue label='Account title' value={details.easypaisa.accountTitle} />
                  <CopyValue label='Mobile account' value={details.easypaisa.accountNumber} />
                </AccountBlock>
              )}
            </div>
          </div>
        )}

        {step === 'submit' && intent && (
          <div className='space-y-4'>
            <div className='space-y-2'>
              <Label>Paid with</Label>
              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as ManualMethod)}
                className='flex flex-wrap gap-2'
              >
                {(availableMethods.length ? availableMethods : (Object.keys(METHOD_LABELS) as ManualMethod[])).map((m) => (
                  <Label
                    key={m}
                    htmlFor={`method-${m}`}
                    className='has-[:checked]:border-primary flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2'
                  >
                    <RadioGroupItem id={`method-${m}`} value={m} />
                    {METHOD_LABELS[m]}
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <div className='space-y-1.5 sm:col-span-2'>
                <Label htmlFor='mp-txn'>Transaction ID</Label>
                <Input id='mp-txn' value={transactionId} onChange={(e) => setTransactionId(e.target.value)} autoComplete='off' />
                {fieldErrors.transactionId && <p className='text-destructive text-xs'>{fieldErrors.transactionId}</p>}
              </div>
              <div className='space-y-1.5 sm:col-span-2'>
                <Label htmlFor='mp-payer'>Payer name</Label>
                <Input id='mp-payer' value={payerName} onChange={(e) => setPayerName(e.target.value)} />
                {fieldErrors.payerName && <p className='text-destructive text-xs'>{fieldErrors.payerName}</p>}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='mp-amount'>Amount sent (PKR)</Label>
                <Input
                  id='mp-amount'
                  inputMode='numeric'
                  value={paidAmount}
                  onChange={(e) => setPaidAmount(e.target.value.replace(/[^\d.]/g, ''))}
                />
                {fieldErrors.paidAmount && <p className='text-destructive text-xs'>{fieldErrors.paidAmount}</p>}
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='mp-date'>Payment date</Label>
                <Input id='mp-date' type='date' value={paidOn} max={todayInPakistan()} onChange={(e) => setPaidOn(e.target.value)} />
                {fieldErrors.paidOn && <p className='text-destructive text-xs'>{fieldErrors.paidOn}</p>}
              </div>
            </div>
            {amountShort && (
              <p className='text-xs text-amber-600'>
                This is less than the {formatPkr(intent.amountPkr)} due — the reviewer may ask you to pay the difference.
              </p>
            )}
            <div className='space-y-1.5'>
              <Label htmlFor='mp-proof'>Screenshot or PDF of the payment</Label>
              <label
                htmlFor='mp-proof'
                className='hover:bg-muted/50 flex cursor-pointer items-center gap-3 rounded-md border border-dashed p-3'
              >
                {file ? <FileCheck2 className='h-5 w-5 shrink-0 text-emerald-600' /> : <Upload className='h-5 w-5 shrink-0' />}
                <span className='min-w-0 truncate text-sm'>
                  {file ? `${file.name} (${(file.size / 1024).toFixed(0)} KB)` : 'Choose a JPG, PNG, WEBP or PDF — up to 5 MB'}
                </span>
              </label>
              <input
                id='mp-proof'
                type='file'
                accept={ACCEPT}
                className='sr-only'
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
              {fieldErrors.file && <p className='text-destructive text-xs'>{fieldErrors.file}</p>}
            </div>
          </div>
        )}

        {step === 'done' && intent && (
          <div className='space-y-2 text-sm'>
            <p>
              Reference <span className='font-mono font-semibold'>{intent.reference}</span> is waiting for review. You'll
              get an email with your receipt number once it is approved, or with the reason if we can't verify it.
            </p>
          </div>
        )}

        <DialogFooter className='flex-col-reverse gap-2 sm:flex-row'>
          {step === 'period' && (
            <Button onClick={handleCreateIntent} disabled={creating} className='w-full sm:w-auto'>
              {creating ? 'Preparing…' : 'Get payment details'}
            </Button>
          )}
          {step === 'instructions' && (
            <Button onClick={() => setStep('submit')} className='w-full sm:w-auto'>
              I've paid — submit proof
            </Button>
          )}
          {step === 'submit' && (
            <>
              <Button variant='outline' onClick={() => setStep('instructions')} className='w-full sm:w-auto'>
                Back to account details
              </Button>
              <Button onClick={handleSubmit} disabled={submitting} className='w-full sm:w-auto'>
                {submitting ? 'Submitting…' : 'Submit payment'}
              </Button>
            </>
          )}
          {step === 'done' && (
            <Button onClick={() => onOpenChange(false)} className='w-full sm:w-auto'>
              Done
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

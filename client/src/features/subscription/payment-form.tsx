import { useState, useRef } from 'react'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { Copy, Upload, CheckCircle2, AlertTriangle, Loader2, X, Clock } from 'lucide-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { useGetBankDetailsQuery, useSubmitPaymentMutation, useGetTrialStatusQuery } from '@/stores/subscription.api'
import Axios from '@/utils/Axios'

const MONTH_OPTIONS = [
  { value: 1, label: '1 Month' },
  { value: 3, label: '3 Months (save 5%)' },
  { value: 6, label: '6 Months (save 10%)' },
  { value: 12, label: '12 Months (save 15%)' },
]

type PlanTypeKey = 'single' | 'multi' | 'starter' | 'growth' | 'business' | 'enterprise'

interface PaymentSearch {
  planType?: PlanTypeKey
}

const PLAN_ORDER: PlanTypeKey[] = ['starter', 'growth', 'business']

export default function PaymentFormPage() {
  const search = useSearch({ from: '/_authenticated/subscription/payment' }) as PaymentSearch
  const navigate = useNavigate()

  const { data: bankData, isLoading: bankLoading } = useGetBankDetailsQuery()
    const { data: trialStatus } = useGetTrialStatusQuery()
  const [submitPayment, { isLoading: isSubmitting }] = useSubmitPaymentMutation()

  const [planType, setPlanType] = useState<PlanTypeKey>(search.planType ?? 'starter')
  const [months, setMonths] = useState(1)
  const [transactionId, setTransactionId] = useState('')
  const [_, setScreenshotFile] = useState<File | null>(null)
  const [screenshotPreview, setScreenshotPreview] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadedUrl, setUploadedUrl] = useState('')
  const [uploadedPublicId, setUploadedPublicId] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const selectedPlan = bankData?.plans?.[planType]
  const amount = selectedPlan?.pricePerMonth ? selectedPlan.pricePerMonth * months : 0

  const bankDetails = bankData?.bankDetails

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copied!`)
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('Only image files are allowed')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB')
      return
    }

    setScreenshotFile(file)
    setScreenshotPreview(URL.createObjectURL(file))

    // Upload immediately
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('screenshot', file)
      const res = await Axios.post('/payments/screenshot', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setUploadedUrl(res.data.url)
      setUploadedPublicId(res.data.publicId)
      toast.success('Screenshot uploaded')
    } catch {
      toast.error('Failed to upload screenshot. You can still submit without it.')
      setScreenshotFile(null)
      setScreenshotPreview(null)
    } finally {
      setIsUploading(false)
    }
  }

  const removeScreenshot = () => {
    setScreenshotFile(null)
    setScreenshotPreview(null)
    setUploadedUrl('')
    setUploadedPublicId('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!planType || !months) {
      toast.error('Please select a plan and duration')
      return
    }

    try {
      await submitPayment({
        planType,
        months,
        transactionId: transactionId.trim() || undefined,
        screenshotUrl: uploadedUrl || undefined,
        screenshotPublicId: uploadedPublicId || undefined,
      }).unwrap()

      toast.success('Payment submitted! We will verify and activate your plan within 24 hours.')
      navigate({ to: '/subscription' })
    } catch (err: any) {
      toast.error(err?.data?.message ?? 'Failed to submit payment. Please try again.')
    }
  }

  if (bankLoading) {
    return (
      <div className='flex items-center justify-center h-64'>
        <Loader2 className='animate-spin h-6 w-6 text-muted-foreground' />
      </div>
    )
  }

  return (
    <div className='p-6 max-w-4xl mx-auto space-y-6'>
        {/* Trial Status Alert */}
        {trialStatus?.trialExpired && (
          <div className='bg-red-950 border border-red-500 rounded-lg p-4 flex gap-3'>
            <AlertTriangle className='h-5 w-5 text-red-500 flex-shrink-0 mt-0.5' />
            <div>
              <p className='font-semibold text-red-100'>Trial Expired</p>
              <p className='text-sm text-red-50'>Your trial has expired. Renew your plan to regain full access to the application.</p>
            </div>
          </div>
        )}

        {trialStatus && !trialStatus.trialExpired && trialStatus.daysRemaining > 0 && trialStatus.daysRemaining < 3 && (
          <div className='bg-amber-950 border border-amber-500 rounded-lg p-4 flex gap-3'>
            <Clock className='h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5' />
            <div>
              <p className='font-semibold text-amber-100'>Trial Ending Soon</p>
              <p className='text-sm text-amber-50'>Your trial expires in {trialStatus.daysRemaining} day{trialStatus.daysRemaining !== 1 ? 's' : ''}. Renew now to avoid interruption.</p>
            </div>
          </div>
        )}

      <div>
        <h1 className='text-2xl font-bold'>Payment — Bank Transfer</h1>
        <p className='text-muted-foreground'>
          Transfer the plan amount to the account below and submit proof of payment.
        </p>
      </div>

      <div className='grid grid-cols-1 lg:grid-cols-2 gap-6'>
        {/* Bank Details */}
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Bank Transfer Details</CardTitle>
            <CardDescription>Transfer to the account below</CardDescription>
          </CardHeader>
          <CardContent className='space-y-4'>
            {bankDetails ? (
              <>
                {[
                  { label: 'Bank Name', value: bankDetails.bankName },
                  { label: 'Account Title', value: bankDetails.accountTitle },
                  { label: 'Account Number', value: bankDetails.accountNumber },
                  { label: 'IBAN', value: bankDetails.iban },
                  ...(bankDetails.swiftCode
                    ? [{ label: 'SWIFT / BIC', value: bankDetails.swiftCode }]
                    : []),
                  ...(bankDetails.branch ? [{ label: 'Branch', value: bankDetails.branch }] : []),
                ].map(({ label, value }) => (
                  <div key={label} className='flex items-center justify-between gap-2'>
                    <div>
                      <p className='text-xs text-muted-foreground'>{label}</p>
                      <p className='font-medium text-sm'>{value}</p>
                    </div>
                    <Button
                      type='button'
                      size='icon'
                      variant='ghost'
                      className='h-7 w-7 shrink-0'
                      onClick={() => copyToClipboard(value, label)}
                    >
                      <Copy className='h-3.5 w-3.5' />
                    </Button>
                  </div>
                ))}

                {selectedPlan && (
                  <>
                    <Separator />
                    <div className='rounded-lg bg-muted p-3 space-y-1'>
                      <p className='text-xs text-muted-foreground'>Amount to Transfer</p>
                      <p className='text-2xl font-bold'>PKR {amount.toLocaleString()}</p>
                      <p className='text-xs text-muted-foreground'>
                        {selectedPlan.label} — {months} month(s)
                      </p>
                    </div>
                  </>
                )}

                <Separator />
                <div>
                  <p className='text-xs font-medium mb-2'>Instructions</p>
                  <ol className='space-y-1'>
                    {bankDetails.instructions.map((inst, i) => (
                      <li key={i} className='text-xs text-muted-foreground flex gap-2'>
                        <span className='font-bold text-foreground shrink-0'>{i + 1}.</span>
                        {inst}
                      </li>
                    ))}
                  </ol>
                </div>
              </>
            ) : (
              <p className='text-sm text-muted-foreground'>Bank details not available.</p>
            )}
          </CardContent>
        </Card>

        {/* Payment Form */}
        <Card>
          <CardHeader>
            <CardTitle className='text-lg'>Submit Payment Proof</CardTitle>
            <CardDescription>Fill in the details after completing your transfer</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className='space-y-5'>
              {/* Plan selection */}
              <div className='space-y-2'>
                <Label htmlFor='planType'>Select Plan *</Label>
<Select
                  value={planType}
                  onValueChange={(v) => setPlanType(v as PlanTypeKey)}
                >
                  <SelectTrigger id='planType'>
                    <SelectValue placeholder='Choose a plan' />
                  </SelectTrigger>
                  <SelectContent>
                    {PLAN_ORDER
                      .map((key) => bankData?.plans?.[key])
                      .filter(Boolean)
                      .map((plan) => (
                        <SelectItem key={plan!.planType} value={plan!.planType}>
                          {plan!.label} — PKR {plan!.pricePerMonth?.toLocaleString() ?? '—'}/mo
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Duration */}
              <div className='space-y-2'>
                <Label htmlFor='months'>Duration *</Label>
                <Select
                  value={String(months)}
                  onValueChange={(v) => setMonths(Number(v))}
                >
                  <SelectTrigger id='months'>
                    <SelectValue placeholder='Select duration' />
                  </SelectTrigger>
                  <SelectContent>
                    {MONTH_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Amount summary */}
              {selectedPlan && (
                <div className='p-3 rounded-lg bg-primary/10 border border-primary/20'>
                  <p className='text-sm text-primary font-medium'>
                    Total: PKR {amount.toLocaleString()}
                  </p>
                  <p className='text-xs text-muted-foreground'>
                    {selectedPlan.label} × {months} month(s)
                  </p>
                </div>
              )}

              {/* Transaction ID */}
              <div className='space-y-2'>
                <Label htmlFor='transactionId'>Transaction ID (optional)</Label>
                <Input
                  id='transactionId'
                  placeholder='e.g. TXN-123456789'
                  value={transactionId}
                  onChange={(e) => setTransactionId(e.target.value)}
                />
                <p className='text-xs text-muted-foreground'>
                  Found on your bank transfer receipt
                </p>
              </div>

              {/* Screenshot upload */}
              <div className='space-y-2'>
                <Label>Payment Screenshot (optional)</Label>
                {screenshotPreview ? (
                  <div className='relative border rounded-lg overflow-hidden'>
                    <img
                      src={screenshotPreview}
                      alt='Payment proof'
                      className='w-full max-h-48 object-contain bg-muted'
                    />
                    <Button
                      type='button'
                      size='icon'
                      variant='destructive'
                      className='absolute top-2 right-2 h-6 w-6'
                      onClick={removeScreenshot}
                    >
                      <X className='h-3 w-3' />
                    </Button>
                    {isUploading && (
                      <div className='absolute inset-0 bg-black/50 flex items-center justify-center'>
                        <Loader2 className='animate-spin h-5 w-5 text-white' />
                      </div>
                    )}
                    {uploadedUrl && !isUploading && (
                      <div className='absolute bottom-2 right-2'>
                        <CheckCircle2 className='h-4 w-4 text-green-400' />
                      </div>
                    )}
                  </div>
                ) : (
                  <div
                    className='border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-primary/50 transition-colors'
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className='h-6 w-6 text-muted-foreground' />
                    <p className='text-sm text-muted-foreground'>
                      Click to upload payment screenshot
                    </p>
                    <p className='text-xs text-muted-foreground'>PNG, JPG up to 5MB</p>
                  </div>
                )}
                <input
                  type='file'
                  accept='image/*'
                  className='hidden'
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
              </div>

              {/* Warning */}
              <div className='flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg'>
                <AlertTriangle className='h-4 w-4 text-amber-600 shrink-0 mt-0.5' />
                <p className='text-xs text-amber-700'>
                  Make sure you have transferred the exact amount before submitting. Incorrect
                  amounts will result in rejection.
                </p>
              </div>

              <Button type='submit' className='w-full' disabled={isSubmitting || isUploading}>
                {isSubmitting ? (
                  <>
                    <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                    Submitting...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className='mr-2 h-4 w-4' />I Have Paid — Submit Proof
                  </>
                )}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

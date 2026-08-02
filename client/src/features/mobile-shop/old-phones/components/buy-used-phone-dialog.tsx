import { useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Smartphone, ShieldCheck, ShieldAlert, User,
  ClipboardCheck, Banknote, ShoppingBag, Camera, ImagePlus, Loader2, X, Check,
} from 'lucide-react'
import CameraCapture from '@/components/camera-capture'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CustomerPhoneAutocomplete, type CustomerSuggestion } from '@/components/ui/customer-phone-autocomplete'
import { cn } from '@/lib/utils'
import { toBusinessDateTimeLocal, parseBusinessDateTimeLocal } from '@/lib/business-timezone'
import {
  buildMergedPaymentOptions, getWalletTypeFromOptionValue, isWalletOptionValue, toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useCreateBuybackMutation,
  type BuybackAccessory, type BuybackChecklist, type BuybackCondition, type BuybackGrade,
  type BuybackPhoto, type BuybackPtaStatus,
} from '@/stores/usedPhoneBuyback.api'
import {
  GRADE_OPTIONS, gradeToneClasses, SCREEN_CONDITION_OPTIONS, BODY_CONDITION_OPTIONS,
  ACCESSORY_OPTIONS, PTA_OPTIONS, ptaToneClasses, CHECKLIST_FIELDS,
} from '../constants'

const SECTION_TONE_CLASSES = {
  indigo: 'bg-indigo-100 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400',
  blue: 'bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
  purple: 'bg-purple-100 text-purple-600 dark:bg-purple-950/50 dark:text-purple-400',
  emerald: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
} as const

function FormSection({ icon, title, tone, children }: { icon: ReactNode; title: string; tone: keyof typeof SECTION_TONE_CLASSES; children: ReactNode }) {
  return (
    <div className='rounded-xl border bg-muted/30 p-4 space-y-4'>
      <div className='flex items-center gap-2'>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', SECTION_TONE_CLASSES[tone])}>{icon}</span>
        <h3 className='text-sm font-semibold'>{title}</h3>
      </div>
      {children}
    </div>
  )
}

function ChipSelect<T extends string>({ options, value, onChange, getLabel }: { options: readonly T[]; value: string; onChange: (v: T) => void; getLabel?: (v: T) => string }) {
  return (
    <div className='flex flex-wrap gap-1.5'>
      {options.map((o) => (
        <button
          key={o}
          type='button'
          onClick={() => onChange(o)}
          className={cn(
            'rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors',
            value === o ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-background text-muted-foreground hover:border-primary/40',
          )}
        >
          {getLabel ? getLabel(o) : o}
        </button>
      ))}
    </div>
  )
}

/** Compact click-to-upload square tile — used for ID cards & device photos instead of the
 * full-size ImageUpload component, which is built for a single hero image and overlaps
 * itself when squeezed into a multi-photo grid. */
function PhotoSlot({ photo, onUpload, onRemove, label, aspect = 'aspect-square' }: {
  photo: BuybackPhoto | undefined
  onUpload: (photo: BuybackPhoto) => void
  onRemove: () => void
  label: string
  aspect?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isUploading, setIsUploading] = useState(false)

  const handleFile = async (file: File) => {
    setIsUploading(true)
    try {
      const formData = new FormData()
      formData.append('image', file)
      const base = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000/v1'
      const res = await fetch(`${base}/used-phones/upload-image`, {
        method: 'POST',
        body: formData,
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
      })
      if (!res.ok) throw new Error('Upload failed')
      const result = await res.json()
      onUpload({ url: result.url, publicId: result.publicId })
    } catch {
      toast.error('Photo upload failed')
    } finally {
      setIsUploading(false)
    }
  }

  const cameraButtonClass = 'flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white transition-colors hover:bg-black/80 disabled:opacity-60'

  return (
    <div className={cn('group relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/25 bg-background', aspect)}>
      {photo?.url ? (
        <>
          <img src={photo.url} alt={label} className='h-full w-full object-cover' />
          <div className='absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100'>
            <CameraCapture
              onCapture={(file) => void handleFile(file)}
              disabled={isUploading}
              trigger={
                <button type='button' className={cameraButtonClass} title='Retake photo'>
                  <Camera className='h-3 w-3' />
                </button>
              }
            />
            <button type='button' onClick={onRemove} className={cameraButtonClass} title='Remove photo'>
              <X className='h-3 w-3' />
            </button>
          </div>
          {isUploading && (
            <div className='absolute inset-0 flex items-center justify-center bg-black/50'>
              <Loader2 className='h-5 w-5 animate-spin text-white' />
            </div>
          )}
        </>
      ) : (
        <div className='flex h-full w-full flex-col items-center justify-center gap-1.5'>
          {isUploading ? (
            <Loader2 className='h-5 w-5 animate-spin text-muted-foreground' />
          ) : (
            <>
              <button
                type='button'
                onClick={() => inputRef.current?.click()}
                className='flex flex-col items-center gap-1 text-muted-foreground transition-colors hover:text-primary'
              >
                <ImagePlus className='h-5 w-5' />
                <span className='px-1 text-center text-[10px] leading-tight'>{label}</span>
              </button>
              <CameraCapture
                onCapture={(file) => void handleFile(file)}
                trigger={
                  <button type='button' className='flex items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary'>
                    <Camera className='h-3 w-3' /> Camera
                  </button>
                }
              />
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type='file'
        accept='image/*'
        className='hidden'
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) void handleFile(file)
          e.target.value = ''
        }}
      />
    </div>
  )
}

type FormState = {
  sellerCustomerId?: string
  sellerName: string
  sellerPhone: string
  sellerCNIC: string
  imei: string
  imei2: string
  brand: string
  model: string
  color: string
  storage: string
  grade: BuybackGrade | ''
  screenCondition: string
  bodyCondition: string
  batteryHealthPct: string
  checklist: BuybackChecklist
  accessoriesIncluded: BuybackAccessory[]
  ptaStatus: BuybackPtaStatus
  agreedPrice: string
  askingPrice: string
  paymentMethod: 'cash' | 'wallet' | 'bank'
  walletType: string
  buybackDate: string
  isTradeIn: boolean
  notes: string
}

const makeInitialForm = (): FormState => ({
  sellerCustomerId: undefined,
  sellerName: '',
  sellerPhone: '',
  sellerCNIC: '',
  imei: '',
  imei2: '',
  brand: '',
  model: '',
  color: '',
  storage: '',
  grade: '',
  screenCondition: '',
  bodyCondition: '',
  batteryHealthPct: '',
  checklist: {
    touchScreen: true, camera: true, speaker: true, microphone: true,
    buttons: true, biometrics: true, charging: true, waterDamage: false,
  },
  accessoriesIncluded: [],
  ptaStatus: 'unknown',
  agreedPrice: '',
  askingPrice: '',
  paymentMethod: 'cash',
  walletType: '',
  buybackDate: toBusinessDateTimeLocal(),
  isTradeIn: false,
  notes: '',
})

/**
 * Buy-a-used-phone form, as its own dialog so it can be opened both from the Old Phones
 * page (its original home) and from the regular Purchase Invoice screen — buying a used
 * phone from a walk-in seller is fundamentally a purchase, so staff already on the
 * Purchases screen shouldn't have to navigate away to record one. Submitting always
 * goes through the same used-phones buyback endpoint regardless of where it was opened
 * from, so Cash Book/Wallet/inventory stay consistent either way.
 */
export function BuyUsedPhoneDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}) {
  const [form, setForm] = useState<FormState>(makeInitialForm)
  const [sellerIdCardFront, setSellerIdCardFront] = useState<BuybackPhoto | undefined>()
  const [sellerIdCardBack, setSellerIdCardBack] = useState<BuybackPhoto | undefined>()
  const [conditionPhotos, setConditionPhotos] = useState<(BuybackPhoto | undefined)[]>([undefined, undefined, undefined, undefined])

  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  const basePaymentMethods = [{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank Transfer' }]
  // Buying a used phone is money-out — show wallet balances so staff can see what's available.
  const paymentMethodOptions = buildMergedPaymentOptions(basePaymentMethods, wallets, true)

  const [createBuyback, { isLoading: isSaving }] = useCreateBuybackMutation()

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const toggleChecklist = (key: keyof BuybackChecklist, checked: boolean) =>
    setForm((prev) => ({ ...prev, checklist: { ...prev.checklist, [key]: checked } }))

  const toggleAccessory = (value: BuybackAccessory, checked: boolean) =>
    setForm((prev) => ({
      ...prev,
      accessoriesIncluded: checked
        ? [...prev.accessoriesIncluded, value]
        : prev.accessoriesIncluded.filter((a) => a !== value),
    }))

  const handleCustomerSelect = (customer: CustomerSuggestion) => {
    setForm((prev) => ({
      ...prev,
      sellerCustomerId: customer.id || customer._id,
      sellerName: customer.name || prev.sellerName,
      sellerPhone: customer.phone || prev.sellerPhone,
      sellerCNIC: customer.cnic || prev.sellerCNIC,
    }))
  }

  const clearLinkedCustomer = () => setField('sellerCustomerId', undefined)

  const resetForm = () => {
    setForm(makeInitialForm())
    setSellerIdCardFront(undefined)
    setSellerIdCardBack(undefined)
    setConditionPhotos([undefined, undefined, undefined, undefined])
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!form.sellerName.trim()) { toast.error('Seller name is required'); return }
    if (!form.imei.trim()) { toast.error('IMEI is required'); return }
    const agreedPrice = Number(form.agreedPrice)
    if (!(agreedPrice > 0)) { toast.error('Agreed price must be greater than 0'); return }
    if (form.paymentMethod === 'wallet' && !form.walletType) { toast.error('Select a wallet'); return }

    try {
      await createBuyback({
        sellerType: form.sellerCustomerId ? 'customer' : 'walkin',
        sellerCustomerId: form.sellerCustomerId,
        sellerName: form.sellerName.trim(),
        sellerPhone: form.sellerPhone.trim() || undefined,
        sellerCNIC: form.sellerCNIC.trim() || undefined,
        sellerIdCardFront,
        sellerIdCardBack,
        imei: form.imei.trim(),
        imei2: form.imei2.trim() || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        color: form.color.trim() || undefined,
        storage: form.storage.trim() || undefined,
        condition: {
          grade: form.grade || undefined,
          screenCondition: (form.screenCondition || undefined) as BuybackCondition['screenCondition'],
          bodyCondition: (form.bodyCondition || undefined) as BuybackCondition['bodyCondition'],
          batteryHealthPct: form.batteryHealthPct ? Number(form.batteryHealthPct) : undefined,
          checklist: form.checklist,
          accessoriesIncluded: form.accessoriesIncluded,
          ptaStatus: form.ptaStatus,
          photos: conditionPhotos.filter((p): p is BuybackPhoto => Boolean(p)),
        },
        agreedPrice,
        askingPrice: form.askingPrice ? Number(form.askingPrice) : undefined,
        paymentMethod: form.paymentMethod,
        walletType: form.paymentMethod === 'wallet' ? form.walletType : undefined,
        buybackDate: form.buybackDate ? parseBusinessDateTimeLocal(form.buybackDate) : undefined,
        isTradeIn: form.isTradeIn,
        notes: form.notes.trim() || undefined,
      }).unwrap()
      toast.success('Phone bought — added to used-phone inventory')
      resetForm()
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to record buyback')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle className='flex items-center gap-2'>
            <ShoppingBag className='h-5 w-5 text-primary' /> Buy Phone
          </DialogTitle>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          {/* Seller */}
          <FormSection icon={<User className='h-4 w-4' />} title='Seller' tone='indigo'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Phone Number</Label>
                <CustomerPhoneAutocomplete
                  placeholder='03xxxxxxxxx'
                  value={form.sellerPhone}
                  onChange={(e) => { setField('sellerPhone', e.target.value); setField('sellerCustomerId', undefined) }}
                  onCustomerSelect={handleCustomerSelect}
                  fieldType='phone'
                  className='bg-background'
                />
              </div>
              <div className='space-y-1'>
                <Label>Seller Name *</Label>
                <Input className='bg-background' placeholder='e.g. Ahmad Khan' value={form.sellerName} onChange={(e) => setField('sellerName', e.target.value)} />
              </div>
            </div>
            {form.sellerCustomerId && (
              <Badge variant='secondary' className='gap-1.5 pr-1'>
                Linked to existing customer
                <button type='button' onClick={clearLinkedCustomer} className='ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5'>
                  <X className='h-3 w-3' />
                </button>
              </Badge>
            )}
            <div className='space-y-1'>
              <Label>CNIC</Label>
              <Input className='bg-background' fieldType='cnic' placeholder='xxxxx-xxxxxxx-x' value={form.sellerCNIC} onChange={(e) => setField('sellerCNIC', e.target.value)} />
            </div>
            <div className='space-y-1'>
              <Label className='text-xs text-muted-foreground'>ID Card Photos</Label>
              <div className='grid grid-cols-2 gap-2'>
                <PhotoSlot photo={sellerIdCardFront} onUpload={setSellerIdCardFront} onRemove={() => setSellerIdCardFront(undefined)} label='ID Front' aspect='aspect-[3/2]' />
                <PhotoSlot photo={sellerIdCardBack} onUpload={setSellerIdCardBack} onRemove={() => setSellerIdCardBack(undefined)} label='ID Back' aspect='aspect-[3/2]' />
              </div>
            </div>
          </FormSection>

          {/* Device */}
          <FormSection icon={<Smartphone className='h-4 w-4' />} title='Device' tone='blue'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>IMEI *</Label>
                <Input className='bg-background' placeholder='15-digit IMEI' value={form.imei} onChange={(e) => setField('imei', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>IMEI 2 (dual SIM)</Label>
                <Input className='bg-background' placeholder='Optional' value={form.imei2} onChange={(e) => setField('imei2', e.target.value)} />
              </div>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Brand</Label>
                <Input className='bg-background' placeholder='e.g. Samsung' value={form.brand} onChange={(e) => setField('brand', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>Model</Label>
                <Input className='bg-background' placeholder='e.g. Galaxy A54' value={form.model} onChange={(e) => setField('model', e.target.value)} />
              </div>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Color</Label>
                <Input className='bg-background' placeholder='e.g. Black' value={form.color} onChange={(e) => setField('color', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>Storage</Label>
                <Input className='bg-background' placeholder='e.g. 128GB' value={form.storage} onChange={(e) => setField('storage', e.target.value)} />
              </div>
            </div>
          </FormSection>

          {/* Condition & Grading */}
          <FormSection icon={<ClipboardCheck className='h-4 w-4' />} title='Condition & Grading' tone='purple'>
            <div className='space-y-1.5'>
              <Label>Grade</Label>
              <div className='grid grid-cols-4 gap-2'>
                {GRADE_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type='button'
                    onClick={() => setField('grade', o.value)}
                    className={cn(
                      'rounded-lg border-2 py-2 text-center transition-colors',
                      form.grade === o.value ? gradeToneClasses[o.value] : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    <div className='text-base font-bold'>{o.label}</div>
                    <div className='text-[10px]'>{o.hint}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label>Screen Condition</Label>
                <ChipSelect options={SCREEN_CONDITION_OPTIONS} value={form.screenCondition} onChange={(v) => setField('screenCondition', v)} />
              </div>
              <div className='space-y-1.5'>
                <Label>Body Condition</Label>
                <ChipSelect options={BODY_CONDITION_OPTIONS} value={form.bodyCondition} onChange={(v) => setField('bodyCondition', v)} />
              </div>
            </div>

            <div className='space-y-1'>
              <Label>Battery Health (%)</Label>
              <Input className='bg-background' type='number' min='0' max='100' placeholder='e.g. 88' value={form.batteryHealthPct} onChange={(e) => setField('batteryHealthPct', e.target.value)} />
            </div>

            <div className='space-y-1.5'>
              <Label className='text-xs text-muted-foreground'>Functional Checklist</Label>
              <div className='flex flex-wrap gap-1.5'>
                {CHECKLIST_FIELDS.map(({ key, label }) => {
                  const ok = form.checklist[key] ?? true
                  return (
                    <button
                      key={key}
                      type='button'
                      onClick={() => toggleChecklist(key, !ok)}
                      className={cn(
                        'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        ok ? 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400' : 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
                      )}
                    >
                      {ok ? <Check className='h-3 w-3' /> : <X className='h-3 w-3' />}
                      {label}
                    </button>
                  )
                })}
                <button
                  type='button'
                  onClick={() => toggleChecklist('waterDamage', !(form.checklist.waterDamage ?? false))}
                  className={cn(
                    'flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    form.checklist.waterDamage ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400' : 'border-green-300 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
                  )}
                >
                  {form.checklist.waterDamage ? <ShieldAlert className='h-3 w-3' /> : <ShieldCheck className='h-3 w-3' />}
                  {form.checklist.waterDamage ? 'Water damage' : 'No water damage'}
                </button>
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label className='text-xs text-muted-foreground'>Accessories Included</Label>
              <div className='flex flex-wrap gap-1.5'>
                {ACCESSORY_OPTIONS.map((o) => {
                  const active = form.accessoriesIncluded.includes(o.value)
                  return (
                    <button
                      key={o.value}
                      type='button'
                      onClick={() => toggleAccessory(o.value, !active)}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                        active ? 'border-indigo-400 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-400' : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {o.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label>PTA Status</Label>
              <div className='flex flex-wrap gap-1.5'>
                {PTA_OPTIONS.map((o) => (
                  <button
                    key={o.value}
                    type='button'
                    onClick={() => setField('ptaStatus', o.value)}
                    className={cn(
                      'rounded-full border-2 px-2.5 py-1 text-xs font-medium transition-colors',
                      form.ptaStatus === o.value ? ptaToneClasses[o.value] : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
              {form.ptaStatus === 'blocked' && (
                <p className='flex items-center gap-1.5 text-xs text-destructive mt-1'>
                  <ShieldAlert className='h-3.5 w-3.5' /> This IMEI is PTA-blocked — it cannot be used on local networks. Price accordingly.
                </p>
              )}
            </div>

            <div className='space-y-1.5'>
              <Label className='text-xs text-muted-foreground'>Device Photos</Label>
              <div className='grid grid-cols-2 sm:grid-cols-4 gap-2'>
                {conditionPhotos.map((photo, idx) => (
                  <PhotoSlot
                    key={idx}
                    photo={photo}
                    onUpload={(img) => setConditionPhotos((prev) => prev.map((p, i) => (i === idx ? img : p)))}
                    onRemove={() => setConditionPhotos((prev) => prev.map((p, i) => (i === idx ? undefined : p)))}
                    label={`Photo ${idx + 1}`}
                  />
                ))}
              </div>
            </div>
          </FormSection>

          {/* Pricing & Payment */}
          <FormSection icon={<Banknote className='h-4 w-4' />} title='Pricing & Payment' tone='emerald'>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Agreed Price (Rs) *</Label>
                <Input className='bg-background' type='number' min='0' step='1' value={form.agreedPrice} onChange={(e) => setField('agreedPrice', e.target.value)} />
              </div>
              <div className='space-y-1'>
                <Label>Asking / Resale Price (Rs)</Label>
                <Input className='bg-background' type='number' min='0' step='1' placeholder='Optional' value={form.askingPrice} onChange={(e) => setField('askingPrice', e.target.value)} />
              </div>
            </div>
            <div className='grid gap-3 sm:grid-cols-2'>
              <div className='space-y-1'>
                <Label>Payment Method</Label>
                <Select
                  value={form.paymentMethod === 'wallet' && form.walletType ? toWalletOptionValue(form.walletType) : form.paymentMethod}
                  onValueChange={(v) => {
                    if (isWalletOptionValue(v)) {
                      setForm((prev) => ({ ...prev, paymentMethod: 'wallet', walletType: getWalletTypeFromOptionValue(v) }))
                    } else {
                      setForm((prev) => ({ ...prev, paymentMethod: v as 'cash' | 'bank', walletType: '' }))
                    }
                  }}
                >
                  <SelectTrigger className='bg-background'><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {paymentMethodOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1'>
                <Label>Date / Time</Label>
                <Input className='bg-background' type='datetime-local' value={form.buybackDate} onChange={(e) => setField('buybackDate', e.target.value)} />
              </div>
            </div>
            <label className='flex items-center gap-2 text-sm'>
              <Checkbox checked={form.isTradeIn} onCheckedChange={(c) => setField('isTradeIn', Boolean(c))} />
              This is a trade-in toward a new phone sale
            </label>
            <div className='space-y-1'>
              <Label>Notes</Label>
              <Textarea className='bg-background' rows={2} placeholder='Optional notes' value={form.notes} onChange={(e) => setField('notes', e.target.value)} />
            </div>
          </FormSection>

          <Button disabled={isSaving} type='submit' className='w-full h-11 text-base'>
            {isSaving ? 'Saving...' : 'Buy Phone'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}


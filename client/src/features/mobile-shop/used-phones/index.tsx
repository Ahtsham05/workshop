import { useMemo, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import {
  Smartphone, Search, ShieldCheck, ShieldAlert, PackageCheck, Wallet as WalletIcon,
  TrendingUp, Trash2, ChevronRight, X, Check, ImagePlus, Loader2, User, ScanLine,
  ClipboardCheck, Banknote, ShoppingBag, ListFilter, Camera,
} from 'lucide-react'
import CameraCapture from '@/components/camera-capture'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { SimplePagination } from '@/components/ui/simple-pagination'
import { CustomerPhoneAutocomplete, type CustomerSuggestion } from '@/components/ui/customer-phone-autocomplete'
import { MobilePageShell } from '@/features/mobile-shop/components/mobile-page-shell'
import { StatCard } from '@/features/dashboard/components/stat-card'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { cn } from '@/lib/utils'
import { toBusinessDateTimeLocal, parseBusinessDateTimeLocal, formatBusinessDate } from '@/lib/business-timezone'
import {
  buildMergedPaymentOptions, getWalletTypeFromOptionValue, isWalletOptionValue, toWalletOptionValue,
} from '@/lib/wallet-payment-options'
import { useGetWalletsQuery } from '@/stores/mobile-shop.api'
import {
  useCreateBuybackMutation,
  useDeleteBuybackMutation,
  useGetBuybacksQuery,
  useGetUsedPhoneStatsQuery,
  useUpdateBuybackMutation,
  type BuybackAccessory,
  type BuybackChecklist,
  type BuybackCondition,
  type BuybackGrade,
  type BuybackImeiSummary,
  type BuybackPhoto,
  type BuybackPtaStatus,
  type PhoneBuybackRecord,
} from '@/stores/usedPhoneBuyback.api'

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_OPTIONS: { value: BuybackGrade; label: string; hint: string }[] = [
  { value: 'A', label: 'A', hint: 'Like New' },
  { value: 'B', label: 'B', hint: 'Good' },
  { value: 'C', label: 'C', hint: 'Fair' },
  { value: 'D', label: 'D', hint: 'For Parts' },
]

const gradeToneClasses: Record<BuybackGrade, string> = {
  A: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  B: 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400',
  C: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  D: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
}

const gradeBadgeClasses: Record<BuybackGrade, string> = {
  A: 'bg-green-100 text-green-700',
  B: 'bg-blue-100 text-blue-700',
  C: 'bg-amber-100 text-amber-700',
  D: 'bg-red-100 text-red-700',
}

const SCREEN_CONDITION_OPTIONS = ['excellent', 'good', 'fair', 'poor', 'cracked'] as const
const BODY_CONDITION_OPTIONS = ['excellent', 'good', 'fair', 'poor'] as const

const ACCESSORY_OPTIONS: { value: BuybackAccessory; label: string }[] = [
  { value: 'box', label: 'Box' },
  { value: 'charger', label: 'Charger' },
  { value: 'original_bill', label: 'Original Bill' },
  { value: 'earphones', label: 'Earphones' },
  { value: 'back_cover', label: 'Back Cover' },
]

const PTA_OPTIONS: { value: BuybackPtaStatus; label: string }[] = [
  { value: 'unknown', label: 'Not Checked' },
  { value: 'approved', label: 'PTA Approved' },
  { value: 'non_pta', label: 'Non-PTA' },
  { value: 'blocked', label: 'Blocked' },
]

const ptaToneClasses: Record<BuybackPtaStatus, string> = {
  approved: 'border-green-500 bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-400',
  non_pta: 'border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400',
  blocked: 'border-red-500 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-400',
  unknown: 'border-gray-400 bg-gray-50 text-gray-600 dark:bg-gray-900/40 dark:text-gray-400',
}

const ptaBadgeConfig: Record<BuybackPtaStatus, { label: string; color: string }> = {
  approved: { label: 'PTA Approved', color: 'bg-green-100 text-green-700' },
  non_pta: { label: 'Non-PTA', color: 'bg-amber-100 text-amber-700' },
  blocked: { label: 'Blocked', color: 'bg-red-100 text-red-700' },
  unknown: { label: 'Not Checked', color: 'bg-gray-100 text-gray-600' },
}

const statusBadgeConfig: Record<string, { label: string; color: string }> = {
  in_stock: { label: 'In Stock', color: 'bg-sky-100 text-sky-700' },
  sold: { label: 'Sold', color: 'bg-green-100 text-green-700' },
  returned: { label: 'Returned', color: 'bg-amber-100 text-amber-700' },
  scrapped: { label: 'Scrapped', color: 'bg-gray-100 text-gray-600' },
  lost: { label: 'Lost', color: 'bg-orange-100 text-orange-700' },
  stolen: { label: 'Stolen', color: 'bg-red-100 text-red-700' },
}

const CHECKLIST_FIELDS: { key: keyof BuybackChecklist; label: string }[] = [
  { key: 'touchScreen', label: 'Touch screen' },
  { key: 'camera', label: 'Camera' },
  { key: 'speaker', label: 'Speaker' },
  { key: 'microphone', label: 'Microphone' },
  { key: 'buttons', label: 'Buttons' },
  { key: 'biometrics', label: 'Face ID / Fingerprint' },
  { key: 'charging', label: 'Charging' },
]

const fmtAmt = (n?: number) => `Rs ${(n ?? 0).toLocaleString()}`

/** The list/detail endpoints populate imeiRecordId; the raw create response won't be. */
const getImeiSummary = (b: PhoneBuybackRecord): BuybackImeiSummary | null =>
  typeof b.imeiRecordId === 'object' && b.imeiRecordId !== null ? b.imeiRecordId : null

const daysSince = (date: string) => Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24)))

// ─── Small building blocks ─────────────────────────────────────────────────────

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

// ─── Form state ───────────────────────────────────────────────────────────────

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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function UsedPhonesPage() {
  const [form, setForm] = useState<FormState>(makeInitialForm)
  const [sellerIdCardFront, setSellerIdCardFront] = useState<BuybackPhoto | undefined>()
  const [sellerIdCardBack, setSellerIdCardBack] = useState<BuybackPhoto | undefined>()
  const [conditionPhotos, setConditionPhotos] = useState<(BuybackPhoto | undefined)[]>([undefined, undefined, undefined, undefined])

  const [search, setSearch] = useState('')
  const debouncedSearch = useDebouncedValue(search, 400)
  const [statusTab, setStatusTab] = useState<'all' | 'in_stock' | 'sold'>('all')
  const [page, setPage] = useState(1)
  const [limit, setLimit] = useState(10)

  const [detailBuyback, setDetailBuyback] = useState<PhoneBuybackRecord | null>(null)
  const [askingPriceDraft, setAskingPriceDraft] = useState('')
  const [deleteConfirm, setDeleteConfirm] = useState<PhoneBuybackRecord | null>(null)

  const { data: stats, isLoading: isStatsLoading } = useGetUsedPhoneStatsQuery()
  const { data, isLoading: isListLoading } = useGetBuybacksQuery({ search: debouncedSearch || undefined, page, limit })
  const { data: walletsData } = useGetWalletsQuery()
  const wallets = walletsData?.results?.filter((w) => w.isActive) ?? []
  const basePaymentMethods = [{ value: 'cash', label: 'Cash' }, { value: 'bank', label: 'Bank Transfer' }]
  // Buying a used phone is money-out — show wallet balances so staff can see what's available.
  const paymentMethodOptions = buildMergedPaymentOptions(basePaymentMethods, wallets, true)

  const [createBuyback, { isLoading: isSaving }] = useCreateBuybackMutation()
  const [updateBuyback, { isLoading: isUpdating }] = useUpdateBuybackMutation()
  const [deleteBuyback, { isLoading: isDeleting }] = useDeleteBuybackMutation()

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
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to record buyback')
    }
  }

  const openDetail = (buyback: PhoneBuybackRecord) => {
    setDetailBuyback(buyback)
    setAskingPriceDraft(String(getImeiSummary(buyback)?.askingPrice ?? buyback.askingPrice ?? ''))
  }

  const handleSaveAskingPrice = async () => {
    if (!detailBuyback) return
    try {
      await updateBuyback({ id: detailBuyback.id, askingPrice: Number(askingPriceDraft) || 0 }).unwrap()
      toast.success('Asking price updated')
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to update asking price')
    }
  }

  const handleDelete = async () => {
    if (!deleteConfirm) return
    try {
      await deleteBuyback(deleteConfirm.id).unwrap()
      toast.success('Buyback deleted')
      setDeleteConfirm(null)
      setDetailBuyback(null)
    } catch (err) {
      const message = (err as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to delete — a sold unit cannot be removed')
    }
  }

  const filteredByTab = useMemo(() => {
    if (statusTab === 'all') return data?.results ?? []
    return (data?.results ?? []).filter((b) => (getImeiSummary(b)?.status ?? 'in_stock') === statusTab)
  }, [data?.results, statusTab])

  const detailImei = detailBuyback ? getImeiSummary(detailBuyback) : null
  const detailIsSold = detailImei ? detailImei.status !== 'in_stock' : false

  return (
    <MobilePageShell
      title='Used Phones'
      description='Buy old/used mobile phones from customers and walk-in sellers, grade their condition, and track them through to resale.'
    >
      {/* ── Stats ── */}
      <div className='grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 mb-6'>
        <StatCard title='In Stock' value={stats?.in_stock ?? 0} description='Bought, not yet sold' icon={<PackageCheck />} tone='sky' isLoading={isStatsLoading} />
        <StatCard title='Sold' value={stats?.sold ?? 0} description='Resold to customers' icon={<Smartphone />} tone='emerald' isLoading={isStatsLoading} />
        <StatCard title='Capital in Stock' value={fmtAmt(stats?.capitalInStock)} description='Tied up in unsold units' icon={<WalletIcon />} tone='amber' isLoading={isStatsLoading} />
        <StatCard title='Realized Profit' value={fmtAmt(stats?.soldProfit)} description='On units sold so far' icon={<TrendingUp />} tone='emerald' isLoading={isStatsLoading} />
      </div>

      <div className='grid gap-6 xl:grid-cols-[520px_1fr] items-start'>
        {/* ── Buy Phone Form ── */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <ShoppingBag className='h-5 w-5 text-primary' /> Buy Phone
            </CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {/* ── Inventory ── */}
        <Card className='flex flex-col'>
          <CardHeader className='flex flex-row items-center justify-between gap-4 flex-wrap'>
            <CardTitle className='flex items-center gap-2'>
              <ListFilter className='h-5 w-5 text-primary' /> Used Phone Inventory
            </CardTitle>
            <div className='relative w-full sm:w-64'>
              <Search className='absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none' />
              <Input
                placeholder='Search seller, IMEI, brand, model...'
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                className='pl-8 h-9'
              />
            </div>
          </CardHeader>
          <CardContent className='flex-1 overflow-auto'>
            <Tabs value={statusTab} onValueChange={(v) => setStatusTab(v as typeof statusTab)} className='mb-4'>
              <TabsList>
                <TabsTrigger value='all'>All</TabsTrigger>
                <TabsTrigger value='in_stock'>In Stock</TabsTrigger>
                <TabsTrigger value='sold'>Sold</TabsTrigger>
              </TabsList>
            </Tabs>

            {isListLoading ? (
              <div className='space-y-3'>
                {Array.from({ length: 5 }).map((_, i) => <div key={i} className='h-14 rounded-lg bg-muted animate-pulse' />)}
              </div>
            ) : filteredByTab.length === 0 ? (
              <div className='flex flex-col items-center justify-center py-16 text-muted-foreground'>
                <Smartphone className='h-12 w-12 mb-3 opacity-30' />
                <p className='text-base font-medium'>No used phones found</p>
                <p className='text-sm'>Buy your first phone using the form on the left</p>
              </div>
            ) : (
              <>
                {/* Card list — phones/small tablets, avoids horizontal table scrolling */}
                <div className='md:hidden space-y-2'>
                  {filteredByTab.map((b) => {
                    const summary = getImeiSummary(b)
                    const status = summary?.status ?? 'in_stock'
                    const grade = summary?.condition?.grade
                    const pta = summary?.condition?.ptaStatus ?? 'unknown'
                    return (
                      <button
                        key={b.id}
                        type='button'
                        onClick={() => openDetail(b)}
                        className='w-full rounded-lg border bg-background p-3 text-left transition-colors hover:bg-muted/30 active:bg-muted/50'
                      >
                        <div className='flex items-start justify-between gap-2'>
                          <div className='min-w-0'>
                            <div className='font-medium truncate'>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</div>
                            <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'>
                              <ScanLine className='h-3 w-3 shrink-0' />{b.imei}
                            </div>
                          </div>
                          <Badge className={cn('text-xs shrink-0', statusBadgeConfig[status]?.color)}>{statusBadgeConfig[status]?.label ?? status}</Badge>
                        </div>
                        <div className='mt-1.5 text-sm text-muted-foreground truncate'>
                          {b.sellerName}{b.sellerPhone ? ` · ${b.sellerPhone}` : ''}
                        </div>
                        <div className='mt-2 flex flex-wrap items-center gap-1.5'>
                          {grade && <Badge className={cn('text-xs font-bold', gradeBadgeClasses[grade])}>{grade}</Badge>}
                          <Badge className={cn('text-xs', ptaBadgeConfig[pta].color)}>{ptaBadgeConfig[pta].label}</Badge>
                          {status === 'in_stock' && <span className='text-xs text-muted-foreground'>{daysSince(b.buybackDate)}d in stock</span>}
                        </div>
                        <div className='mt-2 flex items-center justify-between'>
                          <div className='font-semibold'>{fmtAmt(b.agreedPrice)}</div>
                          {(summary?.askingPrice ?? b.askingPrice) ? (
                            <div className='text-xs text-muted-foreground'>Ask {fmtAmt(summary?.askingPrice ?? b.askingPrice)}</div>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>

                {/* Table — tablets and up */}
                <div className='hidden md:block overflow-x-auto'>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Device</TableHead>
                      <TableHead>Seller</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>PTA</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredByTab.map((b) => {
                      const summary = getImeiSummary(b)
                      const status = summary?.status ?? 'in_stock'
                      const grade = summary?.condition?.grade
                      const pta = summary?.condition?.ptaStatus ?? 'unknown'
                      return (
                        <TableRow key={b.id} className='cursor-pointer hover:bg-muted/30' onClick={() => openDetail(b)}>
                          <TableCell>
                            <div className='font-medium whitespace-nowrap'>{[b.brand, b.model].filter(Boolean).join(' ') || '—'}</div>
                            <div className='text-xs text-muted-foreground font-mono flex items-center gap-1'><ScanLine className='h-3 w-3' />{b.imei}</div>
                          </TableCell>
                          <TableCell>
                            <div className='whitespace-nowrap'>{b.sellerName}</div>
                            <div className='text-xs text-muted-foreground'>{b.sellerPhone || '—'}</div>
                          </TableCell>
                          <TableCell>
                            {grade ? <Badge className={cn('text-xs font-bold', gradeBadgeClasses[grade])}>{grade}</Badge> : <span className='text-muted-foreground'>—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${ptaBadgeConfig[pta].color}`}>{ptaBadgeConfig[pta].label}</Badge>
                          </TableCell>
                          <TableCell className='whitespace-nowrap'>
                            <div className='font-medium'>{fmtAmt(b.agreedPrice)}</div>
                            {(summary?.askingPrice ?? b.askingPrice) ? (
                              <div className='text-xs text-muted-foreground'>Ask {fmtAmt(summary?.askingPrice ?? b.askingPrice)}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${statusBadgeConfig[status]?.color}`}>{statusBadgeConfig[status]?.label ?? status}</Badge>
                            {status === 'in_stock' && (
                              <div className='text-xs text-muted-foreground mt-0.5'>{daysSince(b.buybackDate)}d in stock</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button size='icon' variant='ghost' className='h-8 w-8'>
                              <ChevronRight className='h-4 w-4' />
                            </Button>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
                </div>
              </>
            )}
            <SimplePagination
              currentPage={page}
              totalPages={data?.totalPages ?? 1}
              totalResults={data?.totalResults}
              limit={limit}
              onPageChange={setPage}
              onLimitChange={(l) => { setLimit(l); setPage(1) }}
              className='mt-3'
            />
          </CardContent>
        </Card>
      </div>

      {/* ── Detail Dialog ── */}
      <Dialog open={!!detailBuyback} onOpenChange={(open) => !open && setDetailBuyback(null)}>
        <DialogContent className='max-w-2xl max-h-[90vh] overflow-y-auto'>
          {detailBuyback && (
            <>
              <DialogHeader>
                <DialogTitle className='flex items-center gap-2 flex-wrap'>
                  <Smartphone className='h-5 w-5 text-primary' />
                  {[detailBuyback.brand, detailBuyback.model].filter(Boolean).join(' ') || 'Used Phone'}
                  <span className='font-mono text-sm text-muted-foreground'>{detailBuyback.imei}</span>
                  {detailImei && (
                    <Badge className={`text-xs font-sans ${statusBadgeConfig[detailImei.status]?.color}`}>
                      {statusBadgeConfig[detailImei.status]?.label}
                    </Badge>
                  )}
                </DialogTitle>
              </DialogHeader>

              {detailImei?.condition?.ptaStatus === 'blocked' && (
                <div className='flex items-center gap-2 rounded-md bg-red-50 border border-red-200 p-2.5 text-sm text-red-700'>
                  <ShieldAlert className='h-4 w-4 flex-shrink-0' /> This IMEI is PTA-blocked.
                </div>
              )}

              <div className='grid gap-4 sm:grid-cols-2'>
                <div className='space-y-3'>
                  <DetailRow label='Seller' value={detailBuyback.sellerName} />
                  <DetailRow label='Seller Phone' value={detailBuyback.sellerPhone || '—'} />
                  <DetailRow label='Seller CNIC' value={detailBuyback.sellerCNIC || '—'} />
                  <DetailRow label='Color / Storage' value={[detailBuyback.color, detailBuyback.storage].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Bought On' value={formatBusinessDate(detailBuyback.buybackDate)} />
                  <DetailRow label='Payment' value={`${detailBuyback.paymentMethod}${detailBuyback.walletType ? ` (${detailBuyback.walletType})` : ''}`} />
                </div>
                <div className='space-y-3'>
                  <DetailRow label='Grade' value={detailImei?.condition?.grade ? GRADE_OPTIONS.find((g) => g.value === detailImei.condition?.grade)?.hint ?? detailImei.condition.grade : '—'} />
                  <DetailRow label='Screen / Body' value={[detailImei?.condition?.screenCondition, detailImei?.condition?.bodyCondition].filter(Boolean).join(' · ') || '—'} />
                  <DetailRow label='Battery Health' value={detailImei?.condition?.batteryHealthPct != null ? `${detailImei.condition.batteryHealthPct}%` : '—'} />
                  <DetailRow label='PTA Status' value={ptaBadgeConfig[detailImei?.condition?.ptaStatus ?? 'unknown'].label} />
                  <DetailRow label='Agreed Price' value={fmtAmt(detailBuyback.agreedPrice)} />
                  {detailImei?.status === 'sold' && (
                    <DetailRow label='Sold Price' value={fmtAmt(detailImei.salePrice)} />
                  )}
                </div>
              </div>

              {detailImei?.condition?.accessoriesIncluded && detailImei.condition.accessoriesIncluded.length > 0 && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Accessories Included</Label>
                  <div className='flex flex-wrap gap-1.5 mt-1'>
                    {detailImei.condition.accessoriesIncluded.map((a) => (
                      <Badge key={a} variant='secondary' className='text-xs'>{ACCESSORY_OPTIONS.find((o) => o.value === a)?.label ?? a}</Badge>
                    ))}
                  </div>
                </div>
              )}

              {detailImei?.condition?.checklist && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Functional Checklist</Label>
                  <div className='flex flex-wrap gap-1.5 mt-1'>
                    {CHECKLIST_FIELDS.map(({ key, label }) => {
                      const ok = detailImei.condition?.checklist?.[key] ?? true
                      return (
                        <Badge key={key} className={`text-xs ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                          {ok ? <ShieldCheck className='h-3 w-3 mr-1' /> : <ShieldAlert className='h-3 w-3 mr-1' />}{label}
                        </Badge>
                      )
                    })}
                    {detailImei.condition?.checklist?.waterDamage && (
                      <Badge className='text-xs bg-red-100 text-red-700'><ShieldAlert className='h-3 w-3 mr-1' />Water damage</Badge>
                    )}
                  </div>
                </div>
              )}

              {detailImei?.condition?.photos && detailImei.condition.photos.length > 0 && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Device Photos</Label>
                  <div className='grid grid-cols-2 sm:grid-cols-4 gap-2 mt-1'>
                    {detailImei.condition.photos.map((p, i) => (
                      <img key={i} src={p.url} alt={`Device photo ${i + 1}`} className='rounded-md border aspect-square object-cover' />
                    ))}
                  </div>
                </div>
              )}

              {(detailBuyback.sellerIdCardFront?.url || detailBuyback.sellerIdCardBack?.url) && (
                <div>
                  <Label className='text-xs text-muted-foreground'>Seller ID Card</Label>
                  <div className='grid grid-cols-2 gap-2 mt-1'>
                    {detailBuyback.sellerIdCardFront?.url && <img src={detailBuyback.sellerIdCardFront.url} alt='ID front' className='rounded-md border object-cover' />}
                    {detailBuyback.sellerIdCardBack?.url && <img src={detailBuyback.sellerIdCardBack.url} alt='ID back' className='rounded-md border object-cover' />}
                  </div>
                </div>
              )}

              {detailBuyback.notes && (
                <div className='text-sm text-muted-foreground bg-muted/50 rounded p-3'>
                  <strong>Notes:</strong> {detailBuyback.notes}
                </div>
              )}

              {!detailIsSold && (
                <div className='flex items-end gap-2 rounded-md border p-3'>
                  <div className='flex-1 space-y-1'>
                    <Label>Asking / Resale Price (Rs)</Label>
                    <Input type='number' min='0' step='1' value={askingPriceDraft} onChange={(e) => setAskingPriceDraft(e.target.value)} />
                  </div>
                  <Button disabled={isUpdating} onClick={handleSaveAskingPrice}>
                    {isUpdating ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              )}

              <DialogFooter className='sm:justify-between'>
                {!detailIsSold ? (
                  <Button variant='outline' className='text-destructive border-destructive/30 hover:bg-destructive/10' onClick={() => setDeleteConfirm(detailBuyback)}>
                    <Trash2 className='h-4 w-4 mr-1.5' /> Delete
                  </Button>
                ) : <span />}
                <Button variant='outline' onClick={() => setDetailBuyback(null)}>Close</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete Confirm ── */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this buyback?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the unit from inventory, reverse the {fmtAmt(deleteConfirm?.agreedPrice)} payment from Cash Book/Wallet,
              and delete its IMEI record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className='bg-destructive hover:bg-destructive/90'>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MobilePageShell>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className='flex flex-col'>
      <span className='text-xs text-muted-foreground'>{label}</span>
      <span className='text-sm font-medium'>{value}</span>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import {
  ChevronDown,
  History,
  Lock,
  Printer,
  ShieldCheck,
  Tag,
  Wrench,
} from 'lucide-react'
import { toast } from 'sonner'
import {
  useCreateRepairJobMutation,
  useGetRepairHistoryQuery,
  type RepairDeviceType,
  type RepairJobRecord,
  type RepairPriority,
} from '@/stores/mobile-shop.api'
import {
  formatBusinessDate,
  parseBusinessDateTimeLocal,
  toBusinessDateTimeLocal,
} from '@/lib/business-timezone'
import { formatMoneyWithMeta, useCurrencyMeta } from '@/lib/format-money'
import { makeEnterChain, useCtrlEnterSubmit } from '@/lib/mobile-form-keyboard'
import { cn } from '@/lib/utils'
import { useStateDraft } from '@/hooks/use-form-draft'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { CustomerPhoneAutocomplete } from '@/components/ui/customer-phone-autocomplete'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { SalesmanField } from '@/components/salesman-field'
import {
  DEVICE_TYPES,
  PRIORITY_META,
  deviceMeta,
  statusMeta,
} from '../lib/repair-meta'
import { ChipGroup } from './chip-group'
import { PaymentMethodSelect } from './payment-method-select'
import { TechnicianPicker } from './technician-picker'

type IntakeState = {
  deviceType: RepairDeviceType
  customerName: string
  phone: string
  brand: string
  deviceModel: string
  serialNumber: string
  color: string
  problems: string[]
  issue: string
  conditionChecks: string[]
  accessoriesPicked: string[]
  accessoriesOther: string
  lockType: 'none' | 'pin' | 'password' | 'pattern'
  lockCode: string
  technicianId: string
  technician: string
  priority: RepairPriority
  dueDate: string
  warrantyDays: string
  estimatedCharges: string
  advance: string
  paymentMethod: string
  walletType: string
  date: string
  salesmanId: string
}

const blank = (deviceType: RepairDeviceType = 'mobile'): IntakeState => ({
  deviceType,
  customerName: '',
  phone: '',
  brand: '',
  deviceModel: '',
  serialNumber: '',
  color: '',
  problems: [],
  issue: '',
  conditionChecks: [],
  accessoriesPicked: [],
  accessoriesOther: '',
  lockType: 'none',
  lockCode: '',
  technicianId: '',
  technician: '',
  priority: 'normal',
  dueDate: '',
  warrantyDays: '0',
  estimatedCharges: '',
  advance: '',
  paymentMethod: 'cash',
  walletType: '',
  date: toBusinessDateTimeLocal(),
  salesmanId: '',
})

const PREFS_KEY = 'repair-intake-prefs-v2'
type Prefs = { moreOpen: boolean; printCard: boolean; printTag: boolean }
const readPrefs = (): Prefs => {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) || '{}')
    return {
      moreOpen: !!saved.moreOpen,
      printCard: saved.printCard ?? true,
      printTag: !!saved.printTag,
    }
  } catch {
    return { moreOpen: false, printCard: true, printTag: false }
  }
}

const FIELD_ORDER = [
  'ri-customer',
  'ri-phone',
  'ri-brand',
  'ri-model',
  'ri-serial',
  'ri-color',
  'ri-issue',
  'ri-estimate',
  'ri-advance',
]

const WARRANTY_OPTIONS = ['0', '7', '15', '30', '60', '90', '180']

export function IntakeForm({
  onCreated,
}: {
  /** After save — the page prints and opens the job. */
  onCreated: (
    job: RepairJobRecord,
    print: { card: boolean; tag: boolean }
  ) => void
}) {
  const currencyMeta = useCurrencyMeta()
  const fmt = (n: number) => formatMoneyWithMeta(n, currencyMeta)
  const [prefs, setPrefsState] = useState<Prefs>(readPrefs)
  const setPrefs = (patch: Partial<Prefs>) =>
    setPrefsState((prev) => {
      const next = { ...prev, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* private mode — preference just isn't remembered */
      }
      return next
    })

  const [form, setForm] = useState<IntakeState>(() => blank())
  const [showAllProblems, setShowAllProblems] = useState(false)
  const [pickDevice, setPickDevice] = useState(false)
  const set = <K extends keyof IntakeState>(key: K, value: IntakeState[K]) =>
    setForm((p) => ({ ...p, [key]: value }))

  const draft = useStateDraft(
    form as unknown as Record<string, unknown>,
    (v) => setForm({ ...blank(), ...(v as Partial<IntakeState>) }),
    {
      key: 'repair-intake',
      enabled: true,
      label: 'repair job',
      exclude: ['lockCode', 'date'],
    }
  )

  const device = deviceMeta(form.deviceType)
  const [createRepairJob, { isLoading }] = useCreateRepairJobMutation()

  // Earlier jobs for this device / customer — debounced so typing doesn't spam requests.
  const [lookup, setLookup] = useState({ serial: '', phone: '' })
  useEffect(() => {
    const t = window.setTimeout(
      () =>
        setLookup({
          serial: form.serialNumber.trim(),
          phone: form.phone.replace(/\D/g, ''),
        }),
      450
    )
    return () => window.clearTimeout(t)
  }, [form.serialNumber, form.phone])
  const lookupReady = lookup.serial.length >= 4 || lookup.phone.length >= 7
  const { data: history = [] } = useGetRepairHistoryQuery(
    {
      serial: lookup.serial.length >= 4 ? lookup.serial : undefined,
      phone: lookup.phone.length >= 7 ? lookup.phone : undefined,
    },
    { skip: !lookupReady }
  )
  const warrantyHit = history.find((h) => h.sameDevice && h.inWarranty)

  const estimate = Number(form.estimatedCharges) || 0
  const advance = Number(form.advance) || 0

  const enter = useMemo(
    () =>
      makeEnterChain(FIELD_ORDER, {
        onSubmit: () =>
          document
            .querySelector<HTMLFormElement>(
              '[data-mobile-form="repair-intake"]'
            )
            ?.requestSubmit(),
      }),
    []
  )
  useCtrlEnterSubmit(
    () =>
      document
        .querySelector<HTMLFormElement>('[data-mobile-form="repair-intake"]')
        ?.requestSubmit(),
    isLoading
  )
  useEffect(() => {
    window.setTimeout(() => enter.focusFirst(), 80)
  }, [enter])

  const switchDevice = (t: RepairDeviceType) => {
    setPickDevice(false)
    setShowAllProblems(false)
    // Picks that belong to the old device type no longer mean anything.
    setForm((p) => ({
      ...p,
      deviceType: t,
      problems: [],
      conditionChecks: [],
      accessoriesPicked: [],
      brand: p.brand,
    }))
  }

  const reset = () => {
    // Every new job starts as a mobile again.
    setForm(blank())
    setPickDevice(false)
    setShowAllProblems(false)
    draft.clear()
    window.setTimeout(() => enter.focusFirst(), 50)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const issue = form.issue.trim() || form.problems.join(', ')
    if (!form.customerName.trim()) return toast.error('Enter the customer name')
    if (!form.deviceModel.trim()) return toast.error('Enter the device model')
    if (!issue) return toast.error('Pick a problem or describe the fault')
    if (advance > 0 && estimate > 0 && advance > estimate)
      return toast.error('Advance is more than the estimate')

    const accessories = [
      ...form.accessoriesPicked,
      form.accessoriesOther.trim(),
    ]
      .filter(Boolean)
      .join(', ')
    try {
      const created = await createRepairJob({
        // Straight into repair — the shop doesn't track Received / Diagnosing as steps.
        status: 'in_progress',
        deviceType: form.deviceType,
        customerName: form.customerName.trim(),
        phone: form.phone.trim(),
        brand: form.brand.trim(),
        deviceModel: form.deviceModel.trim(),
        serialNumber: form.serialNumber.trim(),
        color: form.color.trim(),
        accessories,
        problems: form.problems,
        issue,
        conditionChecks: form.conditionChecks,
        lockType: device.hasLock ? form.lockType : 'none',
        lockCode:
          device.hasLock && form.lockType !== 'none'
            ? form.lockCode.trim()
            : '',
        technicianId: form.technicianId || undefined,
        technician: form.technicianId
          ? undefined
          : form.technician.trim() || undefined,
        priority: form.priority,
        dueDate: form.dueDate
          ? parseBusinessDateTimeLocal(`${form.dueDate}T18:00`)
          : undefined,
        warrantyDays: Number(form.warrantyDays) || 0,
        estimatedCharges: estimate,
        advance:
          advance > 0
            ? {
                amount: advance,
                paymentMethod: form.paymentMethod,
                walletType: form.walletType || undefined,
              }
            : undefined,
        date: form.date ? parseBusinessDateTimeLocal(form.date) : undefined,
        salesmanId: form.salesmanId || undefined,
      }).unwrap()
      toast.success(`Job ${created.jobNumber ?? ''} created`)
      onCreated(created, { card: prefs.printCard, tag: prefs.printTag })
      reset()
    } catch (error: unknown) {
      const message = (error as { data?: { message?: string } })?.data?.message
      toast.error(message || 'Failed to create repair job')
    }
  }

  const isMobile = form.deviceType === 'mobile'
  const DeviceIcon = device.icon
  const problemOptions = showAllProblems
    ? device.problems
    : device.problems.slice(0, 8)
  // What's already filled under "More details" — shown on the collapsed bar.
  const moreSummary = [
    form.conditionChecks.length && 'condition',
    (form.accessoriesPicked.length || form.accessoriesOther.trim()) &&
      'accessories',
    form.lockType !== 'none' && 'lock',
    form.priority !== 'normal' && form.priority,
    form.dueDate && 'due date',
    form.warrantyDays !== '0' && 'warranty',
    form.salesmanId && 'salesman',
  ].filter(Boolean) as string[]

  return (
    <Card className='gap-0 overflow-hidden py-0'>
      <div className='bg-primary text-primary-foreground flex items-center justify-between gap-2 px-4 py-3'>
        <h2 className='flex items-center gap-2 text-base font-semibold'>
          <Wrench className='h-4 w-4' aria-hidden /> New Repair Job
        </h2>
        {!isMobile && (
          <span className='inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-xs font-medium'>
            <DeviceIcon className='h-3.5 w-3.5' aria-hidden /> {device.label}
          </span>
        )}
      </div>
      <CardContent className='p-4'>
        <form
          data-mobile-form='repair-intake'
          className='grid gap-4'
          onSubmit={handleSubmit}
        >
          {draft.restoredAt && (
            <div className='bg-muted flex items-center justify-between gap-2 rounded-md px-3 py-2 text-xs'>
              <span>Unsaved job restored.</span>
              <button
                type='button'
                className='text-primary font-medium hover:underline'
                onClick={() => {
                  draft.discard()
                  reset()
                }}
              >
                Clear
              </button>
            </div>
          )}

          {/* Customer */}
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='ri-customer'>Customer name *</Label>
              <Input
                id='ri-customer'
                placeholder='e.g. Ahmad Khan'
                value={form.customerName}
                onChange={(e) => set('customerName', e.target.value)}
                {...enter.enterProps('ri-customer')}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='ri-phone'>Phone</Label>
              <CustomerPhoneAutocomplete
                id='ri-phone'
                placeholder='03xxxxxxxxx'
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                onCustomerSelect={(c) =>
                  setForm((p) => ({
                    ...p,
                    phone: c.phone || p.phone,
                    customerName: c.name || p.customerName,
                  }))
                }
                searchRepairRecords
                searchSimSaleRecords
                searchInstallmentRecords
                searchServiceRecords
                searchLoadSaleRecords
                {...enter.enterProps('ri-phone')}
              />
            </div>
          </div>

          {/* Device */}
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            <div className='space-y-1'>
              <Label htmlFor='ri-brand'>Brand</Label>
              <Input
                id='ri-brand'
                list='ri-brand-list'
                placeholder={
                  device.brands[0] ? `e.g. ${device.brands[0]}` : 'Brand'
                }
                value={form.brand}
                onChange={(e) => set('brand', e.target.value)}
                {...enter.enterProps('ri-brand')}
              />
              <datalist id='ri-brand-list'>
                {device.brands.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            </div>
            <div className='space-y-1'>
              <Label htmlFor='ri-model'>Model *</Label>
              <Input
                id='ri-model'
                placeholder={
                  isMobile
                    ? 'e.g. Galaxy A54'
                    : form.deviceType === 'laptop'
                      ? 'e.g. Latitude 5490'
                      : 'Model'
                }
                value={form.deviceModel}
                onChange={(e) => set('deviceModel', e.target.value)}
                {...enter.enterProps('ri-model')}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='ri-serial'>{device.serialLabel}</Label>
              <Input
                id='ri-serial'
                placeholder={device.serialLabel}
                inputMode={isMobile ? 'numeric' : undefined}
                value={form.serialNumber}
                onChange={(e) => set('serialNumber', e.target.value)}
                showVoiceInput={false}
                {...enter.enterProps('ri-serial')}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='ri-color'>Color</Label>
              <Input
                id='ri-color'
                placeholder='e.g. Black'
                value={form.color}
                onChange={(e) => set('color', e.target.value)}
                {...enter.enterProps('ri-color')}
              />
            </div>
          </div>

          {/* Seen before */}
          {history.length > 0 && (
            <div
              className={cn(
                'rounded-lg border p-3 text-sm',
                warrantyHit
                  ? 'border-emerald-500/50 bg-emerald-500/10'
                  : 'bg-muted/50'
              )}
            >
              <div className='mb-1.5 flex items-center gap-1.5 font-medium'>
                {warrantyHit ? (
                  <ShieldCheck
                    className='h-4 w-4 text-emerald-600'
                    aria-hidden
                  />
                ) : (
                  <History className='h-4 w-4' aria-hidden />
                )}
                {warrantyHit
                  ? `Under repair warranty until ${formatBusinessDate(warrantyHit.warrantyUntil!)}`
                  : 'Seen before'}
              </div>
              <ul className='space-y-1'>
                {history.slice(0, 3).map((h) => (
                  <li
                    key={h.id}
                    className='flex flex-wrap items-center gap-x-2 text-xs'
                  >
                    <span className='font-mono font-medium'>
                      {h.jobNumber ?? '—'}
                    </span>
                    <span className='text-muted-foreground'>
                      {formatBusinessDate(h.date)}
                    </span>
                    <span>
                      {[h.brand, h.deviceModel].filter(Boolean).join(' ')}
                    </span>
                    <span className='text-muted-foreground truncate'>
                      · {h.issue}
                    </span>
                    <span
                      className={cn(
                        'rounded-full px-1.5 py-0.5 text-[10px] font-medium',
                        statusMeta(h.status).pill
                      )}
                    >
                      {statusMeta(h.status).short}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Problem */}
          <div className='space-y-2'>
            <Label>Problem *</Label>
            <ChipGroup
              ariaLabel='Common problems'
              options={problemOptions}
              value={form.problems}
              onChange={(v) => set('problems', v)}
            />
            {device.problems.length > 8 && (
              <button
                type='button'
                className='text-primary text-xs font-medium hover:underline'
                onClick={() => setShowAllProblems((v) => !v)}
              >
                {showAllProblems
                  ? 'Show fewer'
                  : `+ ${device.problems.length - 8} more problems`}
              </button>
            )}
            <Textarea
              id='ri-issue'
              rows={2}
              placeholder='Anything else the customer said (optional if a problem is ticked)'
              value={form.issue}
              onChange={(e) => set('issue', e.target.value)}
              {...enter.enterProps('ri-issue')}
            />
          </div>

          {/* Technician — part of the quick intake, not hidden under More details */}
          <div className='space-y-1'>
            <Label htmlFor='ri-technician'>Technician</Label>
            <TechnicianPicker
              id='ri-technician'
              value={{ id: form.technicianId || null, name: form.technician }}
              onChange={(t) =>
                setForm((p) => ({
                  ...p,
                  technicianId: t.id || '',
                  technician: t.name,
                }))
              }
            />
          </div>

          {/* Money */}
          <div className='grid grid-cols-2 gap-3'>
            <div className='space-y-1'>
              <Label htmlFor='ri-estimate'>Estimated charges</Label>
              <Input
                id='ri-estimate'
                type='number'
                min='0'
                inputMode='decimal'
                placeholder='0'
                value={form.estimatedCharges}
                onChange={(e) => set('estimatedCharges', e.target.value)}
                {...enter.enterProps('ri-estimate')}
              />
            </div>
            <div className='space-y-1'>
              <Label htmlFor='ri-advance'>Advance received</Label>
              <Input
                id='ri-advance'
                type='number'
                min='0'
                inputMode='decimal'
                placeholder='0'
                value={form.advance}
                onChange={(e) => set('advance', e.target.value)}
                {...enter.enterProps('ri-advance')}
              />
            </div>
            {advance > 0 && (
              <div className='col-span-2 space-y-1'>
                <Label>Advance received in</Label>
                <PaymentMethodSelect
                  value={{
                    paymentMethod: form.paymentMethod,
                    walletType: form.walletType,
                  }}
                  onChange={(v) => setForm((p) => ({ ...p, ...v }))}
                />
              </div>
            )}
          </div>
          {(estimate > 0 || advance > 0) && (
            <div className='bg-muted -mt-1 flex justify-between rounded-md px-3 py-2 text-sm'>
              <span>Balance after advance</span>
              <strong
                className={
                  estimate - advance > 0
                    ? 'text-destructive'
                    : 'text-emerald-600'
                }
              >
                {fmt(Math.max(0, estimate - advance))}
              </strong>
            </div>
          )}

          {/* More details (collapsed) */}
          <div className='rounded-lg border'>
            <button
              type='button'
              aria-expanded={prefs.moreOpen}
              onClick={() => setPrefs({ moreOpen: !prefs.moreOpen })}
              className='flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm'
            >
              <span className='min-w-0'>
                <span className='font-medium'>More details</span>
                <span className='text-muted-foreground block truncate text-xs'>
                  {moreSummary.length
                    ? `Added: ${moreSummary.join(', ')}`
                    : 'Condition, accessories, lock, priority, due date, warranty'}
                </span>
              </span>
              <ChevronDown
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform',
                  prefs.moreOpen && 'rotate-180'
                )}
                aria-hidden
              />
            </button>
            {prefs.moreOpen && (
              <div className='grid gap-4 border-t p-3'>
                <div className='space-y-2'>
                  <Label>Condition at intake</Label>
                  <ChipGroup
                    ariaLabel='Condition at intake'
                    tone='warning'
                    options={device.conditions}
                    value={form.conditionChecks}
                    onChange={(v) => set('conditionChecks', v)}
                  />
                </div>
                <div className='space-y-2'>
                  <Label>Accessories received</Label>
                  <ChipGroup
                    ariaLabel='Accessories received'
                    options={device.accessories}
                    value={form.accessoriesPicked}
                    onChange={(v) => set('accessoriesPicked', v)}
                  />
                  <Input
                    placeholder='Anything else left with the device'
                    value={form.accessoriesOther}
                    onChange={(e) => set('accessoriesOther', e.target.value)}
                  />
                </div>
                {device.hasLock && (
                  <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                    <div className='space-y-1'>
                      <Label className='flex items-center gap-1'>
                        <Lock className='h-3.5 w-3.5' aria-hidden /> Screen lock
                      </Label>
                      <Select
                        value={form.lockType}
                        onValueChange={(v) =>
                          set('lockType', v as IntakeState['lockType'])
                        }
                      >
                        <SelectTrigger className='w-full'>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value='none'>
                            No lock / not given
                          </SelectItem>
                          <SelectItem value='pin'>PIN</SelectItem>
                          <SelectItem value='password'>Password</SelectItem>
                          <SelectItem value='pattern'>Pattern</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {form.lockType !== 'none' && (
                      <div className='space-y-1'>
                        <Label htmlFor='ri-lock'>
                          {form.lockType === 'pattern'
                            ? 'Pattern (e.g. 1-2-3-6-9)'
                            : 'Code'}
                        </Label>
                        <Input
                          id='ri-lock'
                          autoComplete='off'
                          value={form.lockCode}
                          onChange={(e) => set('lockCode', e.target.value)}
                          showVoiceInput={false}
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                  <div className='space-y-1'>
                    <Label>Priority</Label>
                    <Select
                      value={form.priority}
                      onValueChange={(v) =>
                        set('priority', v as RepairPriority)
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
                    <Label htmlFor='ri-due'>Promised by</Label>
                    <Input
                      id='ri-due'
                      type='date'
                      value={form.dueDate}
                      onChange={(e) => set('dueDate', e.target.value)}
                    />
                  </div>
                  <div className='space-y-1'>
                    <Label>Repair warranty</Label>
                    <Select
                      value={form.warrantyDays}
                      onValueChange={(v) => set('warrantyDays', v)}
                    >
                      <SelectTrigger className='w-full'>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WARRANTY_OPTIONS.map((d) => (
                          <SelectItem key={d} value={d}>
                            {d === '0' ? 'No warranty' : `${d} days`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className='space-y-1'>
                    <Label htmlFor='ri-date'>Received at</Label>
                    <Input
                      id='ri-date'
                      type='datetime-local'
                      value={form.date}
                      onChange={(e) => set('date', e.target.value)}
                    />
                  </div>
                </div>
                <SalesmanField
                  value={form.salesmanId}
                  onValueChange={(v) => set('salesmanId', v)}
                  id='ri-salesman'
                />
              </div>
            )}
          </div>

          <div className='flex flex-wrap items-center gap-x-4 gap-y-2 text-sm'>
            <label className='flex items-center gap-2'>
              <Checkbox
                checked={prefs.printCard}
                onCheckedChange={(v) => setPrefs({ printCard: !!v })}
              />
              <Printer className='h-3.5 w-3.5' aria-hidden /> Print job card
            </label>
            <label className='flex items-center gap-2'>
              <Checkbox
                checked={prefs.printTag}
                onCheckedChange={(v) => setPrefs({ printTag: !!v })}
              />
              <Tag className='h-3.5 w-3.5' aria-hidden /> Print device tag
            </label>
          </div>

          <Button disabled={isLoading} type='submit' className='w-full'>
            {isLoading
              ? 'Saving…'
              : prefs.printCard || prefs.printTag
                ? 'Create repair job & print'
                : 'Create repair job'}
          </Button>

          {/* Other devices — hidden unless asked for; every job starts as a mobile. */}
          {pickDevice || !isMobile ? (
            <div className='flex flex-wrap items-center gap-2 text-xs'>
              <span className='text-muted-foreground'>Device type</span>
              <Select
                value={form.deviceType}
                onValueChange={(v) => switchDevice(v as RepairDeviceType)}
              >
                <SelectTrigger className='h-8 w-40'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DEVICE_TYPES.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {!isMobile && (
                <button
                  type='button'
                  className='text-primary font-medium hover:underline'
                  onClick={() => switchDevice('mobile')}
                >
                  Back to mobile
                </button>
              )}
            </div>
          ) : (
            <button
              type='button'
              className='text-muted-foreground hover:text-foreground justify-self-center text-xs underline-offset-2 hover:underline'
              onClick={() => setPickDevice(true)}
            >
              Repairing a laptop, TV or other device?
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

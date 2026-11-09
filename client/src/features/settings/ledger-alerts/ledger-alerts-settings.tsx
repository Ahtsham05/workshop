import { useEffect, useMemo, useState } from 'react'
import { CalendarClock, Loader2, Palette, Plus, Printer, RotateCcw, Rows3, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { getBusinessToday, shiftBusinessCalendarDate } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/context/permission-context'
import {
  useGetLedgerAlertSettingsQuery,
  useUpdateLedgerAlertSettingsMutation,
  type LedgerAlertSettings,
  type LedgerBand,
  type LedgerIntensity,
  type LedgerRowStyle,
} from '@/stores/ledgerAlerts.api'
import {
  COLOR_PRESETS,
  DEFAULT_LEDGER_SETTINGS,
  bandRangeText,
  rowStyleForTone,
  type LedgerTone,
} from '@/features/ledger-alerts/lib/ledger-colors'
import { TonePill } from '@/features/ledger-alerts/components/aging-chip'

const DAY_PRESETS = [
  { days: 0, label: 'Same day' },
  { days: 7, label: '7 days' },
  { days: 15, label: '15 days' },
  { days: 30, label: '30 days' },
  { days: 45, label: '45 days' },
  { days: 60, label: '60 days' },
]

const ROW_STYLES: { value: LedgerRowStyle; label: string; hint: string }[] = [
  { value: 'tint', label: 'Tinted row', hint: 'Soft background + colour bar' },
  { value: 'bar', label: 'Colour bar', hint: 'Only a bar on the left edge' },
  { value: 'badge', label: 'Badge only', hint: 'Rows stay plain, chip shows status' },
]

const INTENSITIES: { value: LedgerIntensity; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'medium', label: 'Medium' },
  { value: 'strong', label: 'Strong' },
]

/** Colour swatch that opens a palette + free picker. */
function ColorPicker({ value, onChange, disabled }: { value: string; onChange: (hex: string) => void; disabled?: boolean }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type='button'
          disabled={disabled}
          className='h-9 w-9 shrink-0 rounded-md border shadow-sm ring-offset-background transition hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'
          style={{ backgroundColor: value }}
          aria-label='Pick colour'
        />
      </PopoverTrigger>
      <PopoverContent className='w-56 p-3' align='start'>
        <div className='grid grid-cols-8 gap-1.5'>
          {COLOR_PRESETS.map((hex) => (
            <button
              key={hex}
              type='button'
              onClick={() => onChange(hex)}
              className={cn('h-5 w-5 rounded-full border transition hover:scale-110', value.toUpperCase() === hex && 'ring-2 ring-ring ring-offset-1')}
              style={{ backgroundColor: hex }}
              aria-label={hex}
            />
          ))}
        </div>
        <div className='mt-3 flex items-center gap-2'>
          <input
            type='color'
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase())}
            className='h-8 w-10 cursor-pointer rounded border bg-transparent'
          />
          <Input
            value={value}
            onChange={(e) => {
              const v = e.target.value.trim()
              if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v.toUpperCase())
            }}
            className='h-8 font-mono text-xs'
            maxLength={7}
          />
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SwitchRow({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className='flex items-start justify-between gap-4'>
      <div className='space-y-0.5'>
        <Label className='text-sm'>{label}</Label>
        {hint ? <p className='text-xs text-muted-foreground'>{hint}</p> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  )
}

/** Problems that would make the bands ambiguous — shown inline and block saving. */
function bandErrors(bands: LedgerBand[]): string | null {
  if (!bands.length) return 'Add at least one colour band.'
  const days = bands.map((b) => Number(b.fromDays))
  if (days.some((d) => !Number.isInteger(d) || d < 1)) return 'Each band must start at 1 day or more.'
  if (new Set(days).size !== days.length) return 'Two bands start on the same day — give each band its own starting day.'
  return null
}

export default function LedgerAlertsSettings() {
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('editSettings', 'manageBusinessProfile')
  const { data, isLoading } = useGetLedgerAlertSettingsQuery()
  const [save, { isLoading: isSaving }] = useUpdateLedgerAlertSettingsMutation()
  const [form, setForm] = useState<LedgerAlertSettings>(DEFAULT_LEDGER_SETTINGS)
  const [customDays, setCustomDays] = useState(false)
  const formatMoney = useFormatMoney()

  useEffect(() => {
    if (data) {
      setForm(data)
      setCustomDays(!DAY_PRESETS.some((p) => p.days === data.defaultDueDays))
    }
  }, [data])

  const set = <K extends keyof LedgerAlertSettings>(key: K, value: LedgerAlertSettings[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const setBand = (index: number, patch: Partial<LedgerBand>) =>
    setForm((prev) => ({ ...prev, bands: prev.bands.map((b, i) => (i === index ? { ...b, ...patch } : b)) }))

  const sortedBands = useMemo(() => [...form.bands].sort((a, b) => a.fromDays - b.fromDays), [form.bands])
  const error = bandErrors(form.bands)
  const dirty = Boolean(data) && JSON.stringify({ ...form, bands: sortedBands }) !== JSON.stringify(data)

  const onSave = async () => {
    if (!canEdit || error) {
      if (error) toast.error(error)
      return
    }
    try {
      const saved = await save({ ...form, bands: sortedBands }).unwrap()
      setForm(saved)
      toast.success('Due date & colour settings saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not save settings'))
    }
  }
  useSettingsSaveShortcut(onSave, isSaving)

  const addBand = () => {
    const last = sortedBands[sortedBands.length - 1]
    const nextDay = last ? last.fromDays + 30 : 1
    const color = COLOR_PRESETS.find((c) => !form.bands.some((b) => b.color === c)) || '#64748B'
    setForm((prev) => ({ ...prev, bands: [...prev.bands, { label: `Overdue ${nextDay}+ days`, fromDays: nextDay, color }] }))
  }

  // Preview rows: one per band + due today + due soon, rendered exactly like the lists.
  const previewRows: { name: string; tone: LedgerTone; text: string; amount: number }[] = [
    ...(form.dueSoonEnabled
      ? [{ name: 'Bilal Traders', tone: { color: form.dueSoonColor, label: form.dueSoonLabel, kind: 'due_soon' as const, bandIndex: -1 }, text: 'Due in 2 days', amount: 12500 }]
      : []),
    { name: 'Hamza Electric', tone: { color: form.dueTodayColor, label: form.dueTodayLabel, kind: 'due_today' as const, bandIndex: -1 }, text: 'Due today', amount: 8200 },
    ...sortedBands.map((band, i) => ({
      name: ['Ali & Sons', 'Rehman Store', 'City Mobiles', 'Usman Brothers', 'Star Traders', 'Malik & Co', 'Noor Fabrics', 'Shah Steel'][i % 8],
      tone: { color: band.color, label: band.label, kind: 'band' as const, bandIndex: i },
      text: `${band.fromDays + (sortedBands[i + 1] ? Math.floor((sortedBands[i + 1].fromDays - band.fromDays) / 2) : 9)} days overdue`,
      amount: 15000 + i * 21750,
    })),
  ]

  if (isLoading) {
    return (
      <ContentSection title='Due Dates & Ledger Colours' desc='Credit due dates and overdue colours for customer ledgers.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  const disabled = !canEdit

  return (
    <ContentSection
      title='Due Dates & Ledger Colours'
      desc='Give credit invoices a due date, and colour customer ledgers by how late they are — in lists, ledgers and reports.'
    >
      <div className='space-y-5'>
        {/* ── Due dates ─────────────────────────────────────────────── */}
        <EntityFormSection
          title='Due dates on credit invoices'
          description='When on, every new credit invoice gets a due date automatically. The cashier sees it on the invoice screen and can move it earlier or later.'
          icon={<CalendarClock />}
          tone='sky'
        >
          <SwitchRow
            label='Set a due date on credit invoices'
            hint='Off: invoices are saved without a due date (old behaviour).'
            checked={form.dueDatesEnabled}
            onChange={(v) => set('dueDatesEnabled', v)}
            disabled={disabled}
          />
          <div className={cn('space-y-4', !form.dueDatesEnabled && 'pointer-events-none opacity-50')}>
            <div>
              <Label className='text-sm'>Default credit period</Label>
              <div className='mt-2 flex flex-wrap gap-1.5'>
                {DAY_PRESETS.map((p) => (
                  <Button
                    key={p.days}
                    type='button'
                    size='sm'
                    variant={!customDays && form.defaultDueDays === p.days ? 'default' : 'outline'}
                    onClick={() => {
                      setCustomDays(false)
                      set('defaultDueDays', p.days)
                    }}
                    disabled={disabled}
                  >
                    {p.label}
                  </Button>
                ))}
                <Button type='button' size='sm' variant={customDays ? 'default' : 'outline'} onClick={() => setCustomDays(true)} disabled={disabled}>
                  Custom
                </Button>
              </div>
              {customDays && (
                <div className='mt-2 flex items-center gap-2'>
                  <Input
                    type='number'
                    min={0}
                    max={3650}
                    value={form.defaultDueDays}
                    onChange={(e) => set('defaultDueDays', Math.max(0, Math.min(3650, Math.floor(Number(e.target.value) || 0))))}
                    className='h-9 w-28'
                    disabled={disabled}
                  />
                  <span className='text-sm text-muted-foreground'>days after the invoice date</span>
                </div>
              )}
              <p className='mt-1.5 text-xs text-muted-foreground'>
                A credit invoice dated today will be due on{' '}
                <span className='font-medium text-foreground'>
                  {formatAppDate(shiftBusinessCalendarDate(getBusinessToday(), form.defaultDueDays))}
                </span>
                .
              </p>
            </div>
            <SwitchRow
              label="Use the customer's payment terms first"
              hint='A customer set to Net 15 / Net 30 / Net 60 / Due on receipt gets those days instead of the default.'
              checked={form.useCustomerTerms}
              onChange={(v) => set('useCustomerTerms', v)}
              disabled={disabled}
            />
            <SwitchRow
              label='Pending invoices get a due date too'
              hint='Goods handed over but not billed yet. They also count in the overdue colours.'
              checked={form.applyToPending}
              onChange={(v) => set('applyToPending', v)}
              disabled={disabled}
            />
          </div>
          <div>
            <Label className='text-sm'>Old invoices without a due date</Label>
            <Select value={form.undatedRule} onValueChange={(v) => set('undatedRule', v as LedgerAlertSettings['undatedRule'])} disabled={disabled}>
              <SelectTrigger className='mt-1'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='ignore'>Never count them as late</SelectItem>
                <SelectItem value='default_days'>Late {form.defaultDueDays} days after their date (default period)</SelectItem>
              </SelectContent>
            </Select>
            <p className='mt-1 text-xs text-muted-foreground'>
              Also applies to opening balances and manual debit entries in the ledger.
            </p>
          </div>
        </EntityFormSection>

        {/* ── Colour bands ──────────────────────────────────────────── */}
        <EntityFormSection
          title='Overdue colour bands'
          description="A customer's colour comes from their OLDEST unpaid item. Payments clear the oldest invoices first, so a settled ledger is never coloured."
          icon={<Palette />}
          tone='amber'
        >
          <SwitchRow
            label='Colour customer ledgers'
            hint='Customers list, Accounts → Customers, ledger page, invoice list and reports.'
            checked={form.colorsEnabled}
            onChange={(v) => set('colorsEnabled', v)}
            disabled={disabled}
          />
          <div className={cn('space-y-3', !form.colorsEnabled && 'pointer-events-none opacity-50')}>
            {/* Before due */}
            <div className='rounded-lg border bg-background/60 p-3'>
              <p className='mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground'>Before it is late</p>
              <div className='space-y-2'>
                <div className='flex items-center gap-2'>
                  <ColorPicker value={form.dueTodayColor} onChange={(v) => set('dueTodayColor', v)} disabled={disabled} />
                  <Input value={form.dueTodayLabel} onChange={(e) => set('dueTodayLabel', e.target.value)} maxLength={40} className='h-9' disabled={disabled} />
                  <span className='w-28 shrink-0 text-right text-xs text-muted-foreground'>on the due day</span>
                </div>
                <div className='flex items-center gap-2'>
                  <ColorPicker value={form.dueSoonColor} onChange={(v) => set('dueSoonColor', v)} disabled={disabled || !form.dueSoonEnabled} />
                  <Input
                    value={form.dueSoonLabel}
                    onChange={(e) => set('dueSoonLabel', e.target.value)}
                    maxLength={40}
                    className='h-9'
                    disabled={disabled || !form.dueSoonEnabled}
                  />
                  <div className='flex w-28 shrink-0 items-center justify-end gap-1'>
                    <Input
                      type='number'
                      min={1}
                      max={60}
                      value={form.dueSoonDays}
                      onChange={(e) => set('dueSoonDays', Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1))))}
                      className='h-9 w-14 px-2'
                      disabled={disabled || !form.dueSoonEnabled}
                    />
                    <span className='text-xs text-muted-foreground'>days</span>
                  </div>
                  <Switch checked={form.dueSoonEnabled} onCheckedChange={(v) => set('dueSoonEnabled', v)} disabled={disabled} aria-label='Due soon colour' />
                </div>
              </div>
            </div>

            {/* After due */}
            <div className='rounded-lg border bg-background/60 p-3'>
              <div className='mb-2 flex items-center justify-between'>
                <p className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>After the due date</p>
                <span className='text-xs text-muted-foreground'>from day →</span>
              </div>
              <div className='space-y-2'>
                {form.bands.map((band, i) => {
                  const sortedIndex = sortedBands.indexOf(band)
                  return (
                    <div key={i} className='flex items-center gap-2'>
                      <ColorPicker value={band.color} onChange={(v) => setBand(i, { color: v })} disabled={disabled} />
                      <div className='min-w-0 flex-1'>
                        <Input value={band.label} onChange={(e) => setBand(i, { label: e.target.value })} maxLength={40} className='h-9' disabled={disabled} />
                        <p className='mt-0.5 pl-1 text-[11px] text-muted-foreground'>{bandRangeText(sortedBands, sortedIndex)} overdue</p>
                      </div>
                      <Input
                        type='number'
                        min={1}
                        max={3650}
                        value={band.fromDays}
                        onChange={(e) => setBand(i, { fromDays: Math.max(1, Math.min(3650, Math.floor(Number(e.target.value) || 1))) })}
                        className='h-9 w-20 self-start'
                        aria-label='Starts from day'
                        disabled={disabled}
                      />
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='h-9 w-9 shrink-0 self-start text-muted-foreground hover:text-destructive'
                        onClick={() => setForm((prev) => ({ ...prev, bands: prev.bands.filter((_, j) => j !== i) }))}
                        disabled={disabled || form.bands.length <= 1}
                        aria-label='Remove band'
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                  )
                })}
              </div>
              {error ? <p className='mt-2 text-xs font-medium text-destructive'>{error}</p> : null}
              <div className='mt-3 flex flex-wrap gap-2'>
                <Button type='button' variant='outline' size='sm' onClick={addBand} disabled={disabled || form.bands.length >= 8}>
                  <Plus className='mr-1 h-4 w-4' /> Add band
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      bands: DEFAULT_LEDGER_SETTINGS.bands,
                      dueSoonColor: DEFAULT_LEDGER_SETTINGS.dueSoonColor,
                      dueTodayColor: DEFAULT_LEDGER_SETTINGS.dueTodayColor,
                    }))
                  }
                  disabled={disabled}
                >
                  <RotateCcw className='mr-1 h-4 w-4' /> Default colours
                </Button>
              </div>
            </div>
          </div>
        </EntityFormSection>

        {/* ── Row style + live preview ─────────────────────────────── */}
        <EntityFormSection
          title='How rows look'
          description='Pick how strongly coloured ledgers stand out. The preview below is exactly what the customer lists will show.'
          icon={<Rows3 />}
          tone='violet'
        >
          <div className='grid gap-2 sm:grid-cols-3'>
            {ROW_STYLES.map((s) => (
              <button
                key={s.value}
                type='button'
                disabled={disabled}
                onClick={() => set('rowStyle', s.value)}
                className={cn(
                  'rounded-lg border p-2.5 text-left transition',
                  form.rowStyle === s.value ? 'border-primary bg-primary/5 ring-1 ring-primary' : 'hover:bg-muted/60'
                )}
              >
                <div className='text-sm font-medium'>{s.label}</div>
                <div className='text-[11px] text-muted-foreground'>{s.hint}</div>
              </button>
            ))}
          </div>
          {form.rowStyle === 'tint' && (
            <div className='flex items-center gap-3'>
              <Label className='text-sm'>Strength</Label>
              <div className='inline-flex rounded-md border p-0.5'>
                {INTENSITIES.map((it) => (
                  <button
                    key={it.value}
                    type='button'
                    disabled={disabled}
                    onClick={() => set('intensity', it.value)}
                    className={cn('rounded px-3 py-1 text-xs font-medium', form.intensity === it.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                  >
                    {it.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className='overflow-hidden rounded-lg border'>
            <div className='grid grid-cols-[1fr_auto_auto] gap-3 border-b bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground'>
              <span>Customer</span>
              <span className='text-right'>Balance</span>
              <span className='w-36'>Due status</span>
            </div>
            {previewRows.map((row, i) => (
              <div
                key={i}
                className='grid grid-cols-[1fr_auto_auto] items-center gap-3 border-b px-3 py-2 text-sm last:border-b-0'
                style={form.colorsEnabled ? rowStyleForTone(row.tone, form) : undefined}
              >
                <span className='truncate font-medium'>{row.name}</span>
                <span className='text-right tabular-nums text-red-600'>{formatMoney(row.amount)}</span>
                <span className='w-36'>{form.colorsEnabled ? <TonePill tone={row.tone}>{row.text}</TonePill> : null}</span>
              </div>
            ))}
            <div className='grid grid-cols-[1fr_auto_auto] items-center gap-3 px-3 py-2 text-sm'>
              <span className='truncate font-medium'>Paid-up customer</span>
              <span className='text-right tabular-nums text-muted-foreground'>{formatMoney(0)}</span>
              <span className='w-36 text-xs text-muted-foreground'>—</span>
            </div>
          </div>

          <div>
            <Label className='text-sm'>Ignore small overdue amounts below</Label>
            <Input
              type='number'
              min={0}
              value={form.minAmount}
              onChange={(e) => set('minAmount', Math.max(0, Number(e.target.value) || 0))}
              className='mt-1 h-9 w-40'
              disabled={disabled}
            />
            <p className='mt-1 text-xs text-muted-foreground'>Leftover paisa/rupees from rounding won't turn a customer red. 0 = colour any overdue amount.</p>
          </div>
        </EntityFormSection>

        {/* ── Reports & print ──────────────────────────────────────── */}
        <EntityFormSection title='Reports & printing' description='Where the colours appear outside the customer lists.' icon={<Printer />} tone='emerald'>
          <SwitchRow
            label='Show colours in reports'
            hint='Customer Aging, Overdue Ledgers and the customer report.'
            checked={form.showInReports}
            onChange={(v) => set('showInReports', v)}
            disabled={disabled}
          />
          <SwitchRow
            label='Print the colours'
            hint='Printed ledger lists and the Overdue Ledgers report keep the row colours (off = plain black & white).'
            checked={form.printColors}
            onChange={(v) => set('printColors', v)}
            disabled={disabled}
          />
        </EntityFormSection>

        <div className='sticky -bottom-6 z-10 -mx-1.5 flex items-center justify-end gap-3 border-t bg-background px-1.5 pt-3 pb-6'>
          {!canEdit ? <span className='mr-auto text-xs text-muted-foreground'>You can view these settings but not change them.</span> : null}
          {dirty ? <span className='text-xs text-muted-foreground'>Unsaved changes</span> : null}
          <Button type='button' variant='outline' onClick={() => data && setForm(data)} disabled={!dirty || isSaving}>
            Discard
          </Button>
          <Button type='button' onClick={onSave} disabled={!canEdit || isSaving || !dirty || Boolean(error)}>
            {isSaving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            Save settings
          </Button>
        </div>
      </div>
    </ContentSection>
  )
}

import { useEffect, useState } from 'react'
import { BadgePercent, Loader2, Plus, Printer, ShieldCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { usePermissions } from '@/context/permission-context'
import {
  useGetLedgerDiscountSettingsQuery,
  useUpdateLedgerDiscountSettingsMutation,
  type LedgerDiscountReason,
  type LedgerDiscountSettings,
} from '@/stores/ledgerDiscounts.api'
import { DEFAULT_DISCOUNT_SETTINGS, DISCOUNT_REASONS } from '@/features/ledger-discounts/lib/ledger-discounts'

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

export default function LedgerDiscountsSettings() {
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('editSettings', 'manageBusinessProfile')
  const { data, isLoading } = useGetLedgerDiscountSettingsQuery()
  const [save, { isLoading: isSaving }] = useUpdateLedgerDiscountSettingsMutation()
  const [form, setForm] = useState<LedgerDiscountSettings>(DEFAULT_DISCOUNT_SETTINGS)
  const [newQuick, setNewQuick] = useState('')
  const formatMoney = useFormatMoney()

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const set = <K extends keyof LedgerDiscountSettings>(key: K, value: LedgerDiscountSettings[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = Boolean(data) && JSON.stringify(form) !== JSON.stringify(data)

  const onSave = async () => {
    if (!canEdit) return
    try {
      const saved = await save(form).unwrap()
      setForm(saved)
      toast.success('Ledger discount settings saved')
    } catch (e) {
      toast.error(getErrorMessage(e, 'Could not save settings'))
    }
  }
  useSettingsSaveShortcut(onSave, isSaving)

  const addQuick = () => {
    const p = Math.round(Number(newQuick) * 100) / 100
    if (!(p > 0 && p <= 100)) return
    set('quickPercents', [...new Set([...form.quickPercents, p])].sort((a, b) => a - b).slice(0, 6))
    setNewQuick('')
  }

  if (isLoading) {
    return (
      <ContentSection title='Ledger Discounts' desc='Discount Allowed to customers and Discount Received from suppliers.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  const disabled = !canEdit
  const off = !form.enabled

  // Worked example for the limit, so the owner sees what the numbers mean.
  const exampleBill = 10000
  const examplePct = form.maxPercent > 0 ? form.maxPercent : 2
  const exampleMax = Math.min(
    form.maxPercent > 0 ? (exampleBill * form.maxPercent) / 100 : Number.POSITIVE_INFINITY,
    form.maxAmount > 0 ? form.maxAmount : Number.POSITIVE_INFINITY
  )

  return (
    <ContentSection
      title='Ledger Discounts'
      desc='Give a customer a discount when they pay ("received 9,950 + 50 discount"), record discounts suppliers give you, and control who can give how much.'
    >
      <div className='space-y-5'>
        <EntityFormSection
          title='Discounts on ledgers'
          description='A discount is its own ledger line: no cash moves, the balance goes down, and it settles open invoices oldest first. Books: Discount Allowed (expense) / Discount Received (income).'
          icon={<BadgePercent />}
          tone='amber'
        >
          <SwitchRow
            label='Allow ledger discounts'
            hint='Off: nobody can add a discount on any ledger. Discounts already recorded stay as they are.'
            checked={form.enabled}
            onChange={(v) => set('enabled', v)}
            disabled={disabled}
          />
          <div className={cn('space-y-4', off && 'pointer-events-none opacity-50')}>
            <SwitchRow
              label='Customers — Discount Allowed'
              hint='On Cash Received: "+ Add discount", and a Discount Allowed entry type.'
              checked={form.customerEnabled}
              onChange={(v) => set('customerEnabled', v)}
              disabled={disabled}
            />
            <SwitchRow
              label='Suppliers — Discount Received'
              hint='On Cash Paid: "+ Add discount", and a Discount Received entry type.'
              checked={form.supplierEnabled}
              onChange={(v) => set('supplierEnabled', v)}
              disabled={disabled}
            />
            <SwitchRow
              label='Allow a discount without a payment'
              hint='e.g. a year-end rebate or writing off an old balance. Off: a discount can only be given together with a payment.'
              checked={form.allowStandalone}
              onChange={(v) => set('allowStandalone', v)}
              disabled={disabled}
            />
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label className='text-sm'>Default reason</Label>
                <Select value={form.defaultReason} onValueChange={(v) => set('defaultReason', v as LedgerDiscountReason)} disabled={disabled}>
                  <SelectTrigger className='w-full'>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DISCOUNT_REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className='space-y-1.5'>
                <Label className='text-sm'>Quick % buttons</Label>
                <div className='flex flex-wrap items-center gap-1.5'>
                  {form.quickPercents.map((p) => (
                    <span key={p} className='inline-flex items-center gap-1 rounded-md border bg-muted/40 px-2 py-1 text-xs font-medium'>
                      {p}%
                      {!disabled && (
                        <button
                          type='button'
                          onClick={() => set('quickPercents', form.quickPercents.filter((x) => x !== p))}
                          className='text-muted-foreground hover:text-foreground'
                          aria-label={`Remove ${p}%`}
                        >
                          <X className='h-3 w-3' />
                        </button>
                      )}
                    </span>
                  ))}
                  {form.quickPercents.length < 6 && !disabled && (
                    <span className='inline-flex items-center gap-1'>
                      <Input
                        type='number'
                        min={0}
                        max={100}
                        step='0.5'
                        value={newQuick}
                        onChange={(e) => setNewQuick(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addQuick()
                          }
                        }}
                        className='h-7 w-16 text-xs'
                        placeholder='%'
                      />
                      <Button type='button' size='sm' variant='outline' className='h-7 px-2' onClick={addQuick}>
                        <Plus className='h-3.5 w-3.5' />
                      </Button>
                    </span>
                  )}
                </div>
                <p className='text-xs text-muted-foreground'>Shown on the discount box; % of what the party owes.</p>
              </div>
            </div>
          </div>
        </EntityFormSection>

        <EntityFormSection
          title='Limits & approval'
          description='Stop large discounts slipping through. Above the limit, only people with "Approve discounts over the limit" can save — and they write why.'
          icon={<ShieldCheck />}
          tone='rose'
        >
          <div className={cn('space-y-4', off && 'pointer-events-none opacity-50')}>
            <div className='grid grid-cols-1 gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label className='text-sm'>Maximum discount %</Label>
                <div className='flex items-center gap-2'>
                  <Input
                    type='number'
                    min={0}
                    max={100}
                    step='0.5'
                    value={form.maxPercent}
                    onChange={(e) => set('maxPercent', Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
                    className='h-9 w-28'
                    disabled={disabled}
                  />
                  <span className='text-sm text-muted-foreground'>% (0 = no limit)</span>
                </div>
                <p className='text-xs text-muted-foreground'>Of the amount settled (payment + discount), or of the balance for a discount on its own.</p>
              </div>
              <div className='space-y-1.5'>
                <Label className='text-sm'>Maximum per discount</Label>
                <div className='flex items-center gap-2'>
                  <Input
                    type='number'
                    min={0}
                    step='1'
                    value={form.maxAmount}
                    onChange={(e) => set('maxAmount', Math.max(0, Number(e.target.value) || 0))}
                    className='h-9 w-36'
                    disabled={disabled}
                  />
                  <span className='text-sm text-muted-foreground'>(0 = no limit)</span>
                </div>
              </div>
            </div>
            <div className='rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground'>
              {form.maxPercent > 0 || form.maxAmount > 0 ? (
                <>
                  Example: on a {formatMoney(exampleBill)} bill, staff can give up to{' '}
                  <span className='font-semibold text-foreground'>{formatMoney(exampleMax)}</span> without approval.
                </>
              ) : (
                <>No limit: anyone allowed to give discounts can give any amount up to what is owed (e.g. {examplePct}% of {formatMoney(exampleBill)} = {formatMoney((exampleBill * examplePct) / 100)}).</>
              )}{' '}
              A discount can never be more than what is still owing.
            </div>
            <SwitchRow
              label='Approver must write why'
              hint='Over-limit discounts carry the note on the ledger line and in the Discount Register.'
              checked={form.requireApprovalNote}
              onChange={(v) => set('requireApprovalNote', v)}
              disabled={disabled}
            />
            <SwitchRow
              label='Every discount needs a note'
              hint='For tighter control — the note is printed on the statement line.'
              checked={form.requireNote}
              onChange={(v) => set('requireNote', v)}
              disabled={disabled}
            />
            <p className='text-xs text-muted-foreground'>
              Who can give discounts at all is set per role: Roles → Accounts &amp; Expenses → “Give ledger discounts” and “Approve discounts over the limit”.
            </p>
          </div>
        </EntityFormSection>

        <EntityFormSection title='Receipts & statements' description='How discounts appear on what you print and send.' icon={<Printer />} tone='emerald'>
          <SwitchRow
            label='Show the discount on payment receipts'
            hint='"Less: Discount Allowed" and "Total Settled" lines on the receipt of the payment it was given with.'
            checked={form.showOnReceipts}
            onChange={(v) => set('showOnReceipts', v)}
            disabled={disabled}
          />
          <SwitchRow
            label='Show the discount total on statements'
            hint='Statement of Account prints a "Discounts in this period" line. Discount lines themselves always print — the balance depends on them.'
            checked={form.showOnStatements}
            onChange={(v) => set('showOnStatements', v)}
            disabled={disabled}
          />
        </EntityFormSection>

        <div className='sticky -bottom-6 z-10 -mx-1.5 flex items-center justify-end gap-3 border-t bg-background px-1.5 pt-3 pb-6'>
          {!canEdit ? <span className='mr-auto text-xs text-muted-foreground'>You can view these settings but not change them.</span> : null}
          {dirty ? <span className='text-xs text-muted-foreground'>Unsaved changes</span> : null}
          <Button type='button' variant='outline' onClick={() => data && setForm(data)} disabled={!dirty || isSaving}>
            Discard
          </Button>
          <Button type='button' onClick={onSave} disabled={!canEdit || isSaving || !dirty}>
            {isSaving ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : null}
            Save settings
          </Button>
        </div>
      </div>
    </ContentSection>
  )
}

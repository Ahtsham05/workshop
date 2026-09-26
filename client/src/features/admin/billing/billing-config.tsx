import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import {
  billingErrorMessage,
  MODULE_LABELS,
  useAdminGetBillingSettingsQuery,
  useAdminListPlansQuery,
  useAdminUpdateBillingSettingsMutation,
  useAdminUpdatePlanMutation,
  type AdminPlan,
  type BillingModule,
  type BillingSettings,
} from '@/stores/billing.api'

function TextField({
  id,
  label,
  value,
  onChange,
  inputMode,
}: {
  id: string
  label: string
  value: string | number
  onChange: (v: string) => void
  inputMode?: 'numeric' | 'decimal'
}) {
  return (
    <div className='min-w-0 space-y-1'>
      <Label htmlFor={id} className='text-xs'>
        {label}
      </Label>
      <Input id={id} value={value} inputMode={inputMode} onChange={(e) => onChange(e.target.value)} />
    </div>
  )
}

const BANK_FIELDS = [
  ['bankName', 'Bank name'],
  ['accountTitle', 'Account title'],
  ['accountNumber', 'Account number'],
  ['iban', 'IBAN'],
  ['branch', 'Branch'],
] as const

function SettingsForm({ settings }: { settings: BillingSettings }) {
  const [form, setForm] = useState(settings)
  const [save, { isLoading }] = useAdminUpdateBillingSettingsMutation()
  useEffect(() => setForm(settings), [settings])

  const set = <K extends keyof BillingSettings>(key: K, value: BillingSettings[K]) => setForm((f) => ({ ...f, [key]: value }))

  const handleSave = async () => {
    try {
      await save({
        pkrPerUsd: Number(form.pkrPerUsd),
        graceDays: Number(form.graceDays),
        reminderDays: form.reminderDays.map(Number).filter((n) => n > 0),
        intentTtlHours: Number(form.intentTtlHours),
        bank: form.bank,
        jazzcash: form.jazzcash,
        easypaisa: form.easypaisa,
      }).unwrap()
      toast.success('Billing settings saved')
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Payment settings</CardTitle>
        <CardDescription>
          Shown to Pakistani customers on the payment screen. A new exchange rate applies to new payment references only —
          quotes already given keep their rate.
        </CardDescription>
      </CardHeader>
      <CardContent className='space-y-5'>
        <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          <TextField id='bs-rate' label='PKR per USD' inputMode='decimal' value={form.pkrPerUsd} onChange={(v) => set('pkrPerUsd', v as unknown as number)} />
          <TextField id='bs-grace' label='Grace days' inputMode='numeric' value={form.graceDays} onChange={(v) => set('graceDays', v as unknown as number)} />
          <TextField
            id='bs-reminders'
            label='Reminder days (comma)'
            value={form.reminderDays.join(', ')}
            onChange={(v) => set('reminderDays', v.split(',').map((x) => Number(x.trim())).filter((n) => !Number.isNaN(n)))}
          />
          <TextField id='bs-ttl' label='Quote valid (hours)' inputMode='numeric' value={form.intentTtlHours} onChange={(v) => set('intentTtlHours', v as unknown as number)} />
        </div>
        <div className='space-y-2'>
          <p className='text-sm font-medium'>Bank account</p>
          <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
            {BANK_FIELDS.map(([k, label]) => (
              <TextField key={k} id={`bs-bank-${k}`} label={label} value={form.bank[k] ?? ''} onChange={(v) => set('bank', { ...form.bank, [k]: v })} />
            ))}
          </div>
        </div>
        {(['jazzcash', 'easypaisa'] as const).map((wallet) => (
          <div key={wallet} className='space-y-2'>
            <p className='text-sm font-medium'>{wallet === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} (leave blank to hide)</p>
            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
              <TextField id={`bs-${wallet}-title`} label='Account title' value={form[wallet].accountTitle} onChange={(v) => set(wallet, { ...form[wallet], accountTitle: v })} />
              <TextField id={`bs-${wallet}-number`} label='Mobile account number' value={form[wallet].accountNumber} onChange={(v) => set(wallet, { ...form[wallet], accountNumber: v })} />
            </div>
          </div>
        ))}
        <Button onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving…' : 'Save settings'}
        </Button>
      </CardContent>
    </Card>
  )
}

const ALL_MODULES = Object.keys(MODULE_LABELS) as BillingModule[]

function PlanEditor({ plan }: { plan: AdminPlan }) {
  const [form, setForm] = useState(plan)
  const [save, { isLoading }] = useAdminUpdatePlanMutation()
  useEffect(() => setForm(plan), [plan])

  const setLimit = (k: keyof AdminPlan['limits'], v: string) =>
    setForm((f) => ({ ...f, limits: { ...f.limits, [k]: v as unknown as number } }))

  const handleSave = async () => {
    try {
      await save({
        key: plan.key,
        changes: {
          name: form.name,
          description: form.description,
          priceUsdMonthly: Number(form.priceUsdMonthly),
          limits: {
            maxUsers: Number(form.limits.maxUsers),
            maxBranches: Number(form.limits.maxBranches),
            maxInvoicesPerMonth: Number(form.limits.maxInvoicesPerMonth),
          },
          modules: form.modules,
          isPublic: form.isPublic,
          polar: {
            sandboxProductId: form.polar.sandboxProductId || null,
            productionProductId: form.polar.productionProductId || null,
          },
        },
      }).unwrap()
      toast.success(`${form.name} saved`)
    } catch (err) {
      toast.error(billingErrorMessage(err))
    }
  }

  return (
    <Card>
      <CardHeader className='pb-3'>
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <CardTitle className='text-base'>
            {plan.name} <span className='text-muted-foreground font-mono text-xs'>({plan.key})</span>
          </CardTitle>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={form.isPublic} onCheckedChange={(v) => setForm((f) => ({ ...f, isPublic: v }))} />
            Offered on pricing page
          </label>
        </div>
      </CardHeader>
      <CardContent className='space-y-4'>
        <div className='grid grid-cols-2 gap-3 md:grid-cols-4'>
          <TextField id={`p-${plan.key}-price`} label='USD / month' inputMode='decimal' value={form.priceUsdMonthly} onChange={(v) => setForm((f) => ({ ...f, priceUsdMonthly: v as unknown as number }))} />
          <TextField id={`p-${plan.key}-users`} label='Max users (-1 = ∞)' inputMode='numeric' value={form.limits.maxUsers} onChange={(v) => setLimit('maxUsers', v)} />
          <TextField id={`p-${plan.key}-branches`} label='Max branches' inputMode='numeric' value={form.limits.maxBranches} onChange={(v) => setLimit('maxBranches', v)} />
          <TextField id={`p-${plan.key}-invoices`} label='Invoices / month' inputMode='numeric' value={form.limits.maxInvoicesPerMonth} onChange={(v) => setLimit('maxInvoicesPerMonth', v)} />
        </div>
        <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3'>
          {ALL_MODULES.map((m) => (
            <label key={m} className='flex items-center gap-2 text-sm'>
              <Checkbox
                checked={form.modules.includes(m)}
                onCheckedChange={(checked) =>
                  setForm((f) => ({ ...f, modules: checked ? [...f.modules, m] : f.modules.filter((x) => x !== m) }))
                }
              />
              {MODULE_LABELS[m]}
            </label>
          ))}
        </div>
        <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          <TextField id={`p-${plan.key}-sbx`} label='Polar product id (sandbox)' value={form.polar.sandboxProductId ?? ''} onChange={(v) => setForm((f) => ({ ...f, polar: { ...f.polar, sandboxProductId: v } }))} />
          <TextField id={`p-${plan.key}-prd`} label='Polar product id (production)' value={form.polar.productionProductId ?? ''} onChange={(v) => setForm((f) => ({ ...f, polar: { ...f.polar, productionProductId: v } }))} />
        </div>
        <p className='text-muted-foreground text-xs'>
          Changing the USD price here does not change the Polar product — update its price in the Polar dashboard too.
        </p>
        <Button size='sm' onClick={handleSave} disabled={isLoading}>
          {isLoading ? 'Saving…' : `Save ${plan.name}`}
        </Button>
      </CardContent>
    </Card>
  )
}

export function BillingConfig() {
  const { data: settings, isLoading: loadingSettings } = useAdminGetBillingSettingsQuery()
  const { data: plans, isLoading: loadingPlans } = useAdminListPlansQuery()
  return (
    <div className='space-y-6'>
      {loadingSettings || !settings ? <Skeleton className='h-64 w-full' /> : <SettingsForm settings={settings} />}
      <div className='space-y-3'>
        <div>
          <h3 className='text-lg font-semibold'>Plans</h3>
          <p className='text-muted-foreground text-sm'>Limits and modules apply to every organization on the plan within a minute.</p>
        </div>
        {loadingPlans || !plans ? <Skeleton className='h-64 w-full' /> : plans.map((p) => <PlanEditor key={p.key} plan={p} />)}
      </div>
    </div>
  )
}

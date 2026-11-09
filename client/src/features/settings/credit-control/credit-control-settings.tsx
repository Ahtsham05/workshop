import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useFormatMoney } from '@/lib/format-money'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { cn } from '@/lib/utils'
import {
  useGetCreditOverviewQuery,
  useGetCreditSettingsQuery,
  useGetRecentCreditOverridesQuery,
  useUpdateCreditSettingsMutation,
  type CreditSettings,
} from '@/stores/creditControl.api'
import { CreditCell } from '@/features/customers/credit/credit-cell'
import { CreditEventLine } from '@/features/customers/credit/credit-history-dialog'

/**
 * Settings → Credit Control: the org-wide rules every credit sale is checked against
 * (server creditControl.service.js), plus who is over / near their limit right now and the
 * latest sales approved over credit.
 */
export default function CreditControlSettings() {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { data: saved, isLoading } = useGetCreditSettingsQuery()
  const [update, { isLoading: saving }] = useUpdateCreditSettingsMutation()
  const [form, setForm] = useState<CreditSettings | null>(null)
  const { data: overview } = useGetCreditOverviewQuery()
  const { data: overrides } = useGetRecentCreditOverridesQuery({ limit: 10 })

  useEffect(() => {
    if (saved) setForm(saved)
  }, [saved])

  const dirty = Boolean(form && saved && JSON.stringify(form) !== JSON.stringify(saved))
  const save = async () => {
    if (!form || !dirty) return
    try {
      const result = await update(form).unwrap()
      setForm(result)
      toast.success(t('Credit control settings saved'))
    } catch (error) {
      toast.error(getErrorMessage(error, t('Could not save the settings')))
    }
  }
  useSettingsSaveShortcut(save, saving)

  const set = <K extends keyof CreditSettings>(key: K, value: CreditSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const atRisk = (overview?.results || []).filter((row) => row.status === 'over' || row.status === 'hold' || row.status === 'near')

  return (
    <ContentSection
      title={t('Credit Control')}
      desc={t('Customer credit limits: what happens when a sale would go over, and who is near or over right now.')}
    >
      {isLoading || !form ? (
        <div className='flex items-center gap-2 py-8 text-muted-foreground'>
          <Loader2 className='h-4 w-4 animate-spin' /> {t('Loading…')}
        </div>
      ) : (
        <div className='space-y-6'>
          <div className='flex items-start justify-between gap-4 rounded-lg border p-4'>
            <div className='space-y-0.5'>
              <Label htmlFor='credit-enabled' className='text-base'>{t('Check credit on every sale')}</Label>
              <p className='text-sm text-muted-foreground'>
                {t('Credit sales are checked against the customer’s limit, hold and overdue invoices. Fully paid sales are never stopped.')}
              </p>
            </div>
            <Switch id='credit-enabled' checked={form.enabled} onCheckedChange={(v) => set('enabled', v)} />
          </div>

          <fieldset disabled={!form.enabled} className={cn('space-y-6', !form.enabled && 'opacity-60')}>
            <div className='space-y-3'>
              <Label className='text-base'>{t('When a sale goes over the limit')}</Label>
              <RadioGroup value={form.mode} onValueChange={(v) => set('mode', v as CreditSettings['mode'])} className='gap-2'>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', form.mode === 'block' && 'border-primary bg-primary/5')}>
                  <RadioGroupItem value='block' className='mt-0.5' />
                  <span>
                    <span className='font-medium'>{t('Block the sale')}</span>
                    <span className='block text-sm text-muted-foreground'>
                      {t('Saved only if someone with “Approve sales over credit limit” approves it with a reason, or the limit is raised.')}
                    </span>
                  </span>
                </label>
                <label className={cn('flex cursor-pointer items-start gap-3 rounded-lg border p-3', form.mode === 'warn' && 'border-primary bg-primary/5')}>
                  <RadioGroupItem value='warn' className='mt-0.5' />
                  <span>
                    <span className='font-medium'>{t('Warn only')}</span>
                    <span className='block text-sm text-muted-foreground'>
                      {t('The cashier sees the warning and can still save; every such sale is logged. A credit hold always blocks.')}
                    </span>
                  </span>
                </label>
              </RadioGroup>
            </div>

            <div className='flex items-start justify-between gap-4 rounded-lg border p-4'>
              <div className='space-y-0.5'>
                <Label htmlFor='credit-pending'>{t('Count pending (unbilled) invoices')}</Label>
                <p className='text-sm text-muted-foreground'>{t('Goods handed over but not billed yet count toward what the customer owes.')}</p>
              </div>
              <Switch id='credit-pending' checked={form.includePendingInvoices} onCheckedChange={(v) => set('includePendingInvoices', v)} />
            </div>

            <div className='grid gap-4 sm:grid-cols-2'>
              <div className='space-y-1.5'>
                <Label htmlFor='credit-overdue'>{t('Block when overdue more than (days)')}</Label>
                <Input
                  id='credit-overdue'
                  type='number'
                  min={0}
                  value={form.overdueBlockDays}
                  onChange={(e) => set('overdueBlockDays', Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                />
                <p className='text-xs text-muted-foreground'>{t('0 = off. Due date comes from the invoice, else the customer’s payment terms.')}</p>
              </div>
              <div className='space-y-1.5'>
                <Label htmlFor='credit-near'>{t('“Near limit” from (%)')}</Label>
                <Input
                  id='credit-near'
                  type='number'
                  min={1}
                  max={100}
                  value={form.nearLimitPercent}
                  onChange={(e) => set('nearLimitPercent', Math.min(100, Math.max(1, Number(e.target.value) || 80)))}
                />
                <p className='text-xs text-muted-foreground'>{t('Customers above this share of their limit show in amber.')}</p>
              </div>
              <div className='space-y-1.5 sm:col-span-2'>
                <Label htmlFor='credit-default'>{t('Default limit for new customers')}</Label>
                <Input
                  id='credit-default'
                  type='number'
                  min={0}
                  value={form.defaultCreditLimit}
                  onChange={(e) => set('defaultCreditLimit', Math.max(0, Number(e.target.value) || 0))}
                />
                <p className='text-xs text-muted-foreground'>{t('Used when the customer form leaves the limit empty. 0 = no limit.')}</p>
              </div>
            </div>
          </fieldset>

          <div className='flex justify-end gap-2'>
            <Button type='button' variant='outline' disabled={!dirty || saving} onClick={() => saved && setForm(saved)}>
              {t('Reset')}
            </Button>
            <Button type='button' onClick={save} disabled={!dirty || saving}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Save')}
            </Button>
          </div>

          {overview && (
            <div className='space-y-3 border-t pt-6'>
              <h4 className='font-medium'>{t('Credit at a glance')}</h4>
              <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
                <Tile label={t('With a limit')} value={String(overview.totals.customers)} />
                <Tile label={t('Total owed')} value={formatMoney(overview.totals.totalExposure)} />
                <Tile label={t('Over limit')} value={String(overview.totals.over)} tone={overview.totals.over > 0 ? 'danger' : undefined} hint={overview.totals.overAmount > 0 ? formatMoney(overview.totals.overAmount) : undefined} />
                <Tile label={t('On hold')} value={String(overview.totals.hold)} tone={overview.totals.hold > 0 ? 'danger' : undefined} />
              </div>
              {atRisk.length > 0 ? (
                <ul className='divide-y rounded-lg border'>
                  {atRisk.slice(0, 15).map((row) => (
                    <li key={row.customerId} className='flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm'>
                      <span className='flex min-w-0 items-center gap-1.5 font-medium'>
                        {row.status === 'hold' ? (
                          <ShieldAlert className='h-4 w-4 shrink-0 text-red-600' />
                        ) : (
                          <AlertTriangle className={cn('h-4 w-4 shrink-0', row.status === 'over' ? 'text-red-600' : 'text-amber-600')} />
                        )}
                        <span className='truncate'>{row.name}</span>
                      </span>
                      <CreditCell credit={row} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                  <ShieldCheck className='h-4 w-4 text-emerald-600' /> {t('No customer is over or near their limit.')}
                </p>
              )}
            </div>
          )}

          {overrides && overrides.results.length > 0 && (
            <div className='space-y-3 border-t pt-6'>
              <h4 className='font-medium'>{t('Recent sales let through over credit')}</h4>
              <ul className='divide-y rounded-lg border'>
                {overrides.results.map((event) => (
                  <CreditEventLine key={event.id} event={event} showCustomer />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </ContentSection>
  )
}

function Tile({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'danger' }) {
  return (
    <div className='rounded-lg border px-3 py-2'>
      <div className='text-xs text-muted-foreground'>{label}</div>
      <div className={cn('text-base font-semibold tabular-nums', tone === 'danger' && 'text-red-600')}>{value}</div>
      {hint && <div className='text-xs text-red-600'>{hint}</div>}
    </div>
  )
}

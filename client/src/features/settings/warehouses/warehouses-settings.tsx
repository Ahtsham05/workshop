import { useEffect, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowRight, Loader2, Warehouse as WarehouseIcon } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { getErrorMessage } from '@/lib/get-error-message'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { cn } from '@/lib/utils'
import { DEFAULT_WAREHOUSE_SETTINGS, useGetWarehouseSettingsQuery, useUpdateWarehouseSettingsMutation, type WarehouseSettings } from '@/stores/warehouse.api'

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

/** Settings → Warehouses: the on/off switch for the whole module plus its options. */
export default function WarehousesSettings() {
  const { t } = useLanguage()
  const { hasAnyPermission } = usePermissions()
  const canEdit = hasAnyPermission('editSettings', 'manageBusinessProfile', 'manageWarehouses')
  const { data, isLoading } = useGetWarehouseSettingsQuery()
  const [save, { isLoading: saving }] = useUpdateWarehouseSettingsMutation()
  const [form, setForm] = useState<WarehouseSettings>(DEFAULT_WAREHOUSE_SETTINGS)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const set = <K extends keyof WarehouseSettings>(key: K, value: WarehouseSettings[K]) => setForm((f) => ({ ...f, [key]: value }))
  const dirty = Boolean(data) && JSON.stringify(form) !== JSON.stringify(data)

  const onSave = async () => {
    if (!canEdit) return
    try {
      const saved = await save(form).unwrap()
      setForm(saved)
      toast.success(saved.enabled && !data?.enabled ? t('Warehouses turned on — a Main Warehouse now holds each branch’s stock') : t('Warehouse settings saved'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Could not save settings')))
    }
  }
  useSettingsSaveShortcut(onSave, saving)

  if (isLoading) {
    return (
      <ContentSection title={t('Warehouses')} desc={t('Multi-warehouse inventory')}>
        <div className='flex justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  const disabled = !canEdit
  const off = !form.enabled

  return (
    <ContentSection
      title={t('Warehouses')}
      desc={t('Keep stock in several warehouses per branch, with bins, transfers and per-warehouse sales and purchases. Off by default so it never gets in the way of users who do not need it.')}
    >
      <div className='space-y-5'>
        <EntityFormSection
          title={t('Multi-warehouse')}
          description={t('Off: the menu, pages and warehouse pickers are hidden and everything works exactly as before. Turning it on creates a “Main Warehouse” per branch holding all current stock. Turning it off later keeps all data — turn it on again and everything is where you left it.')}
          icon={<WarehouseIcon />}
          tone='sky'
        >
          <SwitchRow label={t('Use warehouses')} checked={form.enabled} onChange={(v) => set('enabled', v)} disabled={disabled} />
          <div className={cn('space-y-4', off && 'pointer-events-none opacity-50')}>
            <SwitchRow
              label={t('Bins / shelves inside warehouses')}
              hint={t('Zone → rack → shelf → bin locations. Off hides the Bins tab and bin pickers.')}
              checked={form.useLocations}
              onChange={(v) => set('useLocations', v)}
              disabled={disabled}
            />
            <SwitchRow
              label={t('Ask which warehouse on invoices')}
              hint={t('Shows “Deliver from warehouse” on new invoices when the branch has more than one. Off: sales always come from the default warehouse.')}
              checked={form.askOnSales}
              onChange={(v) => set('askOnSales', v)}
              disabled={disabled}
            />
            <SwitchRow
              label={t('Ask which warehouse on purchases')}
              hint={t('Shows “Receive into warehouse” on purchases. Off: purchases go into the default warehouse.')}
              checked={form.askOnPurchases}
              onChange={(v) => set('askOnPurchases', v)}
              disabled={disabled}
            />
            <SwitchRow
              label={t('Show warehouse on invoice prints')}
              hint={t('Adds “Warehouse: …” to printed invoices and receipts. Off by default — customers usually don’t need it.')}
              checked={form.showOnPrints}
              onChange={(v) => set('showOnPrints', v)}
              disabled={disabled}
            />
            <SwitchRow
              label={t('Stop transfers that would go below zero')}
              hint={t('A transfer cannot move more than the source warehouse / bin holds.')}
              checked={form.blockNegativeTransfers}
              onChange={(v) => set('blockNegativeTransfers', v)}
              disabled={disabled}
            />
          </div>
        </EntityFormSection>

        <div className='rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground'>
          <p className='mb-1 font-medium text-foreground'>{t('How stock is counted')}</p>
          <p>
            {t('The branch total never changes because of warehouses. Each branch has one default warehouse that holds everything not placed in another warehouse or bin — so sales returns, stock adjustments, stock counts and branch-to-branch transfers keep working unchanged and use the default warehouse.')}
          </p>
        </div>

        <div className='flex flex-wrap items-center justify-between gap-2'>
          {form.enabled && data?.enabled ? (
            <Button variant='link' asChild className='px-0'>
              <Link to='/warehouses'>
                {t('Open Warehouses')}
                <ArrowRight className='ml-1 h-4 w-4' />
              </Link>
            </Button>
          ) : (
            <span />
          )}
          {canEdit ? (
            <Button onClick={onSave} disabled={saving || !dirty}>
              {saving && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
              {t('Save')}
            </Button>
          ) : (
            <p className='text-xs text-muted-foreground'>{t('Only users who can edit settings can change this.')}</p>
          )}
        </div>
      </div>
    </ContentSection>
  )
}

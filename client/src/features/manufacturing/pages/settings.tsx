import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  useGetManufacturingSettingsQuery,
  useUpdateManufacturingSettingsMutation,
  type ManufacturingSettings,
  type ProductionPriority,
  type RejectDisposition,
} from '@/stores/manufacturing.api'
import { getErrorMessage } from '@/lib/get-error-message'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { DemoDataCard } from '../components/demo-data'
import { PageHeader } from '../components/page'
import { PRIORITIES, PRIORITY_META } from '../lib/constants'

type PrefixKey = keyof ManufacturingSettings['prefixes']
const PREFIX_FIELDS: { key: PrefixKey; label: string }[] = [
  { key: 'bom', label: 'Bill of materials' },
  { key: 'productionOrder', label: 'Production order' },
  { key: 'assemblyOrder', label: 'Assembly order' },
  { key: 'materialIssue', label: 'Material issue' },
  { key: 'materialReturn', label: 'Material return' },
  { key: 'productionOutput', label: 'Production output' },
  { key: 'productionReceipt', label: 'Finished goods receipt' },
  { key: 'scrap', label: 'Scrap record' },
]

const TOGGLES: {
  key:
    | 'requireBomForProduction'
    | 'explodeSubAssemblies'
    | 'allowNegativeStockIssue'
    | 'allowOverProduction'
    | 'requireQualityCheck'
  label: string
  help: string
}[] = [
  {
    key: 'requireQualityCheck',
    label: 'Quality check before finished goods',
    help: 'Reported output waits in a QC hold until inspected. When off, good and rejected quantities are posted with the output.',
  },
  {
    key: 'requireBomForProduction',
    label: 'Require a BOM on every production order',
    help: 'Orders cannot be created or released without one.',
  },
  {
    key: 'explodeSubAssemblies',
    label: 'Explode sub-assemblies into their components',
    help: 'When off, a sub-assembly is issued from stock as a single item.',
  },
  {
    key: 'allowNegativeStockIssue',
    label: 'Allow issuing more material than is in stock',
    help: 'Stock may go negative, matching the POS overselling policy.',
  },
  {
    key: 'allowOverProduction',
    label: 'Allow producing more than planned',
    help: 'When off, output reports stop at the planned quantity.',
  },
]

export default function ManufacturingSettingsPage() {
  const { t } = useLanguage()
  const { hasPermission } = usePermissions()
  const canEdit = hasPermission('manageManufacturingSettings')
  const { data, isLoading } = useGetManufacturingSettingsQuery()
  const [save, { isLoading: saving }] = useUpdateManufacturingSettingsMutation()
  const [form, setForm] = useState<ManufacturingSettings | null>(null)

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  if (isLoading || !form) {
    return (
      <div className='space-y-6'>
        <Skeleton className='h-10 w-64' />
        <Skeleton className='h-72 w-full rounded-xl' />
        <Skeleton className='h-48 w-full rounded-xl' />
      </div>
    )
  }

  const set = <K extends keyof ManufacturingSettings>(
    key: K,
    value: ManufacturingSettings[K]
  ) => setForm({ ...form, [key]: value })
  const preview = (prefix: string) =>
    `${prefix || '—'}-${String(1).padStart(form.numberPadding, '0')}`

  const submit = async () => {
    try {
      await save({
        prefixes: form.prefixes,
        numberPadding: form.numberPadding,
        defaultSourceLocation: form.defaultSourceLocation,
        defaultWipLocation: form.defaultWipLocation,
        defaultFinishedGoodsLocation: form.defaultFinishedGoodsLocation,
        allowNegativeStockIssue: form.allowNegativeStockIssue,
        allowOverProduction: form.allowOverProduction,
        requireBomForProduction: form.requireBomForProduction,
        explodeSubAssemblies: form.explodeSubAssemblies,
        defaultPriority: form.defaultPriority,
        requireQualityCheck: form.requireQualityCheck,
        defaultRejectDisposition: form.defaultRejectDisposition,
      }).unwrap()
      toast.success(t('Manufacturing settings saved'))
    } catch (err) {
      toast.error(getErrorMessage(err, t('Failed to save settings')))
    }
  }

  const dirty = !!data && JSON.stringify(form) !== JSON.stringify(data)

  return (
    <div className='space-y-8 pb-16'>
      <PageHeader
        title={t('Settings')}
        description={t(
          'Organization-wide defaults for numbering, locations and production rules.'
        )}
      />

      <SettingsSection
        title={t('Document numbering')}
        description={t(
          'Prefixes apply to new documents; existing numbers never change.'
        )}
      >
        <div className='divide-y'>
          {PREFIX_FIELDS.map((field) => (
            <div
              key={field.key}
              className='grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-center gap-3 px-5 py-2.5 max-sm:grid-cols-[minmax(0,1fr)_5.5rem] max-sm:px-4'
            >
              <Label htmlFor={`prefix-${field.key}`} className='font-normal'>
                {t(field.label)}
              </Label>
              <Input
                id={`prefix-${field.key}`}
                value={form.prefixes[field.key] || ''}
                disabled={!canEdit}
                maxLength={10}
                showVoiceInput={false}
                className='h-9 font-mono uppercase'
                onChange={(e) =>
                  set('prefixes', {
                    ...form.prefixes,
                    [field.key]: e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, ''),
                  })
                }
              />
              <span className='text-muted-foreground font-mono text-xs max-sm:hidden'>
                {preview(form.prefixes[field.key])}
              </span>
            </div>
          ))}
          <div className='grid grid-cols-[minmax(0,1fr)_6.5rem_6.5rem] items-center gap-3 px-5 py-2.5 max-sm:grid-cols-[minmax(0,1fr)_5.5rem] max-sm:px-4'>
            <Label htmlFor='number-padding' className='font-normal'>
              {t('Number digits')}
            </Label>
            <Input
              id='number-padding'
              type='number'
              min={3}
              max={10}
              value={form.numberPadding}
              disabled={!canEdit}
              className='h-9'
              onChange={(e) =>
                set(
                  'numberPadding',
                  Math.min(10, Math.max(3, Number(e.target.value) || 5))
                )
              }
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Defaults for new orders')}
        description={t(
          'Pre-filled on new production and assembly orders. Stock itself is held per branch.'
        )}
      >
        <div className='grid gap-4 px-5 py-4 max-sm:px-4 sm:grid-cols-2'>
          {(
            [
              ['defaultSourceLocation', t('Raw material / source location')],
              ['defaultWipLocation', t('Work in progress location')],
              ['defaultFinishedGoodsLocation', t('Finished goods location')],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className='grid gap-1.5'>
              <Label htmlFor={key}>{label}</Label>
              <Input
                id={key}
                value={form[key]}
                disabled={!canEdit}
                onChange={(e) => set(key, e.target.value)}
              />
            </div>
          ))}
          <div className='grid gap-1.5'>
            <Label>{t('Default priority')}</Label>
            <Select
              value={form.defaultPriority}
              disabled={!canEdit}
              onValueChange={(v) =>
                set('defaultPriority', v as ProductionPriority)
              }
            >
              <SelectTrigger aria-label={t('Default priority')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {t(PRIORITY_META[p].label)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Production rules')}
        description={t('How strictly orders, stock and quality are enforced.')}
      >
        <div className='divide-y'>
          {TOGGLES.map((toggle) => (
            <div
              key={toggle.key}
              className='flex items-start justify-between gap-4 px-5 py-3.5 max-sm:px-4'
            >
              <div className='space-y-0.5'>
                <Label htmlFor={toggle.key} className='font-medium'>
                  {t(toggle.label)}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {t(toggle.help)}
                </p>
              </div>
              <Switch
                id={toggle.key}
                checked={form[toggle.key]}
                disabled={!canEdit}
                onCheckedChange={(v) => set(toggle.key, v)}
              />
            </div>
          ))}
          <div className='flex items-start justify-between gap-4 px-5 py-3.5 max-sm:flex-col max-sm:px-4'>
            <div className='space-y-0.5'>
              <Label className='font-medium'>
                {t('Rejected output goes to')}
              </Label>
              <p className='text-muted-foreground text-sm'>
                {t(
                  'Default choice at inspection; it can be changed for each inspection.'
                )}
              </p>
            </div>
            <Select
              value={form.defaultRejectDisposition}
              disabled={!canEdit}
              onValueChange={(v) =>
                set('defaultRejectDisposition', v as RejectDisposition)
              }
            >
              <SelectTrigger
                className='w-36 max-sm:w-full'
                aria-label={t('Rejected output goes to')}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='scrap'>{t('Scrap')}</SelectItem>
                <SelectItem value='rework'>{t('Rework')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title={t('Demo data')}
        description={t(
          'Load a sample factory to explore the module, then remove it in one step.'
        )}
        bare
      >
        <DemoDataCard />
      </SettingsSection>

      {canEdit && dirty && (
        <div
          className='bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-4 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur'
          role='region'
          aria-label={t('Unsaved changes')}
        >
          <span className='text-sm font-medium'>
            {t('You have unsaved changes')}
          </span>
          <div className='flex gap-2 max-sm:w-full max-sm:[&>*]:flex-1'>
            <Button
              variant='outline'
              onClick={() => data && setForm(data)}
              disabled={saving}
            >
              {t('Discard')}
            </Button>
            <Button onClick={submit} disabled={saving}>
              {saving ? t('Saving…') : t('Save changes')}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

/** Settings group: what it is on the left (top on small screens), the fields on the right. */
function SettingsSection({
  title,
  description,
  children,
  bare,
}: {
  title: string
  description: string
  children: React.ReactNode
  /** Render children without the card frame (they bring their own). */
  bare?: boolean
}) {
  return (
    <section className='grid gap-4 lg:grid-cols-[16rem_minmax(0,1fr)] lg:gap-8'>
      <div className='space-y-1'>
        <h3 className='text-sm font-semibold'>{title}</h3>
        <p className='text-muted-foreground text-sm'>{description}</p>
      </div>
      {bare ? (
        <div>{children}</div>
      ) : (
        <div className='bg-card overflow-hidden rounded-xl border'>
          {children}
        </div>
      )}
    </section>
  )
}

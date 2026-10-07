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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import { SectionHeader } from '../components/manufacturing-shell'
import { PRIORITIES, PRIORITY_META } from '../lib/constants'

type PrefixKey = keyof ManufacturingSettings['prefixes']
const PREFIX_FIELDS: { key: PrefixKey; label: string }[] = [
  { key: 'bom', label: 'Bill of materials' },
  { key: 'productionOrder', label: 'Production order' },
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

  if (isLoading || !form) return <Skeleton className='h-96 w-full rounded-xl' />

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

  return (
    <div className='space-y-4'>
      <SectionHeader
        title={t('Manufacturing settings')}
        description={t(
          'Organization-wide defaults for numbering, locations and production rules.'
        )}
        actions={
          canEdit && (
            <Button
              onClick={submit}
              disabled={saving}
              className='max-sm:w-full'
            >
              {t('Save settings')}
            </Button>
          )
        }
      />
      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('Document numbering')}
            </CardTitle>
            <CardDescription>
              {t(
                'Prefixes apply to new documents; existing numbers never change.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {PREFIX_FIELDS.map((field) => (
              <div
                key={field.key}
                className='grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3'
              >
                <Label className='font-normal'>{t(field.label)}</Label>
                <Input
                  value={form.prefixes[field.key]}
                  disabled={!canEdit}
                  maxLength={10}
                  onChange={(e) =>
                    set('prefixes', {
                      ...form.prefixes,
                      [field.key]: e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, ''),
                    })
                  }
                />
                <span className='text-muted-foreground font-mono text-xs'>
                  {preview(form.prefixes[field.key])}
                </span>
              </div>
            ))}
            <div className='grid grid-cols-[minmax(0,1fr)_7rem_7rem] items-center gap-3'>
              <Label className='font-normal'>{t('Number digits')}</Label>
              <Input
                type='number'
                min={3}
                max={10}
                value={form.numberPadding}
                disabled={!canEdit}
                onChange={(e) =>
                  set(
                    'numberPadding',
                    Math.min(10, Math.max(3, Number(e.target.value) || 5))
                  )
                }
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className='text-base'>
              {t('Default locations')}
            </CardTitle>
            <CardDescription>
              {t(
                'Pre-filled on new production orders. Stock itself is held per branch.'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            {(
              [
                ['defaultSourceLocation', t('Raw material / source')],
                ['defaultWipLocation', t('Work in progress')],
                ['defaultFinishedGoodsLocation', t('Finished goods')],
              ] as const
            ).map(([key, label]) => (
              <div key={key} className='grid gap-1.5'>
                <Label>{label}</Label>
                <Input
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
                <SelectTrigger>
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
          </CardContent>
        </Card>

        <Card className='lg:col-span-2'>
          <CardHeader>
            <CardTitle className='text-base'>{t('Production rules')}</CardTitle>
          </CardHeader>
          <CardContent className='divide-y'>
            {TOGGLES.map((toggle) => (
              <div
                key={toggle.key}
                className='flex items-start justify-between gap-4 py-3 first:pt-0 last:pb-0'
              >
                <div>
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
            <div className='flex items-start justify-between gap-4 py-3 last:pb-0'>
              <div>
                <Label className='font-medium'>
                  {t('Rejected output goes to')}
                </Label>
                <p className='text-muted-foreground text-sm'>
                  {t(
                    'Default choice at inspection — can be changed for each inspection.'
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
                <SelectTrigger className='w-36'>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='scrap'>{t('Scrap')}</SelectItem>
                  <SelectItem value='rework'>{t('Rework')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <DemoDataCard />
      </div>
    </div>
  )
}

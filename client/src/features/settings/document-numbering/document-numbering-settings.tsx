import { useEffect, useState, type ReactNode } from 'react'
import { Loader2, FileText, ShoppingCart, FileSignature, Hash, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
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
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { getErrorMessage } from '@/lib/get-error-message'
import { useGetMyBranchesQuery } from '@/stores/branch.api'
import {
  useGetMyOrganizationQuery,
  useUpdateOrganizationSettingsMutation,
  usePreviewDocumentNumberingMutation,
  useSetDocumentNumberingNextNumberMutation,
  type DocumentNumberingConfig,
  type NumberingSectionConfig,
  type NumberingDateSegment,
  type NumberingResetPeriod,
  type NumberingDocType,
  type NumberingScope,
} from '@/stores/organization.api'

// Mirrors server/src/services/documentNumbering.service.js's formatNumber/dateSegmentFor
// exactly — kept in sync by hand since there's no shared code between the Node backend and
// this Vite frontend. Used for instant, zero-latency preview as prefix/separator/padding
// change; the numeric `seq` itself still comes from the server (see NumberingSection below).
const dateSegmentFor = (dateSegment: NumberingDateSegment, date: Date) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  if (dateSegment === 'yearly') return String(year)
  if (dateSegment === 'monthly') return `${year}${month}`
  return ''
}
const formatPreviewNumber = (config: NumberingSectionConfig, seq: number, now = new Date()) => {
  const segment = dateSegmentFor(config.dateSegment, now)
  return [config.prefix, segment, String(Math.max(seq, 0)).padStart(config.padding, '0')]
    .filter(Boolean)
    .join(config.separator || '')
}

// Granularity ranking — a reset period can never be more frequent than the date segment
// shown, or two numerically-distinct counters would print identically (e.g. a yearly segment
// with a monthly reset would show "INV-2026-000001" in both February and March). Mirrors
// documentNumbering.service.js's assertNumberingConsistency.
const GRANULARITY: Record<string, number> = { none: 0, never: 0, yearly: 1, monthly: 2 }

const DATE_SEGMENT_OPTIONS: Array<{ value: NumberingDateSegment; label: string }> = [
  { value: 'none', label: 'None — no date shown' },
  { value: 'yearly', label: 'Year (YYYY)' },
  { value: 'monthly', label: 'Year + Month (YYYYMM)' },
]

const RESET_PERIOD_OPTIONS: Array<{ value: NumberingResetPeriod; label: string }> = [
  { value: 'never', label: 'Never — keeps counting up' },
  { value: 'yearly', label: 'Every year' },
  { value: 'monthly', label: 'Every month' },
]

const SCOPE_OPTIONS: Array<{ value: NumberingScope; label: string; description: string }> = [
  {
    value: 'organization',
    label: 'Organization-wide',
    description: 'One running sequence shared by every branch — no gaps across the whole business.',
  },
  {
    value: 'branch',
    label: 'Per branch',
    description: 'Each branch counts its own sequence independently, e.g. Branch A and Branch B can both reach 1000 at the same time.',
  },
]

const clampResetPeriod = (dateSegment: NumberingDateSegment, resetPeriod: NumberingResetPeriod): NumberingResetPeriod =>
  GRANULARITY[resetPeriod] > GRANULARITY[dateSegment] ? (dateSegment === 'none' ? 'never' : dateSegment) : resetPeriod

const SECTION_META: Record<NumberingDocType, { title: string; description: string; icon: ReactNode }> = {
  invoice: {
    title: 'Invoice Numbering',
    description: 'Cash, credit, and pending sales invoices.',
    icon: <FileText />,
  },
  purchase: {
    title: 'Purchase Numbering',
    description: 'Purchase bills recorded from suppliers.',
    icon: <ShoppingCart />,
  },
  quotation: {
    title: 'Quotation Numbering',
    description: 'Quotations, before they convert to an invoice.',
    icon: <FileSignature />,
  },
}

function NumberingSection({
  orgId,
  docType,
  value,
  onChange,
}: {
  orgId: string
  docType: NumberingDocType
  value: NumberingSectionConfig
  onChange: (next: NumberingSectionConfig) => void
}) {
  const meta = SECTION_META[docType]
  const [fetchPreview, { data: previewResult, isLoading: previewLoading }] = usePreviewDocumentNumberingMutation()
  const [setNextNumber, { isLoading: settingNext }] = useSetDocumentNumberingNextNumberMutation()
  const [nextNumberInput, setNextNumberInput] = useState('')
  const { data: branches = [] } = useGetMyBranchesQuery(undefined, { skip: value.scope !== 'branch' })
  const [selectedBranchId, setSelectedBranchId] = useState('')

  // Default to the org's default branch (or just the first one) the moment branches load and
  // nothing's picked yet — only matters once scope is switched to 'branch'.
  useEffect(() => {
    if (selectedBranchId || branches.length === 0) return
    setSelectedBranchId(branches.find((b) => b.isDefault)?.id ?? branches[0].id)
  }, [branches, selectedBranchId])

  const branchId = value.scope === 'branch' ? selectedBranchId : undefined
  const branchNotReady = value.scope === 'branch' && !branchId

  // Only re-asks the server when dateSegment/resetPeriod/scope/branch change — those are the
  // only things that pick a different counter bucket. Prefix/separator/padding are pure
  // re-formatting of the already-fetched seq, done instantly below with no round trip.
  useEffect(() => {
    if (branchNotReady) return
    fetchPreview({ orgId, docType, config: value, branchId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, docType, value.dateSegment, value.resetPeriod, value.scope, branchId, branchNotReady])

  const nextSeq = previewResult?.nextSeq ?? 1
  const previewText = formatPreviewNumber(value, nextSeq)

  const handleDateSegmentChange = (dateSegment: NumberingDateSegment) => {
    onChange({ ...value, dateSegment, resetPeriod: clampResetPeriod(dateSegment, value.resetPeriod) })
  }

  const parsedNextNumber = Number(nextNumberInput)
  const nextNumberValid = nextNumberInput.trim() !== '' && Number.isFinite(parsedNextNumber) && parsedNextNumber >= 1
  const nextNumberWouldCollide = nextNumberValid && parsedNextNumber < nextSeq

  const handleSetNextNumber = async () => {
    if (!nextNumberValid || nextNumberWouldCollide || branchNotReady) return
    try {
      const result = await setNextNumber({ orgId, docType, nextNumber: parsedNextNumber, branchId }).unwrap()
      toast.success(`Next ${meta.title.toLowerCase()} number set to ${result.preview}`)
      setNextNumberInput('')
      fetchPreview({ orgId, docType, config: value, branchId })
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update the next number'))
    }
  }

  return (
    <EntityFormSection title={meta.title} description={meta.description} icon={meta.icon}>
      <div className='grid gap-4 sm:grid-cols-2'>
        <div className='sm:col-span-2'>
          <Label className='text-sm'>Numbering scope</Label>
          <Select value={value.scope} onValueChange={(v) => onChange({ ...value, scope: v as NumberingScope })}>
            <SelectTrigger className='mt-1'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SCOPE_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className='mt-1 text-xs text-muted-foreground'>{SCOPE_OPTIONS.find((o) => o.value === value.scope)?.description}</p>
        </div>
        {value.scope === 'branch' && (
          <div className='sm:col-span-2'>
            <Label className='text-sm'>Branch</Label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger className='mt-1'>
                <Building2 className='h-4 w-4 shrink-0 text-muted-foreground' />
                <SelectValue placeholder='Select a branch' />
              </SelectTrigger>
              <SelectContent>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                    {b.isDefault ? ' (Default)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className='mt-1 text-xs text-muted-foreground'>
              Preview and "Resume from number" below apply to this branch only — every branch keeps its own independent sequence.
            </p>
          </div>
        )}
        <div>
          <Label className='text-sm'>Prefix</Label>
          <Input
            value={value.prefix}
            onChange={(e) => onChange({ ...value, prefix: e.target.value.replace(/[^A-Za-z0-9]/g, '').slice(0, 12) })}
            placeholder='INV'
            className='mt-1'
          />
        </div>
        <div>
          <Label className='text-sm'>Separator</Label>
          <Input
            value={value.separator}
            onChange={(e) => onChange({ ...value, separator: e.target.value.slice(0, 3) })}
            placeholder='-'
            className='mt-1'
          />
        </div>
        <div>
          <Label className='text-sm'>Date shown in number</Label>
          <Select value={value.dateSegment} onValueChange={(v) => handleDateSegmentChange(v as NumberingDateSegment)}>
            <SelectTrigger className='mt-1'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_SEGMENT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className='text-sm'>Reset sequence</Label>
          <Select
            value={value.resetPeriod}
            onValueChange={(v) => onChange({ ...value, resetPeriod: v as NumberingResetPeriod })}
          >
            <SelectTrigger className='mt-1'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RESET_PERIOD_OPTIONS.filter((o) => GRANULARITY[o.value] <= GRANULARITY[value.dateSegment]).map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className='text-sm'>Digits</Label>
          <Input
            type='number'
            min={1}
            max={10}
            value={value.padding}
            onChange={(e) => onChange({ ...value, padding: Math.min(10, Math.max(1, Number(e.target.value) || 1)) })}
            className='mt-1'
          />
        </div>
      </div>

      <div className='flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2'>
        <Hash className='h-4 w-4 shrink-0 text-muted-foreground' />
        <span className='text-sm text-muted-foreground'>Preview:</span>
        {branchNotReady ? (
          <span className='text-sm text-muted-foreground'>Select a branch above</span>
        ) : previewLoading && !previewResult ? (
          <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />
        ) : (
          <span className='font-mono text-sm font-medium'>{previewText}</span>
        )}
      </div>

      <div className='flex flex-wrap items-end gap-2 pt-1'>
        <div>
          <Label className='text-sm'>Resume from number</Label>
          <Input
            type='number'
            min={1}
            placeholder={String(nextSeq)}
            value={nextNumberInput}
            onChange={(e) => setNextNumberInput(e.target.value)}
            disabled={branchNotReady}
            className='mt-1 w-40'
          />
        </div>
        <Button
          type='button'
          variant='outline'
          size='sm'
          disabled={!nextNumberValid || nextNumberWouldCollide || settingNext || branchNotReady}
          onClick={handleSetNextNumber}
        >
          {settingNext ? <Loader2 className='h-4 w-4 animate-spin' /> : 'Set'}
        </Button>
        {nextNumberWouldCollide && (
          <p className='w-full text-xs text-destructive'>
            Must be {nextSeq} or higher — numbers before that are already issued.
          </p>
        )}
      </div>
    </EntityFormSection>
  )
}

export default function DocumentNumberingSettings() {
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const [updateSettings, { isLoading: saving }] = useUpdateOrganizationSettingsMutation()
  const [config, setConfig] = useState<DocumentNumberingConfig | null>(null)

  useEffect(() => {
    if (org?.documentNumbering) setConfig(org.documentNumbering)
  }, [org])

  const hasChanges = !!org?.documentNumbering && !!config && JSON.stringify(config) !== JSON.stringify(org.documentNumbering)

  const handleSave = async () => {
    if (!org || !config) return
    try {
      await updateSettings({ orgId: org.id, body: { documentNumbering: config } }).unwrap()
      toast.success('Document numbering settings updated')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Failed to update document numbering settings'))
    }
  }

  useSettingsSaveShortcut(handleSave, saving)

  if (isLoading || !org || !config) {
    return (
      <ContentSection title='Document Numbering' desc='Customize how Invoice, Purchase, and Quotation numbers are generated.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title='Document Numbering'
      desc='Choose your own prefix, format, and reset behavior for each document type. Numbers are still generated automatically and are unique to your organization — other organizations never affect or share your sequence.'
    >
      <div className='space-y-6'>
        {(['invoice', 'purchase', 'quotation'] as const).map((docType) => (
          <NumberingSection
            key={docType}
            orgId={org.id}
            docType={docType}
            value={config[docType]}
            onChange={(next) => setConfig({ ...config, [docType]: next })}
          />
        ))}

        <div className='flex justify-end'>
          <Button onClick={handleSave} disabled={saving || !hasChanges}>
            {saving ? (
              <>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Saving...
              </>
            ) : (
              'Save'
            )}
          </Button>
        </div>
      </div>
    </ContentSection>
  )
}

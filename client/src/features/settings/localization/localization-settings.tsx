import { useEffect, useState } from 'react'
import { Loader2, Globe, Calendar } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import {
  useGetMyOrganizationQuery,
  useUpdateOrganizationSettingsMutation,
  type TaxSystem,
  type DateFormat,
} from '@/stores/organization.api'
import { useGetCountriesQuery, useLazyGetCountryDefaultsQuery } from '@/stores/localization.api'

const TAX_SYSTEM_OPTIONS: Array<{ value: TaxSystem; label: string; description: string }> = [
  { value: 'NONE', label: 'None', description: 'No automatic tax calculation — amounts are entered manually where needed.' },
  { value: 'VAT', label: 'VAT', description: 'Value Added Tax — common in the UK, EU, and Gulf countries.' },
  { value: 'SALES_TAX', label: 'Sales Tax', description: 'US-style jurisdiction taxation (state/county/city).' },
  { value: 'GST', label: 'GST', description: 'Goods and Services Tax — used in Canada, Australia, India.' },
  { value: 'CUSTOM', label: 'Custom', description: 'A tax system not covered above — configure categories and rates manually.' },
]

const DATE_FORMAT_OPTIONS: Array<{ value: DateFormat; example: string }> = [
  { value: 'DD/MM/YYYY', example: '31/01/2026' },
  { value: 'MM/DD/YYYY', example: '01/31/2026' },
  { value: 'YYYY-MM-DD', example: '2026-01-31' },
]

export default function LocalizationSettings() {
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const { data: countries } = useGetCountriesQuery()
  const [fetchCountryDefaults, { data: countryDefaults }] = useLazyGetCountryDefaultsQuery()
  const [updateSettings, { isLoading: saving }] = useUpdateOrganizationSettingsMutation()

  const [countryCode, setCountryCode] = useState('')
  const [taxSystem, setTaxSystem] = useState<TaxSystem>('NONE')
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [dateFormat, setDateFormat] = useState<DateFormat>('DD/MM/YYYY')
  const [locale, setLocale] = useState('en-US')
  const [defaultsAppliedNote, setDefaultsAppliedNote] = useState(false)

  useEffect(() => {
    if (!org) return
    setCountryCode(org.countryCode || '')
    setTaxSystem(org.taxSystem || 'NONE')
    setTaxInclusive(!!org.taxInclusivePricingDefault)
    setDateFormat(org.dateFormat || 'DD/MM/YYYY')
    setLocale(org.locale || 'en-US')
  }, [org])

  const countryOptions = (countries || []).map((c) => ({ value: c.code, label: c.name }))

  const handleCountryChange = async (value: string) => {
    setCountryCode(value)
    if (!value) return
    const result = await fetchCountryDefaults(value).unwrap().catch(() => null)
    if (result) {
      setTaxSystem(result.taxSystem)
      setDateFormat(result.dateFormat as DateFormat)
      setLocale(result.locale)
      setDefaultsAppliedNote(true)
    }
  }

  const hasChanges =
    countryCode !== (org?.countryCode || '') ||
    taxSystem !== (org?.taxSystem || 'NONE') ||
    taxInclusive !== !!org?.taxInclusivePricingDefault ||
    dateFormat !== (org?.dateFormat || 'DD/MM/YYYY') ||
    locale !== (org?.locale || 'en-US')

  const handleSave = async () => {
    if (!org) return
    try {
      await updateSettings({
        orgId: org.id,
        body: { countryCode, taxSystem, taxInclusivePricingDefault: taxInclusive, dateFormat, locale },
      }).unwrap()
      toast.success('Localization settings updated')
      setDefaultsAppliedNote(false)
    } catch {
      toast.error('Failed to update localization settings')
    }
  }

  useSettingsSaveShortcut(handleSave, saving)

  if (isLoading || !org) {
    return (
      <ContentSection title='Localization' desc='Country, tax system, and regional formats.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title='Localization'
      desc='Country selection prefills your tax system and date format below — you can still override any of them before saving.'
    >
      <div className='space-y-6'>
        <EntityFormSection title='Country' description='Drives the suggested tax system, date format, and locale.' icon={<Globe />}>
          <SearchableSelect
            options={countryOptions}
            value={countryCode}
            onValueChange={handleCountryChange}
            placeholder='Select country'
            searchPlaceholder='Search countries...'
          />
          {defaultsAppliedNote && countryDefaults && (
            <p className='text-xs text-emerald-600 dark:text-emerald-400'>
              ✓ Defaults applied for this country — you can still override any setting below before saving.
            </p>
          )}
        </EntityFormSection>

        <EntityFormSection title='Tax System' description='Which tax framework this organization operates under.'>
          <RadioGroup value={taxSystem} onValueChange={(v) => setTaxSystem(v as TaxSystem)} className='grid gap-3 sm:grid-cols-2'>
            {TAX_SYSTEM_OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`tax-system-${option.value}`}
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  taxSystem === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <RadioGroupItem value={option.value} id={`tax-system-${option.value}`} className='mt-0.5' />
                <div className='min-w-0'>
                  <div className='text-sm font-medium'>{option.label}</div>
                  <div className='text-xs text-muted-foreground'>{option.description}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </EntityFormSection>

        {taxSystem !== 'NONE' && (
          <EntityFormSection title='Prices Include Tax?' description='Whether product prices are entered tax-exclusive (tax added on top) or tax-inclusive (tax already baked in).'>
            <RadioGroup
              value={taxInclusive ? 'INCLUSIVE' : 'EXCLUSIVE'}
              onValueChange={(v) => setTaxInclusive(v === 'INCLUSIVE')}
              className='grid gap-3 sm:grid-cols-2'
            >
              <Label
                htmlFor='tax-pricing-exclusive'
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  !taxInclusive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <RadioGroupItem value='EXCLUSIVE' id='tax-pricing-exclusive' className='mt-0.5' />
                <div className='min-w-0'>
                  <div className='text-sm font-medium'>Tax Exclusive</div>
                  <div className='text-xs text-muted-foreground'>Tax is added to the product price (e.g. £100 + 20% VAT = £120 total).</div>
                </div>
              </Label>
              <Label
                htmlFor='tax-pricing-inclusive'
                className={`flex items-start gap-3 rounded-lg border p-3 cursor-pointer transition-colors ${
                  taxInclusive ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <RadioGroupItem value='INCLUSIVE' id='tax-pricing-inclusive' className='mt-0.5' />
                <div className='min-w-0'>
                  <div className='text-sm font-medium'>Tax Inclusive</div>
                  <div className='text-xs text-muted-foreground'>The product price already includes tax (e.g. £120 shown includes £20 VAT).</div>
                </div>
              </Label>
            </RadioGroup>
          </EntityFormSection>
        )}

        <EntityFormSection title='Date & Locale' description='How dates are displayed throughout the app.' icon={<Calendar />}>
          <RadioGroup value={dateFormat} onValueChange={(v) => setDateFormat(v as DateFormat)} className='grid gap-3 sm:grid-cols-3'>
            {DATE_FORMAT_OPTIONS.map((option) => (
              <Label
                key={option.value}
                htmlFor={`date-format-${option.value}`}
                className={`flex flex-col gap-1 rounded-lg border p-3 cursor-pointer transition-colors ${
                  dateFormat === option.value ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                }`}
              >
                <div className='flex items-center gap-2'>
                  <RadioGroupItem value={option.value} id={`date-format-${option.value}`} />
                  <span className='text-sm font-medium'>{option.value}</span>
                </div>
                <span className='text-xs text-muted-foreground pl-6'>{option.example}</span>
              </Label>
            ))}
          </RadioGroup>
          <div className='max-w-xs'>
            <Label className='text-sm'>Locale</Label>
            <Input value={locale} onChange={(e) => setLocale(e.target.value)} placeholder='en-US' className='mt-1' />
          </div>
        </EntityFormSection>

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

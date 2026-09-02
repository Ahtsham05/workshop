import { useEffect, useState } from 'react'
import { Loader2, Coins } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import { useGetMyOrganizationQuery, useUpdateOrganizationSettingsMutation } from '@/stores/organization.api'
import { useGetCurrenciesQuery } from '@/stores/localization.api'
import { formatMoneyWithMeta } from '@/lib/format-money'

export default function CurrencySettings() {
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const { data: currencies } = useGetCurrenciesQuery()
  const [updateSettings, { isLoading: saving }] = useUpdateOrganizationSettingsMutation()

  const [baseCurrency, setBaseCurrency] = useState('')
  const [enabledCurrencies, setEnabledCurrencies] = useState<string[]>([])

  useEffect(() => {
    if (!org) return
    setBaseCurrency(org.baseCurrency || '')
    setEnabledCurrencies(org.enabledCurrencies || [])
  }, [org])

  const currencyOptions = (currencies || []).map((c) => ({
    value: c.code,
    label: `${c.code} — ${c.name} (${c.symbol})`,
  }))

  const selectedMeta = currencies?.find((c) => c.code === baseCurrency)

  const toggleEnabled = (code: string, checked: boolean) => {
    setEnabledCurrencies((prev) => (checked ? [...prev, code] : prev.filter((c) => c !== code)))
  }

  const hasChanges =
    baseCurrency !== (org?.baseCurrency || '') ||
    JSON.stringify([...enabledCurrencies].sort()) !== JSON.stringify([...(org?.enabledCurrencies || [])].sort())

  const handleSave = async () => {
    if (!org) return
    try {
      await updateSettings({ orgId: org.id, body: { baseCurrency, enabledCurrencies } }).unwrap()
      toast.success('Currency settings updated')
    } catch {
      toast.error('Failed to update currency settings')
    }
  }

  useSettingsSaveShortcut(handleSave, saving)

  if (isLoading || !org) {
    return (
      <ContentSection title='Currency' desc='Base currency and additional currencies this organization can transact in.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title='Currency'
      desc='Base currency and additional currencies this organization can transact in.'
    >
      <div className='space-y-6'>
        {org.baseCurrency && (
          <Alert>
            <AlertDescription className='text-xs'>
              Changing the base currency affects how new transactions are recorded going forward. Existing invoices and
              purchases keep their original currency and are not affected.
            </AlertDescription>
          </Alert>
        )}

        <EntityFormSection title='Base Currency' description="Your organization's accounting/reporting currency." icon={<Coins />}>
          <SearchableSelect
            options={currencyOptions}
            value={baseCurrency}
            onValueChange={setBaseCurrency}
            placeholder='Select base currency'
            searchPlaceholder='Search currencies...'
          />
        </EntityFormSection>

        {currencies && currencies.length > 0 && (
          <EntityFormSection title='Additional Currencies' description='Other currencies this organization can bill or pay in.'>
            <div className='grid gap-2 sm:grid-cols-2'>
              {currencies
                .filter((c) => c.code !== baseCurrency)
                .map((c) => (
                  <Label key={c.code} className='flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/50'>
                    <Checkbox
                      checked={enabledCurrencies.includes(c.code)}
                      onCheckedChange={(checked) => toggleEnabled(c.code, checked === true)}
                    />
                    <span className='text-sm'>
                      {c.code} — {c.name} ({c.symbol})
                    </span>
                  </Label>
                ))}
            </div>
          </EntityFormSection>
        )}

        {selectedMeta && (
          <EntityFormSection title='Invoice Preview' description='A live preview of how amounts will be formatted.'>
            <Card>
              <CardContent className='space-y-1 pt-6 text-sm'>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Subtotal</span>
                  <span>{formatMoneyWithMeta(1250, selectedMeta)}</span>
                </div>
                <div className='flex justify-between'>
                  <span className='text-muted-foreground'>Tax</span>
                  <span>{formatMoneyWithMeta(250, selectedMeta)}</span>
                </div>
                <div className='flex justify-between border-t pt-1 font-semibold'>
                  <span>Total</span>
                  <span>{formatMoneyWithMeta(1500, selectedMeta)}</span>
                </div>
              </CardContent>
            </Card>
          </EntityFormSection>
        )}

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

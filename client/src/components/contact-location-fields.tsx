import { useId, useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { Building2, Globe2, Map as MapIcon } from 'lucide-react'
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { STATE_SUGGESTIONS, getCountryOptions } from '@/lib/countries'

const STATE_LABELS: Record<string, string> = {
  US: 'State',
  AU: 'State',
  IN: 'State',
  CA: 'Province',
  PK: 'Province',
  AE: 'Emirate',
  GB: 'Region',
}

/**
 * City · State/Province · Country row for the customer / supplier forms (wholesale &
 * distributor orgs). Lives inside a react-hook-form <Form> with flat `city`, `state`
 * and `countryCode` fields; turn them into a `billingAddress` with locationToPayload (lib/countries.ts).
 */
export function ContactLocationFields() {
  const form = useFormContext<{ city?: string; state?: string; countryCode?: string }>()
  const countryCode = useWatch({ control: form.control, name: 'countryCode' }) || ''
  const listId = useId()
  const countryOptions = useMemo(() => getCountryOptions(), [])
  const suggestions = STATE_SUGGESTIONS[countryCode] || []
  const stateLabel = STATE_LABELS[countryCode] || 'State / Province'

  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-3'>
      <FormField
        control={form.control}
        name='city'
        render={({ field }) => (
          <FormItem className='gap-1.5'>
            <FormLabel>City</FormLabel>
            <FormControl>
              <div className='relative'>
                <Building2 className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input placeholder='e.g. Lahore' autoComplete='off' className='pl-9' {...field} value={field.value ?? ''} />
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name='state'
        render={({ field }) => (
          <FormItem className='gap-1.5'>
            <FormLabel>{stateLabel}</FormLabel>
            <FormControl>
              <div className='relative'>
                <MapIcon className='pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                <Input
                  placeholder={suggestions.length ? `Type or pick a ${stateLabel.toLowerCase()}` : stateLabel}
                  autoComplete='off'
                  list={suggestions.length ? listId : undefined}
                  className='pl-9'
                  {...field}
                  value={field.value ?? ''}
                />
                {suggestions.length > 0 && (
                  <datalist id={listId}>
                    {suggestions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label !== option.value ? option.label : undefined}
                      </option>
                    ))}
                  </datalist>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormItem className='gap-1.5'>
        <FormLabel className='flex items-center gap-1.5'>
          <Globe2 className='h-3.5 w-3.5 text-muted-foreground' />
          Country
        </FormLabel>
        <SearchableSelect
          options={countryOptions}
          value={countryCode}
          onValueChange={(value) => form.setValue('countryCode', value, { shouldDirty: true })}
          placeholder='Select country'
          searchPlaceholder='Search countries...'
          emptyText='No country found'
          data-enter-field='countryCode'
        />
      </FormItem>
    </div>
  )
}

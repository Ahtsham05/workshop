import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Building2 } from 'lucide-react'
import { toast } from 'sonner'
import ContentSection from '../components/content-section'
import { EntityFormSection } from '@/components/entity-form-section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { handleFormEnterKeyDown } from '@/lib/form-enter-navigation'
import { useSettingsSaveShortcut } from '@/lib/settings-form-keyboard'
import {
  useGetMyOrganizationQuery,
  useUpdateOrganizationMutation,
} from '@/stores/organization.api'
import { useGetCountriesQuery, useLazyGetCountryDefaultsQuery } from '@/stores/localization.api'

const formSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  nameUrdu: z.string().optional(),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  countryCode: z.string().optional(),
  taxNumber: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export default function BusinessProfileSettings() {
  const { data: org, isLoading } = useGetMyOrganizationQuery()
  const { data: countries } = useGetCountriesQuery()
  const [fetchCountryDefaults, { data: countryDefaults }] = useLazyGetCountryDefaultsQuery()
  const [updateOrganization, { isLoading: saving }] = useUpdateOrganizationMutation()
  const [logoFile, setLogoFile] = useState<File | null>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      countryCode: '',
      taxNumber: '',
      website: '',
      description: '',
    },
  })

  useEffect(() => {
    if (!org) return
    form.reset({
      name: org.name || '',
      nameUrdu: org.nameUrdu || '',
      email: org.email || '',
      phone: org.phone || '',
      address: org.address || '',
      city: org.city || '',
      countryCode: org.countryCode || '',
      taxNumber: org.taxNumber || '',
      website: org.website || '',
      description: org.description || '',
       
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [org])

  const countryCode = form.watch('countryCode')
  useEffect(() => {
    if (countryCode && countryCode !== org?.countryCode) {
      fetchCountryDefaults(countryCode)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countryCode])

  const countryOptions = (countries || []).map((c) => ({ value: c.code, label: c.name }))
  const selectedCountryName = countries?.find((c) => c.code === countryCode)?.name

  const onSubmit = async (values: FormValues) => {
    if (!org) return
    try {
      await updateOrganization({
        orgId: org.id,
        body: {
          ...values,
          country: selectedCountryName || org.country,
        },
        logoFile,
      }).unwrap()
      toast.success('Business profile updated')
      setLogoFile(null)
    } catch {
      toast.error('Failed to update business profile')
    }
  }

  useSettingsSaveShortcut(() => form.handleSubmit(onSubmit)(), saving)

  if (isLoading || !org) {
    return (
      <ContentSection title='Business Profile' desc='Your organization&apos;s core details, shown on invoices and prints.'>
        <div className='flex items-center justify-center py-10 text-muted-foreground'>
          <Loader2 className='h-5 w-5 animate-spin' />
        </div>
      </ContentSection>
    )
  }

  return (
    <ContentSection
      title='Business Profile'
      desc="Your organization's core details, shown on invoices and prints. Country selection here also drives the default currency and tax system on the Localization page."
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} onKeyDown={handleFormEnterKeyDown} className='space-y-6'>
          <EntityFormSection title='Identity' description='Name and logo shown across the app and on prints.' icon={<Building2 />}>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='name'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name *</FormLabel>
                    <FormControl>
                      <Input placeholder='e.g. Acme Corporation' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='nameUrdu'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Name (Urdu)</FormLabel>
                    <FormControl>
                      <Input dir='rtl' className='text-right' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='space-y-2'>
              <FormLabel>Logo</FormLabel>
              <div className='flex items-center gap-3'>
                {org.logo?.url && !logoFile ? (
                  <img src={org.logo.url} alt='Business logo' className='h-14 w-14 rounded-md border object-cover' />
                ) : null}
                <Input
                  type='file'
                  accept='image/*'
                  onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
                  className='max-w-xs'
                />
              </div>
            </div>
          </EntityFormSection>

          <EntityFormSection title='Contact & Location' description='Address and contact details shown on invoices.'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='email'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Business Email</FormLabel>
                    <FormControl>
                      <Input type='email' placeholder='company@example.com' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='phone'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormItem>
                <FormLabel>Country</FormLabel>
                <SearchableSelect
                  options={countryOptions}
                  value={countryCode || ''}
                  onValueChange={(value) => form.setValue('countryCode', value, { shouldDirty: true })}
                  placeholder='Select country'
                  searchPlaceholder='Search countries...'
                  data-enter-field='countryCode'
                />
              </FormItem>
              <FormField
                control={form.control}
                name='city'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>City</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='address'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {countryCode && countryDefaults && countryCode !== org.countryCode && (
              <p className='text-xs text-muted-foreground'>
                ✓ Currency will default to {countryDefaults.defaultCurrency || '—'} · Tax system will default to{' '}
                {countryDefaults.taxSystem} — you can change these on the Localization and Currency pages.
              </p>
            )}
          </EntityFormSection>

          <EntityFormSection title='Business Details' description='Tax registration and web presence.'>
            <div className='grid gap-4 sm:grid-cols-2'>
              <FormField
                control={form.control}
                name='taxNumber'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{countryDefaults?.taxRegistrationLabel || 'Tax Registration Number'}</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name='website'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Website</FormLabel>
                    <FormControl>
                      <Input placeholder='https://yourcompany.com' {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name='description'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </EntityFormSection>

          <div className='flex justify-end'>
            <Button type='submit' disabled={saving || !form.formState.isDirty && !logoFile}>
              {saving ? (
                <>
                  <Loader2 className='mr-2 h-4 w-4 animate-spin' /> Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </div>
        </form>
      </Form>
    </ContentSection>
  )
}

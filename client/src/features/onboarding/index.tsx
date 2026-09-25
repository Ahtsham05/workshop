import { useEffect, useMemo, useRef, useState } from 'react'
import { z } from 'zod'
import { useForm, type UseFormReturn } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useDispatch, useSelector } from 'react-redux'
import toast from 'react-hot-toast'
import { ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Form } from '@/components/ui/form'
import {
  useSetupOrganizationMutation,
  useLazyGetMyOrganizationQuery,
} from '@/stores/organization.api'
import {
  useGetCountriesQuery,
  useGetCurrenciesQuery,
  useLazyGetCountryDefaultsQuery,
} from '@/stores/localization.api'
import { setActiveBranch, setUser } from '@/stores/auth.slice'
import { AppDispatch, RootState } from '@/stores/store'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { cn } from '@/lib/utils'
import { ONBOARDING_BUSINESS_TYPES } from '@/lib/business-types'
import { countryFlagEmoji } from '@/lib/country-flag'
import { OnboardingShell, type OnboardingStep } from './components/onboarding-shell'
import {
  BrandStep,
  BusinessStep,
  CTA_BUTTON_CLASS,
  LocationStep,
  SuccessStep,
  WelcomeStep,
  type OnboardingFormValues,
} from './components/onboarding-steps'

const formSchema = z.object({
  name: z.string().min(2, 'Business name must be at least 2 characters'),
  nameUrdu: z.string().optional(),
  businessType: z.string().min(1, 'Please select a business type'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  countryCode: z.string().optional(),
  baseCurrency: z.string().optional(),
  taxNumber: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
})

/** Welcome is index 0; the rail only lists the steps that ask for something. */
const STEPS: OnboardingStep[] = [
  { key: 'welcome', title: 'Welcome', description: 'What setup involves' },
  { key: 'business', title: 'Your business', description: 'Name, type and contact' },
  { key: 'location', title: 'Location & currency', description: 'Where you trade' },
  { key: 'brand', title: 'Logo & review', description: 'Finish setting up' },
  { key: 'done', title: 'All set', description: 'Start using Logix Plus' },
]

/**
 * Keeps the Urdu business name in step with the English one. Lives in its own component
 * so the hook (and the translation request it makes) only runs for accounts that asked
 * for Urdu input — a hook cannot be called conditionally, a component can be rendered
 * conditionally.
 */
function AutoUrduBusinessName({ form }: { form: UseFormReturn<OnboardingFormValues> }) {
  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu')
  return null
}

export default function OnboardingPage() {
  // The Urdu display default is "on" app-wide, which would put an Urdu name box in front
  // of every new account. Onboarding shows it only when someone has explicitly turned it
  // on in Display settings.
  const urduInputEnabled = localStorage.getItem('vite-ui-show-urdu-input') === 'true'
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [step, setStep] = useState(0)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [setupOrganization, { isLoading }] = useSetupOrganizationMutation()
  const [fetchMyOrganization] = useLazyGetMyOrganizationQuery()
  const [fetchCountryDefaults] = useLazyGetCountryDefaultsQuery()
  const { data: countries } = useGetCountriesQuery()
  const { data: currencies = [] } = useGetCurrenciesQuery()
  const [localeDefaults, setLocaleDefaults] = useState<{
    locale?: string
    dateFormat?: string
    taxSystem?: string
  }>({})

  const countryOptions = useMemo(
    () =>
      (countries || []).map((c) => {
        const flag = countryFlagEmoji(c.code)
        return {
          value: c.code,
          // The flag sits in the label so it shows both in the list and on the closed
          // trigger; the code stays visible for platforms that don't draw flag emoji.
          label: flag ? `${flag}  ${c.name}` : c.name,
          sublabel: c.code,
        }
      }),
    [countries]
  )
  const authData = useSelector((state: RootState) => state.auth.data)
  // Guards the form behind a check for whether this account is already onboarded
  // server-side — the locally-cached `onboardingComplete` flag can go stale (e.g. a
  // prior setup call that succeeded on the server but timed out on the client before
  // the response came back), which used to leave people stuck re-submitting a form
  // that the server would only reject. `null` = still checking, `true` = confirmed not
  // onboarded yet (show the form).
  const [readyToOnboard, setReadyToOnboard] = useState<boolean | null>(null)

  function applyOnboardedUser(
    organization: { id: string; businessType: string },
    branch?: { id?: string; _id?: string; name: string } | null
  ) {
    const existingUser = authData?.user || JSON.parse(localStorage.getItem('user') || '{}')
    const updatedUser = {
      ...existingUser,
      onboardingComplete: true,
      // Always force superAdmin, never fall back to whatever was cached — a fresh
      // registration defaults to systemRole: 'staff' server-side (see
      // server/src/models/user.model.js), and the org owner always becomes superAdmin
      // once setup completes, so a `|| 'superAdmin'` fallback here would wrongly keep
      // 'staff' (truthy) and get the user blocked by the route guard as under-permissioned.
      systemRole: 'superAdmin',
      organizationId: organization.id,
      businessType: organization.businessType,
    }
    localStorage.setItem('user', JSON.stringify(updatedUser))
    dispatch(setUser({ ...authData, user: updatedUser }))
    if (branch) {
      dispatch(setActiveBranch({ id: branch.id || branch._id || '', name: branch.name }))
    }
  }

  // On mount, confirm with the server rather than trusting the locally-cached flag —
  // if this account already has an organization, sync local state and leave instead of
  // showing (and letting the user resubmit) a form the server will just reject.
  useEffect(() => {
    let cancelled = false
    fetchMyOrganization()
      .unwrap()
      .then((organization) => {
        if (cancelled || !organization) return
        applyOnboardedUser(organization)
        navigate({ to: '/', replace: true })
      })
      .catch(() => {
        // No organization yet — this is the expected case for a genuinely new
        // account, so just show the form.
        if (!cancelled) setReadyToOnboard(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      businessType: '',
      // Prefilled with the address they just signed up with — almost always the same
      // one the business uses, and easy to change.
      email: authData?.user?.email ?? '',
      phone: '',
      address: '',
      city: '',
      country: '',
      countryCode: '',
      baseCurrency: '',
      taxNumber: '',
      website: '',
      description: '',
    },
  })

  // Default to the United States — that is who this is built for — so the currency,
  // date format and tax system are already right for most accounts. Runs once, and only
  // while the country is still untouched.
  const appliedDefaultCountry = useRef(false)
  useEffect(() => {
    if (appliedDefaultCountry.current) return
    if (!countries?.length || form.getValues('countryCode')) return
    if (!countries.some((c) => c.code === 'US')) return
    appliedDefaultCountry.current = true
    void handleCountryChange('US')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries])

  const logoPreviewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : ''), [logoFile])
  useEffect(
    () => () => {
      if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
    },
    [logoPreviewUrl]
  )

  /** Picking a country preloads the money/date/tax settings for that country. */
  async function handleCountryChange(code: string) {
    const selected = countries?.find((c) => c.code === code)
    form.setValue('countryCode', code, { shouldDirty: true })
    form.setValue('country', selected?.name || '', { shouldDirty: true })
    try {
      const defaults = await fetchCountryDefaults(code).unwrap()
      if (defaults.defaultCurrency) {
        // Always follow the country, don't just fill a blank: picking a new country and
        // being left with the previous country's currency is worse than no default.
        form.setValue('baseCurrency', defaults.defaultCurrency, { shouldDirty: true })
      }
      setLocaleDefaults({
        locale: defaults.locale,
        dateFormat: defaults.dateFormat,
        taxSystem: defaults.taxSystem,
      })
    } catch {
      // Reference data is a convenience — the user can still pick a currency by hand.
    }
  }

  async function goNext() {
    if (step === 1) {
      const valid = await form.trigger(['name', 'businessType', 'email'])
      if (!valid) return
    }
    setStep((current) => Math.min(current + 1, STEPS.length - 1))
  }

  async function onSubmit(data: OnboardingFormValues) {
    try {
      const nu = data.nameUrdu?.trim()
      const defaultBranchNameUrdu = nu ? `${nu} — مین برانچ` : ''
      const result = await setupOrganization({
        ...data,
        ...localeDefaults,
        defaultBranchNameUrdu,
        logoFile,
      }).unwrap()

      applyOnboardedUser(result.organization, result.branch)
      setStep(STEPS.length - 1)
    } catch (error: any) {
      // The server already has this account marked onboarded (most likely: an earlier
      // submit succeeded server-side but the response never made it back before the
      // client's request timeout, leaving local state stale) — recover by fetching the
      // real organization instead of leaving the user stuck on a form that will only
      // ever be rejected.
      if (error?.data?.message === 'Onboarding already completed') {
        try {
          const organization = await fetchMyOrganization().unwrap()
          applyOnboardedUser(organization)
          toast.success('Your company is already set up — taking you to the dashboard.')
          navigate({ to: '/', replace: true })
          return
        } catch {
          // Fall through to the generic error below.
        }
      }
      toast.error(error?.data?.message || 'Setup failed. Please try again.')
    }
  }

  if (readyToOnboard === null) {
    return (
      <div className='flex min-h-svh items-center justify-center'>
        <Loader2 className='text-primary h-8 w-8 animate-spin' />
      </div>
    )
  }

  const values = form.watch()
  const businessTypeLabel =
    ONBOARDING_BUSINESS_TYPES.find((bt) => bt.value === values.businessType)?.label || '—'
  const summary = [
    { label: 'Organization', value: values.name || '—' },
    { label: 'Main branch', value: values.name ? `${values.name} - Main Branch` : '—' },
    { label: 'Business type', value: businessTypeLabel },
    {
      label: 'Currency',
      value: values.baseCurrency || 'Not set (you can pick one later)',
    },
  ]

  return (
    <OnboardingShell steps={STEPS} current={step}>
      {step === 0 && (
        <WelcomeStep name={authData?.user?.name} onStart={() => setStep(1)} />
      )}

      {step === STEPS.length - 1 && (
        <SuccessStep
          businessName={values.name || 'Your business'}
          onContinue={() => navigate({ to: '/', replace: true })}
        />
      )}

      {step > 0 && step < STEPS.length - 1 && (
        <Form {...form}>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (step === STEPS.length - 2) {
                void form.handleSubmit(onSubmit)(event)
              } else {
                void goNext()
              }
            }}
            className='space-y-8'
          >
            <div className='space-y-1.5'>
              <p className='text-muted-foreground text-xs font-semibold tracking-wider uppercase'>
                Step {step} of {STEPS.length - 2}
              </p>
              <h1 className='text-2xl font-semibold tracking-tight'>{STEPS[step].title}</h1>
              <p className='text-muted-foreground text-sm'>
                {step === 1 && 'Tell us who you are. Only the name and type are required.'}
                {step === 2 && 'Where you trade, and the currency you keep your books in.'}
                {step === 3 && 'Add your logo, then check everything before we create it.'}
              </p>
            </div>

            {step === 1 && (
              <>
                {urduInputEnabled && <AutoUrduBusinessName form={form} />}
                <BusinessStep form={form} showUrduInput={urduInputEnabled} />
              </>
            )}
            {step === 2 && (
              <LocationStep
                form={form}
                countryOptions={countryOptions}
                currencies={currencies}
                onCountryChange={handleCountryChange}
              />
            )}
            {step === 3 && (
              <BrandStep
                form={form}
                logoPreviewUrl={logoPreviewUrl}
                onLogoChange={setLogoFile}
                summary={summary}
              />
            )}

            <div className='flex items-center justify-between gap-3 border-t pt-6'>
              <Button
                type='button'
                variant='ghost'
                onClick={() => setStep((current) => Math.max(current - 1, 0))}
                disabled={isLoading}
              >
                <ArrowLeft className='mr-1 h-4 w-4' />
                Back
              </Button>

              {step === STEPS.length - 2 ? (
                <Button
                  type='submit'
                  className={cn('h-11', CTA_BUTTON_CLASS)}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <>
                      <Loader2 className='h-4 w-4 animate-spin' />
                      Setting up…
                    </>
                  ) : (
                    'Complete setup'
                  )}
                </Button>
              ) : (
                <Button type='submit' className={cn('h-11', CTA_BUTTON_CLASS)}>
                  Continue
                  <ArrowRight className='ml-1 h-4 w-4' />
                </Button>
              )}
            </div>
          </form>
        </Form>
      )}
    </OnboardingShell>
  )
}

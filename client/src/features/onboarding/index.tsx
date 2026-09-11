import { useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useSetupOrganizationMutation, useLazyGetMyOrganizationQuery } from '@/stores/organization.api'
import { setActiveBranch, setUser } from '@/stores/auth.slice'
import { useDispatch, useSelector } from 'react-redux'
import { AppDispatch, RootState } from '@/stores/store'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Building2, ArrowRight, CheckCircle2 } from 'lucide-react'
import { BUSINESS_TYPE_OPTIONS } from '@/lib/business-types'
import { useAutoUrduNameFromEnglish } from '@/hooks/use-auto-urdu-name-from-english'
import { useUrduDisplay } from '@/context/urdu-display-context'

const formSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
  nameUrdu: z.string().optional(),
  businessType: z.string().min(1, 'Please select a business type'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  country: z.string().optional(),
  taxNumber: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
})

type FormValues = z.infer<typeof formSchema>

export default function OnboardingPage() {
  const { showUrduInput } = useUrduDisplay()
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [step, setStep] = useState(1)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [setupOrganization, { isLoading }] = useSetupOrganizationMutation()
  const [fetchMyOrganization] = useLazyGetMyOrganizationQuery()
  const authData = useSelector((state: RootState) => state.auth.data)
  // Guards the form behind a check for whether this account is already onboarded
  // server-side — the locally-cached `onboardingComplete` flag can go stale (e.g. a
  // prior setup call that succeeded on the server but timed out on the client before
  // the response came back), which used to leave people stuck re-submitting a form
  // that the server would only reject. `null` = still checking, `true` = confirmed not
  // onboarded yet (show the form).
  const [readyToOnboard, setReadyToOnboard] = useState<boolean | null>(null)

  function applyOnboardedUser(organization: { id: string; businessType: string }, branch?: { id?: string; _id?: string; name: string } | null) {
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      nameUrdu: '',
      businessType: '',
      email: '',
      phone: '',
      address: '',
      city: '',
      country: '',
      taxNumber: '',
      website: '',
      description: '',
    },
  })

  useAutoUrduNameFromEnglish(form, 'name', 'nameUrdu')

  const logoPreviewUrl = useMemo(() => (logoFile ? URL.createObjectURL(logoFile) : ''), [logoFile])
  useEffect(() => () => {
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl)
  }, [logoPreviewUrl])

  async function onSubmit(data: FormValues) {
    try {
      const nu = data.nameUrdu?.trim()
      const defaultBranchNameUrdu = nu ? `${nu} — مین برانچ` : ''
      const result = await setupOrganization({ ...data, defaultBranchNameUrdu, logoFile }).unwrap()

      applyOnboardedUser(result.organization, result.branch)
      toast.success('Company setup complete! Welcome aboard 🎉')
      navigate({ to: '/', replace: true })
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

  const handleFormSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    // Step 1 submit should only move to next step, never call setup API
    if (step === 1) {
      const valid = await form.trigger(['name', 'businessType'])
      if (valid) {
        setStep(2)
      }
      return
    }

    // Step 2 submit performs final onboarding submit
    await form.handleSubmit(onSubmit)(event)
  }

  if (readyToOnboard === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
          </div>
          <h1 className="text-3xl font-bold tracking-tight">Set Up Your Company</h1>
          <p className="text-muted-foreground mt-2">
            Tell us about your business to get started. This takes less than 2 minutes.
          </p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center justify-center gap-2 mb-8">
          {[1, 2].map((s) => (
            <div key={s} className="flex items-center gap-2">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                  step >= s ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                }`}
              >
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 2 && <div className={`w-12 h-0.5 ${step > s ? 'bg-primary' : 'bg-muted'}`} />}
            </div>
          ))}
        </div>

        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>
              {step === 1 ? 'Basic Information' : 'Contact & Location'}
            </CardTitle>
            <CardDescription>
              {step === 1
                ? 'Enter your company name and type'
                : 'Add contact details and address (optional)'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={handleFormSubmit} className="space-y-4">
                {step === 1 && (
                  <>
                    <FormField
                      control={form.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Company Name *</FormLabel>
                          <FormControl>
                            <Input placeholder="e.g. Acme Corporation" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    {showUrduInput && (
                      <FormField
                        control={form.control}
                        name="nameUrdu"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Company Name (Urdu)</FormLabel>
                            <FormControl>
                              <Input placeholder="اردو میں نام" dir="rtl" className="text-right" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}
                    <FormField
                      control={form.control}
                      name="businessType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Type *</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select your business type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {BUSINESS_TYPE_OPTIONS.map((bt) => (
                                <SelectItem key={bt.value} value={bt.value}>
                                  {bt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Business Email</FormLabel>
                          <FormControl>
                            <Input placeholder="company@example.com" type="email" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Description</FormLabel>
                          <FormControl>
                            <Input placeholder="Brief description of your business" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="space-y-2">
                      <FormLabel>Company Logo</FormLabel>
                      <Input
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null
                          setLogoFile(file)
                        }}
                      />
                      {logoPreviewUrl ? (
                        <img
                          src={logoPreviewUrl}
                          alt="Company logo preview"
                          className="h-20 w-20 rounded-md border object-cover"
                        />
                      ) : null}
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <FormField
                      control={form.control}
                      name="phone"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Phone Number</FormLabel>
                          <FormControl>
                            <Input placeholder="+1 (555) 000-0000" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="city"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>City</FormLabel>
                            <FormControl>
                              <Input placeholder="New York" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="country"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Country</FormLabel>
                            <FormControl>
                              <Input placeholder="United States" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                    <FormField
                      control={form.control}
                      name="address"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Address</FormLabel>
                          <FormControl>
                            <Input placeholder="123 Main St" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="taxNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Tax / VAT Number</FormLabel>
                          <FormControl>
                            <Input placeholder="Optional" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="website"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Website</FormLabel>
                          <FormControl>
                            <Input placeholder="https://yourcompany.com" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </>
                )}

                <div className="flex justify-between pt-4">
                  {step === 2 && (
                    <Button type="button" variant="outline" onClick={() => setStep(1)}>
                      Back
                    </Button>
                  )}
                  {step === 1 ? (
                    <Button
                      type="submit"
                      className="ml-auto"
                    >
                      Next <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  ) : (
                    <Button type="submit" disabled={isLoading} className="ml-auto">
                      {isLoading ? 'Setting up...' : 'Complete Setup'}
                    </Button>
                  )}
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>

        <p className="text-center text-sm text-muted-foreground mt-4">
          You can update these details anytime from Settings.
        </p>
      </div>
    </div>
  )
}

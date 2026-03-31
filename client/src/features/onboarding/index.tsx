import { useState } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from '@tanstack/react-router'
import { useSetupOrganizationMutation } from '@/stores/organization.api'
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

const formSchema = z.object({
  name: z.string().min(2, 'Company name must be at least 2 characters'),
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
  const navigate = useNavigate()
  const dispatch = useDispatch<AppDispatch>()
  const [step, setStep] = useState(1)
  const [setupOrganization, { isLoading }] = useSetupOrganizationMutation()
  const authData = useSelector((state: RootState) => state.auth.data)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
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

  async function onSubmit(data: FormValues) {
    try {
      const result = await setupOrganization(data).unwrap()

      // Update user in localStorage and Redux store with onboardingComplete = true
      const existingUser = authData?.user || JSON.parse(localStorage.getItem('user') || '{}')
      const updatedUser = {
        ...existingUser,
        onboardingComplete: true,
        systemRole: 'superAdmin',
        organizationId: result.organization.id,
        businessType: result.organization.businessType,
      }
      localStorage.setItem('user', JSON.stringify(updatedUser))

      // Update Redux store so sidebar & permissions reflect immediately
      dispatch(setUser({
        ...authData,
        user: updatedUser,
      }))

      // Set the default branch as active
      if (result.branch) {
        dispatch(setActiveBranch({ id: result.branch.id || result.branch._id, name: result.branch.name }))
      }

      toast.success('Company setup complete! Welcome aboard 🎉')
      navigate({ to: '/', replace: true })
    } catch (error: any) {
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

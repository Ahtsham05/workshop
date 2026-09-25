import { useEffect } from 'react'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useDispatch } from 'react-redux'
import toast from 'react-hot-toast'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { setUser } from '@/stores/auth.slice'
import {
  useUpdateMyProfileMutation,
  type MyProfile,
} from '@/stores/user-preferences.api'
import { clearAuthCache } from '@/lib/auth-cache'
import type { AppDispatch } from '@/stores/store'

const schema = z.object({
  name: z.string().min(1, 'Please enter your name').max(100),
  email: z.string().min(1, 'Please enter your email').email('Invalid email address'),
  preferredLanguage: z.enum(['en', 'ur']),
})

type Values = z.infer<typeof schema>

interface Props {
  profile?: MyProfile
  isLoading: boolean
}

export function PersonalInformationCard({ profile, isLoading }: Props) {
  const dispatch = useDispatch<AppDispatch>()
  const [updateProfile, { isLoading: isSaving }] = useUpdateMyProfileMutation()

  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      name: profile?.name ?? '',
      email: profile?.email ?? '',
      preferredLanguage: (profile?.preferredLanguage as 'en' | 'ur') ?? 'en',
    },
  })

  // Nothing to submit until the account has loaded.
  useEffect(() => {
    if (!profile) form.reset()
  }, [profile, form])

  async function onSubmit(values: Values) {
    const emailChanged =
      profile?.email && values.email.toLowerCase() !== profile.email.toLowerCase()
    try {
      const updated = await updateProfile(values).unwrap()

      // Keep the cached session in step so the header, sidebar and next reload all
      // show the new details.
      const raw = localStorage.getItem('user')
      const cached = raw ? JSON.parse(raw) : {}
      const merged = {
        ...cached,
        name: updated.name,
        email: updated.email,
        preferredLanguage: updated.preferredLanguage,
      }
      localStorage.setItem('user', JSON.stringify(merged))
      const tokens = {
        access: { token: localStorage.getItem('accessToken') },
        refresh: { token: localStorage.getItem('refreshToken') },
      }
      dispatch(setUser({ user: merged, tokens }))

      if (emailChanged) {
        // The offline credential cache is keyed by the OLD email, so it can no longer
        // match this account — drop it and say so rather than leaving a login that
        // silently fails the next time the internet does.
        clearAuthCache()
        toast.success('Profile updated. Sign in online once to re-enable offline login.')
      } else {
        toast.success('Profile updated')
      }
    } catch (error: unknown) {
      // RTK Query endpoints do NOT pass through utils/errorHandler's global toast —
      // that only wraps the Axios thunks — so the message has to be shown here.
      const err = error as { data?: { message?: string } }
      toast.error(err?.data?.message || 'Could not save your profile. Please try again.')
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Personal information</CardTitle>
        <CardDescription>
          Your name and email as they appear across the app and on documents you create.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className='grid gap-5'>
            <FormField
              control={form.control}
              name='name'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Full name</FormLabel>
                  <FormControl>
                    <Input placeholder='Your name' disabled={isLoading} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='email'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type='email'
                      autoComplete='email'
                      placeholder='name@example.com'
                      disabled={isLoading}
                      showVoiceInput={false}
                      {...field}
                    />
                  </FormControl>
                  <FormDescription className='text-xs'>
                    You sign in with this address, so changing it changes your login.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name='preferredLanguage'
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Language</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={isLoading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value='en'>English</SelectItem>
                      <SelectItem value='ur'>اردو (Urdu)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription className='text-xs'>
                    Used for invoices and receipts printed from your account.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className='flex justify-end'>
              <Button type='submit' disabled={isSaving || isLoading || !form.formState.isDirty}>
                {isSaving ? (
                  <>
                    <Loader2 className='h-4 w-4 animate-spin' />
                    Saving…
                  </>
                ) : (
                  'Save changes'
                )}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  )
}

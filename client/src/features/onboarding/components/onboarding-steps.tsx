import type { UseFormReturn } from 'react-hook-form'
import {
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  GraduationCap,
  Landmark,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Store,
  Upload,
  WifiOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
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
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '@/components/ui/searchable-select'
import { cn } from '@/lib/utils'
import { ONBOARDING_BUSINESS_TYPES } from '@/lib/business-types'
import type { CurrencyOption } from '@/stores/localization.api'

/** One card per module set, in the order most accounts want them. */
const BUSINESS_TYPE_ICONS: Record<string, typeof Store> = {
  retail: Store,
  mobile_shop: Smartphone,
  school: GraduationCap,
}

export interface OnboardingFormValues {
  name: string
  nameUrdu?: string
  businessType: string
  email?: string
  phone?: string
  address?: string
  city?: string
  country?: string
  countryCode?: string
  baseCurrency?: string
  taxNumber?: string
  website?: string
  description?: string
}

type OnboardingForm = UseFormReturn<OnboardingFormValues>

/* ── Welcome ─────────────────────────────────────────────────────────────── */

// No dark: variants on these tiles: WelcomeStep always renders inside the
// permanently-light content panel (see OnboardingShell), so a dark: class here
// would just be dead weight — worse, it would incorrectly fire if <html> happens to
// be dark, since Tailwind's dark: variant matches ANY .dark ancestor, not the
// nearest one (the same gap documented on AuthLayout).
const WELCOME_POINTS = [
  {
    icon: Building2,
    title: 'Your business, set up once',
    body: 'We create your organization and its main branch from what you enter here.',
    tile: 'bg-blue-500/15 text-blue-600',
  },
  {
    icon: Landmark,
    title: 'Money and tax, ready to go',
    body: 'Pick your country and we preset the currency, date format and tax system.',
    tile: 'bg-violet-500/15 text-violet-600',
  },
  {
    icon: WifiOff,
    title: 'Nothing is locked in',
    body: 'Every answer can be changed later from Settings — nothing here is permanent.',
    tile: 'bg-emerald-500/15 text-emerald-600',
  },
]

/** Shared with the auth screens' Sign in / Create account buttons, so the whole
 *  first-run journey (sign up → onboarding) reads as one visual piece — both are
 *  the flat black `bg-neutral-900` used there, not a light/dark pair. */
export const CTA_BUTTON_CLASS =
  'rounded-xl bg-neutral-900 text-white shadow-lg shadow-black/20 transition-all hover:bg-black hover:shadow-xl'

export function WelcomeStep({ name, onStart }: { name?: string; onStart: () => void }) {
  return (
    <div className='space-y-8'>
      <div className='space-y-3'>
        <span className='inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-indigo-500/10 to-violet-500/10 px-3 py-1 text-xs font-medium text-indigo-600 ring-1 ring-indigo-500/20'>
          <Sparkles className='h-3.5 w-3.5' aria-hidden />
          Welcome aboard
        </span>
        <h1 className='text-3xl font-semibold tracking-tight'>
          {name ? `Welcome, ${name.split(' ')[0]}.` : 'Welcome.'}
          <br />
          Let&apos;s set up your business.
        </h1>
        <p className='text-muted-foreground'>
          Four short steps, about two minutes. You can skip anything that is not required
          and fill it in later.
        </p>
      </div>

      <ul className='space-y-4'>
        {WELCOME_POINTS.map((point) => (
          <li key={point.title} className='flex gap-3'>
            <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', point.tile)}>
              <point.icon className='h-4 w-4' aria-hidden />
            </span>
            <div>
              <p className='text-sm font-medium'>{point.title}</p>
              <p className='text-muted-foreground text-sm'>{point.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <Button type='button' className={cn('h-11 w-full sm:w-auto', CTA_BUTTON_CLASS)} onClick={onStart}>
        Get started
        <ArrowRight className='ml-1 h-4 w-4' />
      </Button>
    </div>
  )
}

/* ── Step: the business ──────────────────────────────────────────────────── */

export function BusinessStep({
  form,
  showUrduInput,
}: {
  form: OnboardingForm
  showUrduInput: boolean
}) {
  return (
    <div className='grid gap-5'>
      <FormField
        control={form.control}
        name='name'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Business name *</FormLabel>
            <FormControl>
              <Input placeholder='e.g. Riverside Hardware Co.' className='h-11' {...field} />
            </FormControl>
            <FormDescription className='text-xs'>
              Printed on invoices and receipts. Your main branch is named after it.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      {showUrduInput && (
        <FormField
          control={form.control}
          name='nameUrdu'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Business name (Urdu)</FormLabel>
              <FormControl>
                <Input placeholder='اردو میں نام' dir='rtl' className='h-11 text-right' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <FormField
        control={form.control}
        name='businessType'
        render={({ field }) => (
          <FormItem>
            <FormLabel>What kind of business is it? *</FormLabel>
            <FormDescription className='text-xs'>
              This decides which modules you get. You can change it later in Settings.
            </FormDescription>
            <div className='grid gap-3 pt-1'>
              {ONBOARDING_BUSINESS_TYPES.map((type) => {
                const Icon = BUSINESS_TYPE_ICONS[type.value] ?? Building2
                const selected = field.value === type.value
                return (
                  <button
                    key={type.value}
                    type='button'
                    onClick={() => field.onChange(type.value)}
                    aria-pressed={selected}
                    className={cn(
                      'flex items-start gap-3 rounded-xl border p-4 text-left transition-all',
                      selected
                        ? 'border-indigo-500 bg-indigo-500/[0.05] ring-2 ring-indigo-500/25'
                        : 'hover:border-muted-foreground/40 hover:bg-muted/40'
                    )}
                  >
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors',
                        selected
                          ? 'bg-gradient-to-br from-indigo-600 to-violet-600 text-white'
                          : 'bg-muted text-muted-foreground'
                      )}
                    >
                      <Icon className='h-5 w-5' aria-hidden />
                    </span>
                    <span className='min-w-0 flex-1'>
                      <span className='flex items-center gap-2'>
                        <span className='text-sm font-medium'>{type.label}</span>
                        {selected && <Check className='h-4 w-4 text-indigo-600' aria-hidden />}
                      </span>
                      <span className='text-muted-foreground mt-0.5 block text-xs leading-relaxed'>
                        {type.description}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className='grid gap-5 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='phone'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Phone number</FormLabel>
              <FormControl>
                <Input placeholder='+1 (555) 123-4567' className='h-11' {...field} />
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
              <FormLabel>Business email</FormLabel>
              <FormControl>
                <Input
                  type='email'
                  placeholder='billing@yourcompany.com'
                  className='h-11'
                  showVoiceInput={false}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  )
}

/* ── Step: where you trade ───────────────────────────────────────────────── */

/** "$1,234.56" — what money will actually look like with the picked currency. */
function currencyExample(currency?: CurrencyOption): string {
  if (!currency) return ''
  const amount = (1234.5).toFixed(currency.decimalPlaces ?? 2)
  const withSeparators = amount.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return currency.symbolPosition === 'after'
    ? `${withSeparators} ${currency.symbol}`
    : `${currency.symbol}${withSeparators}`
}

export function LocationStep({
  form,
  countryOptions,
  currencies,
  onCountryChange,
}: {
  form: OnboardingForm
  countryOptions: SearchableSelectOption[]
  currencies: CurrencyOption[]
  onCountryChange: (code: string) => void
}) {
  const selectedCurrency = currencies.find((c) => c.code === form.watch('baseCurrency'))
  const example = currencyExample(selectedCurrency)

  return (
    <div className='grid gap-5'>
      <div className='grid gap-5 sm:grid-cols-2'>
        <FormItem>
          <FormLabel>Country</FormLabel>
          <SearchableSelect
            options={countryOptions}
            value={form.watch('countryCode') || ''}
            onValueChange={onCountryChange}
            placeholder='Select country'
            searchPlaceholder='Search countries…'
            className='h-11'
          />
          <FormDescription className='text-xs'>
            Sets your currency, date format and tax system.
          </FormDescription>
        </FormItem>

        <FormField
          control={form.control}
          name='baseCurrency'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Currency</FormLabel>
              <Select onValueChange={field.onChange} value={field.value || ''}>
                <FormControl>
                  <SelectTrigger className='h-11 w-full'>
                    <SelectValue placeholder='Select currency' />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {currencies.map((currency) => (
                    <SelectItem key={currency.code} value={currency.code}>
                      <span className='flex items-center gap-2'>
                        <span className='bg-muted rounded px-1.5 py-0.5 text-xs font-semibold'>
                          {currency.symbol}
                        </span>
                        <span>
                          {currency.code} — {currency.name}
                        </span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription className='text-xs'>
                {example
                  ? `Amounts will read like ${example}.`
                  : 'Every amount you record is stored in this currency.'}
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name='city'
        render={({ field }) => (
          <FormItem>
            <FormLabel>City</FormLabel>
            <FormControl>
              <Input placeholder='Austin' className='h-11' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='address'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Address</FormLabel>
            <FormControl>
              <Input placeholder='1200 Congress Ave, Suite 4' className='h-11' {...field} />
            </FormControl>
            <FormDescription className='text-xs'>
              Appears on printed invoices and on your main branch.
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name='taxNumber'
        render={({ field }) => (
          <FormItem>
            <FormLabel>Tax ID / EIN</FormLabel>
            <FormControl>
              <Input placeholder='12-3456789 (optional)' className='h-11' {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  )
}

/* ── Step: brand & review ────────────────────────────────────────────────── */

export function BrandStep({
  form,
  logoPreviewUrl,
  onLogoChange,
  summary,
}: {
  form: OnboardingForm
  logoPreviewUrl: string
  onLogoChange: (file: File | null) => void
  summary: { label: string; value: string }[]
}) {
  return (
    <div className='grid gap-5'>
      <FormItem>
        <FormLabel>Business logo</FormLabel>
        <div className='flex items-center gap-4'>
          <div className='bg-muted/40 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border'>
            {logoPreviewUrl ? (
              <img src={logoPreviewUrl} alt='Logo preview' className='h-full w-full object-cover' />
            ) : (
              <Building2 className='text-muted-foreground h-7 w-7' aria-hidden />
            )}
          </div>
          <div className='min-w-0 flex-1'>
            <label className='border-input hover:bg-muted/50 flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed text-sm transition-colors'>
              <Upload className='h-4 w-4' aria-hidden />
              {logoPreviewUrl ? 'Choose a different image' : 'Upload your logo'}
              <input
                type='file'
                accept='image/*'
                className='sr-only'
                onChange={(event) => onLogoChange(event.target.files?.[0] ?? null)}
              />
            </label>
            <p className='text-muted-foreground mt-1.5 text-xs'>
              Shown on invoices and receipts. PNG or JPG, up to 5 MB.
            </p>
          </div>
        </div>
      </FormItem>

      <div className='grid gap-5 sm:grid-cols-2'>
        <FormField
          control={form.control}
          name='website'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Website</FormLabel>
              <FormControl>
                <Input placeholder='https://yourbusiness.com' className='h-11' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name='description'
          render={({ field }) => (
            <FormItem>
              <FormLabel>Short description</FormLabel>
              <FormControl>
                <Input placeholder='e.g. Hardware store and tool rental' className='h-11' {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <div className='bg-muted/40 rounded-lg border p-4'>
        <p className='mb-3 text-sm font-medium'>We are about to create</p>
        <dl className='grid gap-2 text-sm'>
          {summary.map((item) => (
            <div key={item.label} className='flex items-start justify-between gap-4'>
              <dt className='text-muted-foreground'>{item.label}</dt>
              <dd className='truncate text-right font-medium'>{item.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

/* ── Done ────────────────────────────────────────────────────────────────── */

export function SuccessStep({
  businessName,
  onContinue,
}: {
  businessName: string
  onContinue: () => void
}) {
  return (
    <div className='space-y-6 text-center'>
      <div className='flex justify-center'>
        <span className='flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 ring-8 ring-emerald-500/5'>
          <CheckCircle2 className='h-8 w-8' aria-hidden />
        </span>
      </div>
      <div className='space-y-2'>
        <h1 className='text-2xl font-semibold tracking-tight'>You&apos;re all set</h1>
        <p className='text-muted-foreground'>
          {businessName} is ready, with its main branch created and sample data being
          prepared in the background.
        </p>
      </div>
      <div className='bg-muted/40 mx-auto max-w-sm space-y-2 rounded-lg border p-4 text-left text-sm'>
        <p className='flex items-center gap-2'>
          <ShieldCheck className='h-4 w-4 shrink-0 text-emerald-600' aria-hidden />
          You are the owner of this account
        </p>
        <p className='flex items-center gap-2'>
          <Building2 className='h-4 w-4 shrink-0 text-sky-600' aria-hidden />
          Add more branches any time from Settings
        </p>
      </div>
      <Button type='button' className={cn('h-11 w-full sm:w-auto', CTA_BUTTON_CLASS)} onClick={onContinue}>
        Go to dashboard
        <ArrowRight className='ml-1 h-4 w-4' />
      </Button>
    </div>
  )
}

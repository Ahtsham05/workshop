import { AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ColorField } from '@/components/color-field'
import { useAppearance } from '@/context/appearance-context'
import { CUSTOM_COLOR_KEYS, readableOn, type CustomColors } from '@/lib/appearance'

const FIELDS: { key: keyof CustomColors; label: string; description: string; placeholder: string }[] = [
  { key: 'background', label: 'Page background', description: 'Behind cards and tables', placeholder: '#f8fafc' },
  { key: 'header', label: 'Header bar', description: 'The strip across the top', placeholder: '#ffffff' },
  { key: 'sidebar', label: 'Side menu', description: 'Text colour adjusts itself', placeholder: '#1e293b' },
  { key: 'accent', label: 'Buttons & highlights', description: 'Overrides the theme colour', placeholder: '#4f46e5' },
]

/**
 * Any colour for the main surfaces — the "exactly my brand colours" option next to the
 * ready-made themes. Applies instantly and is saved to the account like everything else
 * on this page; a ready-made theme clears it again.
 */
export function CustomColorsSection() {
  const { preferences, setPreferences } = useAppearance()
  const custom = preferences.customColors
  const anySet = CUSTOM_COLOR_KEYS.some((k) => custom[k])
  const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  // Text keeps the light/dark mode's colour, so warn when the canvas fights it.
  const backgroundClash = custom.background
    ? (readableOn(custom.background) === '#ffffff') !== isDark
    : false

  const update = (key: keyof CustomColors, value: string | null) =>
    setPreferences({ customColors: { ...custom, [key]: value } })

  return (
    <section className='space-y-4 @container'>
      <div className='flex flex-wrap items-start justify-between gap-2'>
        <div>
          <h4 className='text-sm font-medium'>Your own colours</h4>
          <p className='text-muted-foreground text-sm'>
            Pick any colour for the background, header bar, side menu and buttons. Leave one on default to keep the theme's.
          </p>
        </div>
        {anySet && (
          <Button size='sm' variant='outline' onClick={() => setPreferences({ customColors: {} })}>
            Reset to theme
          </Button>
        )}
      </div>
      <div className='grid grid-cols-1 gap-2 @2xl:grid-cols-2'>
        {FIELDS.map((field) => (
          <ColorField
            key={field.key}
            label={field.label}
            description={field.description}
            value={custom[field.key]}
            placeholderColor={field.placeholder}
            onChange={(value) => update(field.key, value)}
          />
        ))}
      </div>
      {backgroundClash && (
        <p className='flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200'>
          <AlertTriangle className='mt-0.5 size-4 shrink-0' />
          {isDark
            ? 'This is a light background while the app is in Dark mode — text may be hard to read. Switch to Light mode, or pick a darker colour.'
            : 'This is a dark background while the app is in Light mode — some text may be hard to read. Switch to Dark mode, or pick a lighter colour.'}
        </p>
      )}
    </section>
  )
}

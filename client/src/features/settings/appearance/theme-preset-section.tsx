import { useEffect, useState } from 'react'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTheme } from '@/context/theme-context'
import { useAppearance } from '@/context/appearance-context'
import {
  THEME_PRESETS,
  matchThemePreset,
  rowScheme,
  themeColorOption,
  themePresetPreferences,
  type RowColors,
  type ThemeMode,
  type ThemePreset,
} from '@/lib/appearance'

/** The surfaces a preset's miniature is painted on — the real tokens from index.css. */
const MOCK_SURFACES: Record<ThemeMode, { page: string; bar: string; border: string; sidebar: string; fallbackPrimary: string }> = {
  light: {
    page: '#ffffff',
    bar: '#e2e8f0',
    border: '#e2e8f0',
    sidebar: 'oklch(0.245 0.072 264.2)',
    fallbackPrimary: '#0f172a',
  },
  dark: {
    page: 'oklch(0.14 0.04 259.21)',
    bar: 'oklch(0.32 0.04 260)',
    border: 'rgba(255, 255, 255, 0.12)',
    sidebar: 'oklch(0.2 0.055 264.5)',
    fallbackPrimary: '#e2e8f0',
  },
}

/**
 * A ~100px picture of the app under one preset: tinted sidebar panel, a primary
 * button, and four table rows in that preset's row colours.
 *
 * Every colour here is written literally rather than through a CSS variable — the
 * card has to show a *dark* theme while the app is still light (and the other way
 * round), which the variables, scoped to the live `.dark` class, cannot do.
 */
function PresetMock({ preset }: { preset: ThemePreset }) {
  const surface = MOCK_SURFACES[preset.mode]
  const color = themeColorOption(preset.themeColor)
  const primary = color.primary || surface.fallbackPrimary
  const scheme = rowScheme(preset.rowScheme)
  const rows: RowColors = preset.mode === 'dark' ? scheme.dark : scheme.light
  // Same mix index.css uses for --sidebar-base-themed, so the panel in the picture
  // is the panel the app will actually draw.
  const sidebar = color.primary
    ? `color-mix(in oklab, ${color.primary} 55%, ${surface.sidebar})`
    : surface.sidebar

  const rowFills = [rows.head, rows.base, preset.alternateRows ? rows.alt : rows.base, rows.base]

  return (
    <div
      className='flex h-[74px] overflow-hidden rounded-md border'
      style={{ backgroundColor: surface.page, borderColor: surface.border }}
    >
      <div className='flex w-[22%] shrink-0 flex-col gap-1 p-1.5' style={{ backgroundColor: sidebar }}>
        <div className='h-1.5 rounded-full' style={{ backgroundColor: 'rgba(255,255,255,0.55)' }} />
        <div className='h-1.5 w-4/5 rounded-full' style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />
        <div className='h-1.5 w-3/5 rounded-full' style={{ backgroundColor: 'rgba(255,255,255,0.28)' }} />
      </div>
      <div className='flex flex-1 flex-col gap-1 p-1.5'>
        <div className='flex items-center gap-1'>
          <div className='h-1.5 flex-1 rounded-full' style={{ backgroundColor: surface.bar }} />
          <div className='h-2.5 w-6 rounded-[3px]' style={{ backgroundColor: primary }} />
        </div>
        <div className='flex-1 overflow-hidden rounded-[3px]' style={{ borderColor: surface.border }}>
          {rowFills.map((fill, i) => (
            <div key={i} className='h-[11px]' style={{ backgroundColor: fill }} />
          ))}
        </div>
      </div>
    </div>
  )
}

function PresetCard({
  preset,
  selected,
  onSelect,
}: {
  preset: ThemePreset
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'rounded-lg border p-2 text-left transition-colors',
        selected ? 'border-primary ring-primary/30 ring-2' : 'hover:border-muted-foreground/40'
      )}
    >
      <PresetMock preset={preset} />
      <div className='mt-2 flex items-center gap-1'>
        <span className='truncate text-xs font-medium'>{preset.label}</span>
        {selected && <Check className='text-primary ml-auto h-3.5 w-3.5 shrink-0' />}
      </div>
      <p className='text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-snug'>
        {preset.description}
      </p>
    </button>
  )
}

/** The live light/dark mode, with 'system' already resolved against the OS setting. */
function useResolvedMode(): ThemeMode {
  const { theme } = useTheme()
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  )

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => setSystemDark(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  if (theme === 'system') return systemDark ? 'dark' : 'light'
  return theme === 'dark' ? 'dark' : 'light'
}

/**
 * Themes — one click sets light/dark mode, theme colour, row colours and branch
 * tint together, so the whole app is coherent without visiting four controls.
 * Afterwards every one of those dials is still free to change; the card simply
 * stops being highlighted once the combination no longer matches.
 */
export function ThemePresetSection() {
  const { preferences, setPreferences } = useAppearance()
  const { setTheme } = useTheme()
  const mode = useResolvedMode()
  const active = matchThemePreset(preferences, mode)

  const apply = (preset: ThemePreset) => {
    setTheme(preset.mode)
    setPreferences(themePresetPreferences(preset))
  }

  return (
    <section className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>Themes</h4>
        <p className='text-muted-foreground text-sm'>
          A complete look in one click — day or night mode, accent colour and table
          stripes chosen to go together. Fine-tune any of it below.
        </p>
      </div>

      <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4'>
        {THEME_PRESETS.map((preset) => (
          <PresetCard
            key={preset.key}
            preset={preset}
            selected={active?.key === preset.key}
            onSelect={() => apply(preset)}
          />
        ))}
      </div>

      {!active && (
        <p className='text-muted-foreground text-xs'>
          Your settings are a custom mix — pick a theme above to start from a ready-made one.
        </p>
      )}
    </section>
  )
}

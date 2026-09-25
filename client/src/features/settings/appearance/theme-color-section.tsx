import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useAppearance } from '@/context/appearance-context'
import {
  THEME_COLORS,
  THEME_COLOR_GROUPS,
  themeColorOption,
  type ThemeColorOption,
} from '@/lib/appearance'

function ColorSwatch({
  option,
  selected,
  onSelect,
}: {
  option: ThemeColorOption
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type='button'
      onClick={onSelect}
      aria-pressed={selected}
      title={option.label}
      className='group flex w-14 flex-col items-center gap-1.5'
    >
      <span
        className={cn(
          'relative flex size-9 items-center justify-center rounded-full ring-offset-2 ring-offset-background transition-all',
          selected
            ? 'ring-2 ring-foreground'
            : 'group-hover:ring-2 group-hover:ring-muted-foreground/40'
        )}
        style={{ backgroundColor: option.swatch }}
      >
        {/* A colour that differs by mode paints its dark half on top, so the dot always
            shows the shade the app will really use. */}
        {option.swatchDark && (
          <span
            className='absolute inset-0 hidden rounded-full dark:block'
            style={{ backgroundColor: option.swatchDark }}
          />
        )}
        {selected && (
          <>
            <Check
              className={cn(
                'relative size-4 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]',
                option.swatchDark && 'dark:hidden'
              )}
              style={{ color: option.primaryForeground || '#ffffff' }}
            />
            {option.swatchDark && (
              <Check className='relative hidden size-4 dark:block' style={{ color: '#0f172a' }} />
            )}
          </>
        )}
        {/* The neutral swatches sit close to the page surface — an outline keeps
            their edge visible. */}
        {option.group === 'neutral' && (
          <span className='absolute inset-0 rounded-full border border-black/10 dark:border-white/15' />
        )}
      </span>
      <span className='text-muted-foreground group-hover:text-foreground w-full truncate text-center text-[11px] transition-colors'>
        {option.label}
      </span>
    </button>
  )
}

/**
 * Theme (accent) colour — the one dial that recolours every button, link, focus
 * ring, checkbox and switch in the app at once. Picking a swatch applies it
 * instantly (the preview below is the real components, not a mock-up) and saves
 * to the user's account so it follows them to any device.
 *
 * Twenty-four swatches in one wrap would read as a wall of dots, so they are laid
 * out family by family — a person looking for "some green" scans one short row
 * instead of the whole set.
 */
export function ThemeColorSection() {
  const { preferences, setPreferences } = useAppearance()
  const active = themeColorOption(preferences.themeColor)

  return (
    <section className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>Theme colour</h4>
        <p className='text-muted-foreground text-sm'>
          Pick the colour used for buttons, links and highlights across the whole app.
        </p>
      </div>

      <div className='space-y-4'>
        {THEME_COLOR_GROUPS.map((group) => (
          <div key={group.key} className='space-y-2'>
            <p className='text-muted-foreground text-[11px] font-medium tracking-wide uppercase'>
              {group.label}
            </p>
            <div className='flex flex-wrap gap-x-3 gap-y-4'>
              {THEME_COLORS.filter((c) => c.group === group.key).map((option) => (
                <ColorSwatch
                  key={option.key}
                  option={option}
                  selected={preferences.themeColor === option.key}
                  onSelect={() => setPreferences({ themeColor: option.key })}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className='space-y-3 rounded-lg border p-4'>
        <div className='flex items-center justify-between gap-2'>
          <Label className='text-muted-foreground text-xs'>Preview</Label>
          <span className='text-muted-foreground text-xs'>
            Using <span className='text-foreground font-medium'>{active.label}</span>
          </span>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          <Button size='sm'>Primary button</Button>
          <Button size='sm' variant='outline'>
            Outline
          </Button>
          <Button size='sm' variant='link'>
            Link button
          </Button>
          <Badge>Badge</Badge>
        </div>
        <div className='flex flex-wrap items-center gap-6 pt-1'>
          <div className='flex items-center gap-2'>
            <Checkbox id='theme-preview-checkbox' checked />
            <Label htmlFor='theme-preview-checkbox' className='font-normal'>
              Checkbox
            </Label>
          </div>
          <div className='flex items-center gap-2'>
            <Switch id='theme-preview-switch' checked />
            <Label htmlFor='theme-preview-switch' className='font-normal'>
              Switch
            </Label>
          </div>
        </div>
      </div>
    </section>
  )
}

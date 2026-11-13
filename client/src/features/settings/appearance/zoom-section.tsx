import { useEffect, useState } from 'react'
import { Check, Minus, Plus, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useAppearance } from '@/context/appearance-context'
import {
  DEFAULT_APPEARANCE,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_PRESETS,
  ZOOM_STEP,
  clampZoom,
  stepZoom,
} from '@/lib/appearance'

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const MOD = isMac ? '⌘ ⌥' : 'Ctrl + Alt'

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className='bg-muted text-muted-foreground rounded border px-1.5 py-0.5 font-mono text-[11px]'>
      {children}
    </kbd>
  )
}

/**
 * Zoom — makes the whole app bigger or smaller (text, tables, buttons, menus,
 * sidebar). Saved on the account, so it follows the person to every device.
 */
export function ZoomSection() {
  const { preferences, setPreferences } = useAppearance()
  const zoom = preferences.zoom
  const isDefault = zoom === DEFAULT_APPEARANCE.zoom

  // The slider resizes the page it sits on, so it previews the number while dragging
  // and only applies on release — otherwise the handle would jump away from the pointer.
  const [draft, setDraft] = useState(zoom)
  useEffect(() => setDraft(zoom), [zoom])

  const apply = (value: number) => {
    const next = clampZoom(value)
    if (next !== zoom) setPreferences({ zoom: next })
  }

  const pct = ((draft - ZOOM_MIN) / (ZOOM_MAX - ZOOM_MIN)) * 100

  return (
    <section className='space-y-4'>
      <div>
        <h4 className='text-sm font-medium'>Zoom (app size)</h4>
        <p className='text-muted-foreground text-sm'>
          Make everything — text, tables, buttons, menus and the sidebar — bigger or smaller.
          Saved to your account, so it follows you to every computer and phone you sign in on.
        </p>
      </div>

      <div className='space-y-4 rounded-lg border p-4'>
        {/* Stepper */}
        <div className='flex flex-wrap items-center gap-3'>
          <div className='flex items-center rounded-md border'>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='rounded-r-none'
              aria-label='Zoom out'
              disabled={zoom <= ZOOM_MIN}
              onClick={() => apply(stepZoom(zoom, -1))}
            >
              <Minus className='h-4 w-4' />
            </Button>
            <output
              aria-live='polite'
              className='min-w-[4.5rem] border-x px-3 text-center text-base font-semibold tabular-nums'
            >
              {draft}%
            </output>
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='rounded-l-none'
              aria-label='Zoom in'
              disabled={zoom >= ZOOM_MAX}
              onClick={() => apply(stepZoom(zoom, 1))}
            >
              <Plus className='h-4 w-4' />
            </Button>
          </div>
          <Button
            type='button'
            variant='outline'
            size='sm'
            disabled={isDefault}
            onClick={() => apply(DEFAULT_APPEARANCE.zoom)}
          >
            <RotateCcw className='mr-1.5 h-3.5 w-3.5' />
            Reset to 100%
          </Button>
          <span className='text-muted-foreground ml-auto hidden text-xs sm:inline'>
            {isDefault ? 'Standard size' : zoom > 100 ? 'Larger than standard' : 'Smaller than standard'}
          </span>
        </div>

        {/* Slider */}
        <div className='space-y-1.5'>
          <input
            type='range'
            aria-label='App zoom'
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={ZOOM_STEP}
            value={draft}
            onChange={(e) => setDraft(Number(e.target.value))}
            onPointerUp={() => apply(draft)}
            onKeyUp={() => apply(draft)}
            onBlur={() => apply(draft)}
            className='accent-primary h-2 w-full cursor-pointer'
            style={{
              background: `linear-gradient(to right, var(--primary) ${pct}%, var(--muted) ${pct}%)`,
              borderRadius: 9999,
            }}
          />
          <div className='text-muted-foreground flex justify-between text-xs tabular-nums'>
            <span>{ZOOM_MIN}%</span>
            <span>100%</span>
            <span>{ZOOM_MAX}%</span>
          </div>
        </div>

        {/* Quick picks */}
        <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6'>
          {ZOOM_PRESETS.map((p) => {
            const selected = p.value === zoom
            return (
              <button
                key={p.value}
                type='button'
                aria-pressed={selected}
                onClick={() => apply(p.value)}
                className={cn(
                  'flex flex-col items-start rounded-lg border p-2.5 text-left transition-colors',
                  selected
                    ? 'border-primary ring-primary/30 ring-2'
                    : 'hover:border-muted-foreground/40'
                )}
              >
                <span className='flex h-8 w-full items-end justify-between'>
                  {/* Sample letters drawn at each stop's size relative to the current one. */}
                  <span
                    className='leading-none font-semibold'
                    style={{ fontSize: `${(p.value / zoom) * 1.25}em` }}
                  >
                    Aa
                  </span>
                  {selected && <Check className='text-primary h-3.5 w-3.5 shrink-0' />}
                </span>
                <span className='mt-2 text-xs font-medium'>{p.label}</span>
                <span className='text-muted-foreground text-xs tabular-nums'>{p.value}%</span>
              </button>
            )
          })}
        </div>

        <div className='text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-2 text-xs'>
          <span className='flex items-center gap-1.5'>
            <Kbd>{MOD} + =</Kbd> bigger
          </span>
          <span className='flex items-center gap-1.5'>
            <Kbd>{MOD} + −</Kbd> smaller
          </span>
          <span className='flex items-center gap-1.5'>
            <Kbd>{MOD} + 0</Kbd> back to 100%
          </span>
        </div>
      </div>

      <p className='text-muted-foreground text-xs'>
        This works on top of your browser&apos;s own zoom (Ctrl + / Ctrl −). If the app still looks
        too big or too small at 100% here, set the browser zoom back to 100% as well. Printouts are
        never affected.
      </p>
    </section>
  )
}

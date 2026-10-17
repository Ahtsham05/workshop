import { useEffect, useId, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const HEX = /^#[0-9a-fA-F]{6}$/

interface ColorFieldProps {
  label: string
  description?: string
  /** null = not set (the default look applies). */
  value: string | null | undefined
  onChange: (value: string | null) => void
  /** Shown in the swatch while nothing is set, so "default" still looks like a colour. */
  placeholderColor?: string
  className?: string
}

/**
 * Any colour, picked from the system colour wheel or typed as #rrggbb, with a one-click
 * way back to the default. Used for print colours and the app's custom colours.
 */
export function ColorField({ label, description, value, onChange, placeholderColor = '#ffffff', className }: ColorFieldProps) {
  const id = useId()
  const [text, setText] = useState(value ?? '')
  useEffect(() => setText(value ?? ''), [value])
  const isSet = !!value

  return (
    <div className={cn('flex items-center gap-3 rounded-lg border p-2.5', className)}>
      <label
        htmlFor={id}
        className='relative size-9 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-xs'
        style={{ background: value ?? placeholderColor }}
        title='Pick a colour'
      >
        {!isSet && <span className='absolute inset-0 bg-[repeating-linear-gradient(45deg,transparent,transparent_4px,rgba(0,0,0,.06)_4px,rgba(0,0,0,.06)_8px)]' />}
        <input
          id={id}
          type='color'
          value={value ?? placeholderColor}
          onChange={(e) => onChange(e.target.value.toLowerCase())}
          className='absolute inset-0 size-full cursor-pointer opacity-0'
          aria-label={`${label} colour`}
        />
      </label>
      <div className='min-w-0 flex-1'>
        <p className='text-sm font-medium leading-tight'>{label}</p>
        {description && <p className='text-xs leading-tight text-muted-foreground'>{description}</p>}
      </div>
      <input
        value={text}
        onChange={(e) => {
          const next = e.target.value.trim()
          setText(next)
          const withHash = next.startsWith('#') ? next : `#${next}`
          if (HEX.test(withHash)) onChange(withHash.toLowerCase())
        }}
        onBlur={() => setText(value ?? '')}
        placeholder='Default'
        aria-label={`${label} hex code`}
        spellCheck={false}
        className='h-8 w-[5.5rem] shrink-0 rounded-md border border-input bg-transparent px-2 font-mono text-xs uppercase outline-none placeholder:normal-case focus-visible:border-input-ring dark:bg-input/30'
      />
      <button
        type='button'
        onClick={() => onChange(null)}
        disabled={!isSet}
        className='rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:invisible'
        title='Back to default'
        aria-label={`Reset ${label}`}
      >
        <RotateCcw className='size-4' />
      </button>
    </div>
  )
}

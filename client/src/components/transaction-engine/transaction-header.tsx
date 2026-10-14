import { memo } from 'react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { NATIVE_SELECT_CLASS } from './cells/cell-props'
import { focusElement, useEngine, useEntrySelector } from './engine-context'
import type { HeaderField } from './types'

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyField = HeaderField<Record<string, any>>
/* eslint-enable @typescript-eslint/no-explicit-any */

const SPAN: Record<number, string> = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
}

/**
 * The document header (date, party, warehouse, reference…) from the config's fields.
 * Enter moves to the next header field and, from the last one, into the first row.
 */
export const TransactionHeader = memo(function TransactionHeader({
  fields,
}: {
  fields: AnyField[]
}) {
  const { store, stock, nav, t, readOnly } = useEngine()
  const header = useEntrySelector((s) => s.header)
  const errors = useEntrySelector((s) => s.headerErrors)
  const domId = (key: string) => `${store.config.id}-h-${key}`

  const advance = (index: number) => {
    const el = fields
      .slice(index + 1)
      .map((f) => document.getElementById(domId(f.key)))
      .find((e): e is HTMLElement => !!e && !(e as HTMLInputElement).disabled)
    if (el) focusElement(el)
    else {
      const first = store.getState().order[0]
      if (first) nav.focusRowStart(first)
    }
  }
  const onEnter = (index: number) => (e: React.KeyboardEvent) => {
    if (
      e.key === 'Enter' &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.shiftKey
    ) {
      e.preventDefault()
      advance(index)
    }
  }

  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
      {fields.map((f, i) => {
        const value = header[f.key]
        const error = errors[f.key]
        const set = (v: unknown) =>
          store.setHeader({ [f.key]: v, ...(f.derive?.(v, header) ?? {}) })
        const Icon = f.icon
        // Room for the leading icon (the date field pads its own text by 0.75rem more).
        const iconPad = Icon ? (f.kind === 'date' ? 'pl-6' : 'pl-9') : undefined
        const common = {
          id: domId(f.key),
          'aria-invalid': !!error || undefined,
          'aria-describedby': error ? `${domId(f.key)}-err` : undefined,
          disabled: readOnly,
        }
        let control: React.ReactNode
        switch (f.kind) {
          case 'textarea':
            control = (
              <Textarea
                {...common}
                rows={1}
                className={cn('min-h-9 resize-y', iconPad)}
                placeholder={f.placeholder}
                value={(value as string) ?? ''}
                onChange={(e) => set(e.target.value)}
              />
            )
            break
          case 'select':
          case 'warehouse': {
            const options =
              f.kind === 'warehouse'
                ? (stock.warehouses || []).map((w) => ({
                    value: w.id,
                    label: w.name,
                  }))
                : (f.options?.(header) ?? [])
            control = (
              <select
                {...common}
                className={cn(NATIVE_SELECT_CLASS, 'h-9 px-2', iconPad)}
                value={(value as string) ?? ''}
                onChange={(e) => set(e.target.value || null)}
                onKeyDown={onEnter(i)}
              >
                <option value=''>{f.placeholder || '—'}</option>
                {options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )
            break
          }
          case 'custom':
            control = f.render?.({
              value,
              onChange: set,
              header,
              error,
              id: domId(f.key),
              // After the pick re-renders (it may enable the next field, e.g. a PO picker).
              next: () => requestAnimationFrame(() => advance(i)),
            })
            break
          default:
            control = (
              <Input
                {...common}
                type={f.kind === 'date' ? 'date' : 'text'}
                showVoiceInput={false}
                autoComplete='off'
                placeholder={f.placeholder}
                className={iconPad}
                value={(value as string) ?? ''}
                onChange={(e) => set(e.target.value)}
                onKeyDown={onEnter(i)}
              />
            )
        }
        if (Icon && f.kind !== 'custom')
          control = (
            <div className='relative min-w-0'>
              <Icon
                className={cn(
                  'text-muted-foreground pointer-events-none absolute left-3 z-10 h-4 w-4',
                  f.kind === 'textarea' ? 'top-2.5' : 'top-1/2 -translate-y-1/2'
                )}
                aria-hidden
              />
              {control}
            </div>
          )
        return (
          <div
            key={f.key}
            className={cn(
              'grid min-w-0 content-start gap-1.5',
              SPAN[f.span ?? 1]
            )}
          >
            <Label htmlFor={domId(f.key)}>
              {t(f.label)}
              {f.required && <span className='text-destructive'> *</span>}
            </Label>
            {control}
            {error && (
              <p
                id={`${domId(f.key)}-err`}
                className='text-xs text-rose-700 dark:text-rose-400'
              >
                {error}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
})

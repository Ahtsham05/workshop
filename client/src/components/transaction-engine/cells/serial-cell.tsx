import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ScanLine, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { useEngine } from '../engine-context'
import type { EntrySerial } from '../types'
import type { CellProps } from './cell-props'
import { useCell } from './use-cell'

/**
 * Serial / IMEI numbers for one row. Enter opens the picker; there, scan or type a serial
 * and press Enter to add it (a scanner just keeps going), click to toggle one from the
 * in-stock list, Enter on an empty box closes it and moves on, Escape closes.
 */
export function SerialCell({ row, column, error, label, disabled }: CellProps) {
  const { store, stock, t } = useEngine()
  const cell = useCell(row.id, column.key, { vertical: false })
  const mode = column.serialMode ?? 'pick'
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [available, setAvailable] = useState<EntrySerial[] | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  // Closing with Enter / Done moves on; Escape / outside click returns to this cell.
  const moveOnClose = useRef(false)
  const serials: string[] = row.serials || []
  const product = row.product

  useEffect(() => {
    if (!open || mode !== 'pick' || !product || !stock.getSerials) return
    let live = true
    setAvailable(null)
    stock
      .getSerials(product, { batchId: row.batchId })
      .then((list) => live && setAvailable(list))
      .catch(() => live && setAvailable([]))
    return () => {
      live = false
    }
  }, [open, mode, product, row.batchId, stock])

  const setSerials = (next: string[]) =>
    store.updateRow(row.id, { serials: next })

  const add = (raw: string) => {
    const value = raw.trim()
    if (!value) return
    if (serials.some((s) => s.toLowerCase() === value.toLowerCase())) {
      setMessage(t('Already on this row'))
      return
    }
    // Also never twice in the same document.
    const s = store.getState()
    const elsewhere = s.order.find(
      (id) => id !== row.id && (s.rows[id].serials || []).includes(value)
    )
    if (elsewhere) {
      setMessage(t('Already on another row'))
      return
    }
    if (mode === 'pick') {
      const match = available?.find(
        (a) => a.serial.toLowerCase() === value.toLowerCase()
      )
      if (!match) {
        setMessage(t('Not in stock for this product'))
        return
      }
      setSerials([...serials, match.serial])
    } else {
      setSerials([...serials, value])
    }
    setMessage(null)
    setText('')
  }

  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase()
    return (available || [])
      .filter((a) => !q || a.serial.toLowerCase().includes(q))
      .slice(0, 200)
  }, [available, text])

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) {
          setText('')
          setMessage(null)
        }
      }}
    >
      <PopoverTrigger asChild>
        <button
          ref={cell.ref as React.Ref<HTMLButtonElement>}
          type='button'
          disabled={disabled || !product}
          aria-label={label}
          aria-invalid={!!error || undefined}
          title={error}
          onFocus={cell.onFocus}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
              e.preventDefault()
              setOpen(true)
            }
          }}
          className={cn(
            'border-input dark:bg-input/30 focus-visible:ring-input-ring/50 flex h-8 w-full min-w-0 items-center gap-1.5 rounded-md border bg-transparent px-2 text-left text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50',
            error && 'border-destructive'
          )}
        >
          <ScanLine className='text-muted-foreground h-3.5 w-3.5 shrink-0' />
          <span
            className={cn(
              'truncate',
              !serials.length && 'text-muted-foreground'
            )}
          >
            {serials.length
              ? serials.length === 1
                ? serials[0]
                : `${serials.length} ${t('serials')}`
              : t('Serials')}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        align='start'
        className='w-[min(24rem,calc(100vw-2rem))] p-3'
        onOpenAutoFocus={(e) => {
          e.preventDefault()
          inputRef.current?.focus()
        }}
        onCloseAutoFocus={(e) => {
          if (moveOnClose.current) {
            e.preventDefault()
            moveOnClose.current = false
            cell.next()
          }
        }}
      >
        <div className='space-y-2'>
          <div className='text-sm font-medium'>
            {product?.name}{' '}
            <span className='text-muted-foreground font-normal'>
              · {serials.length} {t('selected')}
            </span>
          </div>
          <Input
            ref={inputRef}
            value={text}
            showVoiceInput={false}
            autoComplete='off'
            spellCheck={false}
            aria-label={t('Scan or type a serial number')}
            placeholder={t('Scan or type a serial, then Enter')}
            className='h-8 text-sm'
            onChange={(e) => {
              setText(e.target.value)
              setMessage(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.ctrlKey && !e.altKey && !e.metaKey) {
                e.preventDefault()
                e.stopPropagation()
                if (text.trim()) add(text)
                else {
                  moveOnClose.current = true
                  setOpen(false)
                }
              }
            }}
          />
          {message && (
            <p className='text-xs text-rose-600 dark:text-rose-400'>
              {message}
            </p>
          )}
          {serials.length > 0 && (
            <div className='flex max-h-24 flex-wrap gap-1 overflow-y-auto'>
              {serials.map((s) => (
                <Badge
                  key={s}
                  variant='secondary'
                  className='gap-1 pr-1 font-mono text-[11px] font-normal'
                >
                  {s}
                  <button
                    type='button'
                    tabIndex={-1}
                    aria-label={t('Remove {{n}}').replace('{{n}}', s)}
                    className='hover:bg-muted-foreground/20 rounded-full p-0.5'
                    onClick={() => setSerials(serials.filter((x) => x !== s))}
                  >
                    <X className='h-3 w-3' />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          {mode === 'pick' && (
            <div className='max-h-48 overflow-y-auto rounded-md border'>
              {available === null ? (
                <p className='text-muted-foreground p-3 text-center text-xs'>
                  {t('Loading…')}
                </p>
              ) : filtered.length === 0 ? (
                <p className='text-muted-foreground p-3 text-center text-xs'>
                  {t('No units in stock')}
                </p>
              ) : (
                filtered.map((a) => {
                  const on = serials.includes(a.serial)
                  return (
                    <button
                      key={a.id}
                      type='button'
                      tabIndex={-1}
                      onClick={() =>
                        on
                          ? setSerials(serials.filter((x) => x !== a.serial))
                          : add(a.serial)
                      }
                      className='hover:bg-muted flex w-full items-center gap-2 px-2 py-1 text-left font-mono text-xs'
                    >
                      <Check
                        className={cn(
                          'h-3.5 w-3.5',
                          on ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      {a.serial}
                    </button>
                  )
                })
              )}
            </div>
          )}
          <div className='flex justify-end'>
            <Button
              type='button'
              size='sm'
              className='h-7'
              onClick={() => {
                moveOnClose.current = true
                setOpen(false)
              }}
            >
              {t('Done')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

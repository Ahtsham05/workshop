import { Input } from '@/components/ui/input'
import { useEngine } from '../engine-context'
import { CELL_CLASS, type CellProps } from './cell-props'
import { useCell } from './use-cell'

export function TextCell({ row, column, error, label, disabled }: CellProps) {
  const { store } = useEngine()
  const cell = useCell(row.id, column.key)
  return (
    <Input
      ref={cell.ref as React.Ref<HTMLInputElement>}
      type='text'
      autoComplete='off'
      showVoiceInput={false}
      aria-label={label}
      aria-invalid={!!error || undefined}
      title={error}
      disabled={disabled}
      placeholder={column.placeholder}
      className={CELL_CLASS}
      value={(row[column.key] as string) ?? ''}
      onFocus={cell.onFocus}
      onChange={(e) =>
        store.updateRow(row.id, { [column.key]: e.target.value })
      }
      onKeyDown={cell.onKeyDown}
    />
  )
}

/** A date (YYYY-MM-DD) — the browser's own picker; Enter moves on. */
export function DateCell({ row, column, error, label, disabled }: CellProps) {
  const { store } = useEngine()
  const cell = useCell(row.id, column.key, { vertical: false })
  const value = row[column.key] as string | null | undefined
  return (
    <Input
      ref={cell.ref as React.Ref<HTMLInputElement>}
      type='date'
      showVoiceInput={false}
      aria-label={label}
      aria-invalid={!!error || undefined}
      title={error}
      disabled={disabled}
      className={`${CELL_CLASS} px-1.5`}
      value={value ? String(value).slice(0, 10) : ''}
      onFocus={cell.onFocus}
      onChange={(e) =>
        store.updateRow(row.id, { [column.key]: e.target.value || null })
      }
      onKeyDown={cell.onKeyDown}
    />
  )
}

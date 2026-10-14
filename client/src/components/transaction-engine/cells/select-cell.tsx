import { useEffect, useMemo, useState } from 'react'
import { formatAppDate } from '@/lib/date-format'
import { getAllUnits } from '@/lib/units'
import { cn } from '@/lib/utils'
import { useEngine } from '../engine-context'
import type { EntryBatch } from '../types'
import { NATIVE_SELECT_CLASS, type CellProps } from './cell-props'
import { useCell } from './use-cell'

const ALL_UNITS = getAllUnits()

/**
 * Unit, warehouse, batch and config-defined choices — a native <select>: type-ahead,
 * arrow keys and the phone's own picker for free, and Enter moves on (it never opens a
 * menu or submits). Arrow keys change the value here, so they don't move rows.
 */
export function SelectCell({ row, column, error, label, disabled }: CellProps) {
  const { store, stock, t } = useEngine()
  const cell = useCell(row.id, column.key, { vertical: false })
  const batches = useBatches(column.kind === 'batch' ? row.product : null)

  const options = useMemo(() => {
    switch (column.kind) {
      case 'unit': {
        const own = row.product?.unit
        const list = ALL_UNITS.map((u) => ({ value: u.value, label: u.value }))
        return own && !list.some((u) => u.value === own)
          ? [{ value: own, label: own }, ...list]
          : list
      }
      case 'warehouse':
        return (stock.warehouses || []).map((w) => ({
          value: w.id,
          label: w.name,
        }))
      case 'batch':
        return (batches || []).map((b) => ({
          value: b.id,
          label: [
            b.batchNumber,
            `${b.quantity} ${t('left')}`,
            b.expiryDate
              ? `${t('exp')} ${formatAppDate(new Date(b.expiryDate))}`
              : null,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      default:
        return column.options ? column.options(row, store.ctx()) : []
    }
  }, [column, row, stock.warehouses, batches, store, t])

  const field =
    column.kind === 'batch'
      ? 'batchId'
      : column.kind === 'warehouse'
        ? 'warehouseId'
        : column.key
  const value = (row[field] as string | null | undefined) ?? ''

  return (
    <select
      ref={cell.ref as React.Ref<HTMLSelectElement>}
      aria-label={label}
      aria-invalid={!!error || undefined}
      title={error}
      disabled={disabled}
      className={cn(NATIVE_SELECT_CLASS, !value && 'text-muted-foreground')}
      value={value}
      onFocus={cell.onFocus}
      onKeyDown={cell.onKeyDown}
      onChange={(e) => {
        const v = e.target.value || null
        if (column.kind === 'batch') {
          const batch = batches?.find((b) => b.id === v)
          store.updateRow(row.id, {
            batchId: v,
            batchNumber: batch?.batchNumber ?? null,
          })
        } else {
          store.updateRow(row.id, { [field]: v })
        }
      }}
    >
      {/* A column may label the empty choice itself (e.g. "Auto · …"). */}
      {!options.some((o) => o.value === '') && (
        <option value=''>
          {column.placeholder ||
            (column.kind === 'batch' && batches && !batches.length
              ? t('No batches')
              : '—')}
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** A product's batches from the stock source (sync or async), refetched per product. */
function useBatches(product: CellProps['row']['product']) {
  const { stock } = useEngine()
  const [batches, setBatches] = useState<EntryBatch[] | null>(null)
  useEffect(() => {
    if (!product || !stock.getBatches) {
      setBatches(null)
      return
    }
    let live = true
    Promise.resolve(stock.getBatches(product)).then((list) => {
      if (live) setBatches(list)
    })
    return () => {
      live = false
    }
    // The product object only changes when it's picked or re-linked to the live catalog,
    // never on other row edits — so this doesn't refetch on every keystroke.
  }, [product, stock])
  return batches
}

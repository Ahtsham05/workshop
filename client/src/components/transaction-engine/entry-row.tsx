import { memo } from 'react'
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Eraser,
  MoreHorizontal,
  Plus,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { CellProps } from './cells/cell-props'
import { ComputedCell } from './cells/computed-cell'
import { NumberCell } from './cells/number-cell'
import { ProductCell } from './cells/product-cell'
import { SelectCell } from './cells/select-cell'
import { SerialCell } from './cells/serial-cell'
import { DateCell, TextCell } from './cells/text-cell'
import {
  cellEditable,
  useEngine,
  useEntrySelector,
  type AnyColumn,
} from './engine-context'

/** The editor for one column kind. */
function EntryCell(props: CellProps) {
  const { column, row, disabled } = props
  if (
    disabled &&
    ['batch', 'serial', 'text', 'date'].includes(column.kind) &&
    !row[column.key]?.length
  ) {
    return (
      <div className='text-muted-foreground flex h-8 items-center px-2 text-sm'>
        —
      </div>
    )
  }
  switch (column.kind) {
    case 'product':
      return <ProductCell {...props} />
    case 'quantity':
    case 'rate':
    case 'number':
      return <NumberCell {...props} />
    case 'unit':
    case 'select':
    case 'warehouse':
    case 'batch':
      return <SelectCell {...props} />
    case 'serial':
      return <SerialCell {...props} />
    case 'computed':
      return <ComputedCell {...props} />
    case 'date':
      return <DateCell {...props} />
    default:
      return <TextCell {...props} />
  }
}

/**
 * One row. Memoised by id: it subscribes to its own row, its errors and whether it's
 * active/selected, so editing another row — or typing in this one — never re-renders the
 * rest of the grid.
 */
export const EntryRow = memo(function EntryRow({
  rowId,
  index,
  gridTemplate,
}: {
  rowId: string
  index: number
  gridTemplate: string
}) {
  const { store, columns, nav, layout, readOnly, t } = useEngine()
  const row = useEntrySelector((s) => s.rows[rowId])
  const errors = useEntrySelector((s) => s.errors[rowId])
  const active = useEntrySelector((s) => s.activeRowId === rowId)
  const selected = useEntrySelector((s) => !!s.selected[rowId])
  if (!row) return null

  const ctx = store.ctx()
  const n = index + 1
  const errorList = errors
    ? Object.entries(errors)
        .filter(([, msg]) => !!msg)
        .map(([key, msg]) => {
          const col = columns.find((c) => c.key === key)
          return col ? `${t(col.label)}: ${msg}` : String(msg)
        })
    : []

  const cellFor = (column: AnyColumn) => (
    <EntryCell
      row={row}
      column={column}
      error={errors?.[column.key]}
      label={`${t(column.label)}, ${t('row')} ${n}`}
      disabled={readOnly || !cellEditable(column, row, ctx)}
    />
  )

  const handle = (
    <button
      type='button'
      tabIndex={-1}
      aria-pressed={selected}
      aria-label={`${t('Select row')} ${n}`}
      title={t('Select · Delete removes the selected rows')}
      onClick={(e) => {
        store.toggleSelected(rowId)
        e.currentTarget.focus()
      }}
      onKeyDown={(e) => {
        if (readOnly) return
        if (e.key === 'Delete' || e.key === 'Backspace') {
          e.preventDefault()
          const s = store.getState()
          const ids = Object.keys(s.selected).length
            ? Object.keys(s.selected)
            : [rowId]
          const focus = store.deleteRows(ids)
          if (focus) nav.focusRowStart(focus)
        }
      }}
      className={cn(
        'text-muted-foreground hover:bg-muted flex h-8 w-full items-center justify-center rounded-md text-xs tabular-nums',
        selected && 'bg-primary text-primary-foreground hover:bg-primary/90'
      )}
    >
      {n}
    </button>
  )

  const menu = readOnly ? null : <RowMenu rowId={rowId} isFirst={index === 0} />

  const rowClass = cn(
    'transition-colors',
    active && 'bg-muted/40',
    selected && 'bg-primary/5',
    errorList.length > 0 && 'shadow-[inset_3px_0_0_0_var(--destructive)]'
  )

  if (layout === 'cards') {
    return (
      <div
        id={`${store.config.id}-row-${rowId}`}
        role='group'
        aria-label={`${t('Row')} ${n}`}
        className={cn('space-y-2 border-b px-3 py-3', rowClass)}
      >
        <div className='flex items-start gap-2'>
          <div className='w-8 shrink-0'>{handle}</div>
          <div className='min-w-0 flex-1'>
            {columns[0] && cellFor(columns[0])}
          </div>
          <div className='shrink-0'>{menu}</div>
        </div>
        <div className='grid grid-cols-2 gap-x-2 gap-y-2 pl-10'>
          {columns.slice(1).map((c) => (
            <label
              key={c.key}
              className={cn('grid min-w-0 gap-0.5', c.wide && 'col-span-2')}
            >
              <span className='text-muted-foreground text-[11px]'>
                {t(c.label)}
              </span>
              {cellFor(c)}
            </label>
          ))}
        </div>
        {errorList.length > 0 && (
          <RowErrorsLine list={errorList} className='pl-10' />
        )}
      </div>
    )
  }

  return (
    <div
      id={`${store.config.id}-row-${rowId}`}
      role='row'
      aria-rowindex={n + 1}
      className={cn('border-b', rowClass)}
      style={{ contentVisibility: 'auto', containIntrinsicSize: 'auto 44px' }}
    >
      <div
        className='grid items-center gap-1.5 px-2 py-1'
        style={{ gridTemplateColumns: gridTemplate }}
      >
        <div role='cell'>{handle}</div>
        {columns.map((c) => (
          <div key={c.key} role='cell' className='min-w-0'>
            {cellFor(c)}
          </div>
        ))}
        <div role='cell' className='flex justify-end'>
          {menu}
        </div>
      </div>
      {errorList.length > 0 && (
        <RowErrorsLine list={errorList} className='px-2 pb-1.5 pl-12' />
      )}
    </div>
  )
})

function RowErrorsLine({
  list,
  className,
}: {
  list: string[]
  className?: string
}) {
  return (
    <p
      role='alert'
      className={cn('text-xs text-rose-700 dark:text-rose-400', className)}
    >
      {list.join(' · ')}
    </p>
  )
}

function RowMenu({ rowId, isFirst }: { rowId: string; isFirst: boolean }) {
  const { store, nav, t } = useEngine()
  const last = useEntrySelector((s) => s.order[s.order.length - 1] === rowId)
  const go = (id: string | null) => id && nav.focusRowStart(id)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type='button'
          variant='ghost'
          size='icon'
          tabIndex={-1}
          className='h-8 w-8'
          aria-label={t('Row actions')}
        >
          <MoreHorizontal className='h-4 w-4' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end' className='w-56'>
        <DropdownMenuItem onClick={() => go(store.insertRow(rowId))}>
          <Plus className='mr-2 h-4 w-4' />
          {t('Insert row above')}
          <DropdownMenuShortcut>Ins</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go(store.addRow(rowId))}>
          <Plus className='mr-2 h-4 w-4' />
          {t('Insert row below')}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => go(store.duplicateRow(rowId))}>
          <Copy className='mr-2 h-4 w-4' />
          {t('Duplicate row')}
          <DropdownMenuShortcut>Ctrl D</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => (store.clearRow(rowId), go(rowId))}>
          <Eraser className='mr-2 h-4 w-4' />
          {t('Clear row')}
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={isFirst}
          onClick={() => store.moveRow(rowId, -1)}
        >
          <ArrowUp className='mr-2 h-4 w-4' />
          {t('Move up')}
          <DropdownMenuShortcut>Ctrl ⇧ ↑</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          disabled={last}
          onClick={() => store.moveRow(rowId, 1)}
        >
          <ArrowDown className='mr-2 h-4 w-4' />
          {t('Move down')}
          <DropdownMenuShortcut>Ctrl ⇧ ↓</DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className='text-destructive'
          onClick={() => go(store.deleteRows([rowId]))}
        >
          <Trash2 className='mr-2 h-4 w-4' />
          {t('Delete row')}
          <DropdownMenuShortcut>Ctrl Del</DropdownMenuShortcut>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

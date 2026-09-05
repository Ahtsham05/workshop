import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable'
import { flexRender, type ColumnOrderState, type Table as TanstackTable } from '@tanstack/react-table'
import { TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { DraggableTableHead } from './draggable-table-head'
import { ColumnResizeHandle } from './column-resize-handle'

interface DndTableHeaderProps<TData> {
  table: TanstackTable<TData>
  columnOrder: ColumnOrderState
  onColumnOrderChange: (updater: ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState)) => void
  /** Column ids that stay put and never get a drag handle — typically the leading
   *  bulk-select checkbox and trailing row-actions menu. */
  lockedColumnIds?: string[]
  /** Column ids that never get a resize handle — the checkbox column by default; it has
   *  nothing worth widening. Resizing is otherwise independent of `lockedColumnIds`: a
   *  column can be reorder-locked (like 'actions') and still resizable. */
  noResizeColumnIds?: string[]
  rowClassName?: string
  /** Appended to every header's className, alongside its column meta className. */
  extraHeaderClassName?: string
}

/** Drop-in replacement for a table's `<TableHeader>` block that makes every non-locked
 *  column header draggable to reorder (via dnd-kit) and every non-excluded column's
 *  border draggable to resize (via tanstack-table's built-in column sizing). Pairs with
 *  `usePersistedColumnOrder`/`usePersistedColumnSizing` for state, both of which need to
 *  be wired into `useReactTable`'s state for the changes to actually reflect in
 *  `getVisibleCells()` / `getSize()`. Also renders the `<colgroup>` that makes those sizes
 *  stick — pair the caller's `<Table>` with `table-fixed` layout and an explicit
 *  `style={{ width: table.getTotalSize() }}` so the browser honors it instead of
 *  auto-sizing columns to content. */
export function DndTableHeader<TData>({
  table,
  columnOrder,
  onColumnOrderChange,
  lockedColumnIds = ['select', 'actions'],
  noResizeColumnIds = ['select'],
  rowClassName = 'group/row',
  extraHeaderClassName,
}: DndTableHeaderProps<TData>) {
  const sensors = useSensors(
    // Drags only ever start from DraggableTableHead's dedicated grip handle, so this can
    // stay small — just enough to distinguish an intentional drag from a stationary
    // press-and-release on the handle.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const draggableColumnIds = columnOrder.filter((id) => !lockedColumnIds.includes(id))

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return
    onColumnOrderChange((prev) => {
      const oldIndex = prev.indexOf(active.id as string)
      const newIndex = prev.indexOf(over.id as string)
      if (oldIndex === -1 || newIndex === -1) return prev
      return arrayMove(prev, oldIndex, newIndex)
    })
  }

  return (
    <>
      <colgroup>
        {table.getVisibleLeafColumns().map((column) => (
          <col key={column.id} style={{ width: column.getSize() }} />
        ))}
      </colgroup>
      <TableHeader>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id} className={rowClassName}>
              <SortableContext items={draggableColumnIds} strategy={horizontalListSortingStrategy}>
                {headerGroup.headers.map((header) => {
                  const headerContent = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  const className = cn(header.column.columnDef.meta?.className, extraHeaderClassName)
                  const resizeHandle = header.column.getCanResize() && !noResizeColumnIds.includes(header.column.id) ? (
                    <ColumnResizeHandle
                      onResizeStart={header.getResizeHandler()}
                      isResizing={header.column.getIsResizing()}
                    />
                  ) : undefined

                  if (lockedColumnIds.includes(header.column.id)) {
                    return (
                      <TableHead key={header.id} colSpan={header.colSpan} className={cn('relative', className)}>
                        {headerContent}
                        {resizeHandle}
                      </TableHead>
                    )
                  }

                  return (
                    <DraggableTableHead
                      key={header.id}
                      id={header.column.id}
                      colSpan={header.colSpan}
                      className={className}
                      resizeHandle={resizeHandle}
                    >
                      {headerContent}
                    </DraggableTableHead>
                  )
                })}
              </SortableContext>
            </TableRow>
          ))}
        </DndContext>
      </TableHeader>
    </>
  )
}

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

interface DndTableHeaderProps<TData> {
  table: TanstackTable<TData>
  columnOrder: ColumnOrderState
  onColumnOrderChange: (updater: ColumnOrderState | ((prev: ColumnOrderState) => ColumnOrderState)) => void
  /** Column ids that stay put and never get a drag handle — typically the leading
   *  bulk-select checkbox and trailing row-actions menu. */
  lockedColumnIds?: string[]
  rowClassName?: string
  /** Appended to every header's className, alongside its column meta className. */
  extraHeaderClassName?: string
}

/** Drop-in replacement for a table's `<TableHeader>` block that makes every non-locked
 *  column header draggable to reorder, via dnd-kit. Pairs with `usePersistedColumnOrder`
 *  for the `columnOrder`/`onColumnOrderChange` state and with `columnOrder` wired into
 *  `useReactTable`'s state so the reordering actually reflects in `getVisibleCells()`. */
export function DndTableHeader<TData>({
  table,
  columnOrder,
  onColumnOrderChange,
  lockedColumnIds = ['select', 'actions'],
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

                if (lockedColumnIds.includes(header.column.id)) {
                  return (
                    <TableHead key={header.id} colSpan={header.colSpan} className={className}>
                      {headerContent}
                    </TableHead>
                  )
                }

                return (
                  <DraggableTableHead key={header.id} id={header.column.id} colSpan={header.colSpan} className={className}>
                    {headerContent}
                  </DraggableTableHead>
                )
              })}
            </SortableContext>
          </TableRow>
        ))}
      </DndContext>
    </TableHeader>
  )
}

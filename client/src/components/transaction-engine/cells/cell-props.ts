import type { AnyColumn } from '../engine-context'
import type { EntryRowBase } from '../types'

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CellProps {
  row: EntryRowBase & Record<string, any>
  column: AnyColumn
  error?: string
  /** Accessible name, e.g. "Quantity, row 3". */
  label: string
  disabled: boolean
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** Compact field look shared by every cell (the app's Input styling, grid-sized). */
export const CELL_CLASS =
  'h-8 rounded-md px-2 text-sm md:text-sm shadow-none focus-visible:ring-2 aria-invalid:border-destructive'

export const NATIVE_SELECT_CLASS =
  'border-input dark:bg-input/30 focus-visible:border-input-ring focus-visible:ring-input-ring/50 aria-invalid:border-destructive h-8 w-full min-w-0 rounded-md border bg-transparent px-1.5 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50'

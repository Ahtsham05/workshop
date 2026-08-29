import type { ReactNode } from 'react'
import { Table } from '@tanstack/react-table'
import { DataTableViewOptions } from './data-table-view-options'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  leading?: ReactNode
  /** Extra controls (e.g. a category filter, AI Scan) shown between the search box and column visibility. */
  trailing?: ReactNode
}

/** Column visibility + optional leading slot (e.g. server-side search) + optional trailing slot (e.g. filters). */
export function DataTableToolbar<TData>({ table, leading, trailing }: DataTableToolbarProps<TData>) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      {leading ? <div className='min-w-0 flex-1 max-w-md'>{leading}</div> : <span className='min-w-0 flex-1' aria-hidden />}
      <div className='flex flex-wrap items-center gap-2'>
        {trailing}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}

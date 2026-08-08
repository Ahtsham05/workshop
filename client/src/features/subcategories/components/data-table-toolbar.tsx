import type { ReactNode } from 'react'
import { Table } from '@tanstack/react-table'
import { DataTableViewOptions } from './data-table-view-options'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  leading?: ReactNode
  trailing?: ReactNode
}

export function DataTableToolbar<TData>({ table, leading, trailing }: DataTableToolbarProps<TData>) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      <div className='flex min-w-0 flex-1 flex-wrap items-center gap-2'>
        {leading}
      </div>
      <div className='flex shrink-0 items-center gap-2'>
        {trailing}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}

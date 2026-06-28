import type { ReactNode } from 'react'
import { Table } from '@tanstack/react-table'
import { DataTableViewOptions } from './data-table-view-options'

interface DataTableToolbarProps<TData> {
  table: Table<TData>
  leading?: ReactNode
}

export function DataTableToolbar<TData>({ table, leading }: DataTableToolbarProps<TData>) {
  return (
    <div className='flex flex-wrap items-center justify-between gap-3'>
      {leading ? <div className='min-w-0 flex-1 max-w-md'>{leading}</div> : <span className='min-w-0 flex-1' aria-hidden />}
      <DataTableViewOptions table={table} />
    </div>
  )
}

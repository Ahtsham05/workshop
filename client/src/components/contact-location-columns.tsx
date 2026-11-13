import type { ColumnDef, Column } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { countryName, type ContactLocation } from '@/lib/countries'

type WithLocation = { billingAddress?: ContactLocation | null }

/**
 * City / State / Country list columns for the customer and supplier tables (wholesale &
 * distributor orgs). Each feature passes its own column-header component.
 */
export function contactLocationColumns<T extends WithLocation>(
  header: (column: Column<T, unknown>, title: string) => ReactNode,
): ColumnDef<T>[] {
  const cell = (value: string) => (value ? <span className='text-sm'>{value}</span> : <span className='text-muted-foreground'>—</span>)
  return [
    {
      id: 'city',
      size: 130,
      accessorFn: (row) => row.billingAddress?.city || '',
      header: ({ column }) => header(column, 'City'),
      cell: ({ getValue }) => cell(String(getValue() || '')),
      enableHiding: true,
    },
    {
      id: 'state',
      size: 120,
      accessorFn: (row) => row.billingAddress?.state || '',
      header: ({ column }) => header(column, 'State'),
      cell: ({ getValue }) => cell(String(getValue() || '')),
      enableHiding: true,
    },
    {
      id: 'country',
      size: 140,
      accessorFn: (row) => countryName(row.billingAddress?.countryCode),
      header: ({ column }) => header(column, 'Country'),
      cell: ({ getValue }) => cell(String(getValue() || '')),
      enableHiding: true,
    },
  ]
}

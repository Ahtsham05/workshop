import { ColumnDef, Table } from '@tanstack/react-table'
import { MoreHorizontal, Edit, Trash2, ArrowUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import type { Brand } from '@/stores/brand.api'
import { useBrands } from '../context/brands-context'

export function useBrandColumns(): ColumnDef<Brand>[] {
  const { dispatch } = useBrands()

  const selectColumn: ColumnDef<Brand> = {
    id: 'select',
    header: ({ table }: { table: Table<Brand> }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && 'indeterminate')
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  }

  const nameColumn: ColumnDef<Brand> = {
    accessorKey: 'name',
    header: ({ column }) => (
      <Button
        variant="ghost"
        onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        className="h-auto p-0 font-medium"
      >
        Brand
        <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
    cell: ({ row }) => {
      const brand = row.original
      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage src={brand.logo?.url || ''} alt={brand.name} className="object-cover" />
            <AvatarFallback className="bg-primary/10">
              {(brand.name?.charAt(0) || '?').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="font-medium">{brand.name}</span>
            {brand.slug && <span className="text-xs text-muted-foreground">/{brand.slug}</span>}
          </div>
        </div>
      )
    },
  }

  const countryColumn: ColumnDef<Brand> = {
    accessorKey: 'country',
    header: 'Country',
    cell: ({ row }) => row.original.country || '—',
  }

  const statusColumn: ColumnDef<Brand> = {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => {
      const status = row.original.status || 'active'
      return (
        <Badge variant={status === 'active' ? 'default' : 'outline'} className="capitalize">
          {status}
        </Badge>
      )
    },
  }

  const actionsColumn: ColumnDef<Brand> = {
    id: 'actions',
    header: 'Actions',
    cell: ({ row }) => {
      const brand = row.original
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: 'SET_BRAND', payload: brand })
                dispatch({ type: 'SET_OPEN', payload: true })
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: 'SET_BRAND', payload: brand })
                dispatch({ type: 'SET_DELETE_OPEN', payload: true })
              }}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
    enableHiding: false,
  }

  return [selectColumn, nameColumn, countryColumn, statusColumn, actionsColumn]
}

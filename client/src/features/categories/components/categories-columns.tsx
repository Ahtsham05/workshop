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
import { Category } from '@/stores/category.slice'
import { useCategories } from '../context/categories-context'
import { useLanguage } from '@/context/language-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export function useCategoryColumns(): ColumnDef<Category>[] {
  const { dispatch } = useCategories()
  const { t, language } = useLanguage()

  const selectColumn: ColumnDef<Category> = {
    id: 'select',
    header: ({ table }: { table: Table<Category> }) => (
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

  const nameColumn: ColumnDef<Category> = {
    accessorKey: 'name',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-medium"
        >
          {t('category_name')}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const category = row.original
      return (
        <div className={`flex items-center ${language === 'ur' ? 'space-x-reverse space-x-3 flex-row-reverse' : 'space-x-3'}`}>
          <Avatar className="h-10 w-10">
            <AvatarImage 
              src={category.image?.url || ''} 
              alt={category.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10">
              {category.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="font-medium">{category.name}</span>
        </div>
      )
    },
  }

  const actionsColumn: ColumnDef<Category> = {
    id: 'actions',
    header: t('actions'),
    cell: ({ row }) => {
      const category = row.original

      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">{t('open_menu')}</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: 'SET_CATEGORY', payload: category })
                dispatch({ type: 'SET_OPEN', payload: true })
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: 'SET_CATEGORY', payload: category })
                dispatch({ type: 'SET_DELETE_OPEN', payload: true })
              }}
              className="text-red-600"
            >
              <Trash2 className="mr-2 h-4 w-4" />
              {t('delete')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  }

  // Return columns in different order based on language
  if (language === 'ur') {
    return [selectColumn, actionsColumn, nameColumn]
  } else {
    return [selectColumn, nameColumn, actionsColumn]
  }
}

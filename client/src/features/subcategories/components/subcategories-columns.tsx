import { ColumnDef, Table } from '@tanstack/react-table'
import { MoreHorizontal, Edit, Trash2, ArrowUpDown, FolderTree } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { SubCategory } from '@/stores/subCategory.slice'
import { useSubCategories } from '../context/subcategories-context'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'

export function useSubCategoryColumns(): ColumnDef<SubCategory>[] {
  const { dispatch } = useSubCategories()
  const { t, language } = useLanguage()
  const { showUrdu } = useUrduDisplay()

  const selectColumn: ColumnDef<SubCategory> = {
    id: 'select',
    header: ({ table }: { table: Table<SubCategory> }) => (
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

  const nameColumn: ColumnDef<SubCategory> = {
    accessorKey: 'name',
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          className="h-auto p-0 font-medium"
        >
          {t('subcategory_name')}
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const subCategory = row.original
      const urdu = showUrdu ? subCategory.nameUrdu?.trim() : undefined
      return (
        <div className={`flex items-start gap-3 ${language === 'ur' ? 'flex-row-reverse' : ''}`}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage
              src={subCategory.image?.url || ''}
              alt={subCategory.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10">
              {(subCategory.name?.charAt(0) || '?').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className={getTextClasses(subCategory.name || 'Unnamed sub-category', 'shrink-0 font-medium')}>{subCategory.name || 'Unnamed sub-category'}</span>
            {urdu ? (
              <span dir='rtl' className={cn('min-w-0 truncate', getUrduSecondaryNameClasses(urdu))}>
                {urdu}
              </span>
            ) : null}
          </div>
        </div>
      )
    },
  }

  const categoryColumn: ColumnDef<SubCategory> = {
    id: 'category',
    accessorFn: (row) => (typeof row.category === 'object' ? row.category?.name : ''),
    header: t('parent_category'),
    cell: ({ row }) => {
      const category = row.original.category
      const categoryName = typeof category === 'object' ? category?.name : ''
      if (!categoryName) {
        return <span className="text-sm text-muted-foreground">—</span>
      }
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 rounded-full border-transparent bg-primary/10 px-2.5 py-0.5 font-medium text-primary hover:bg-primary/15"
        >
          <FolderTree className="h-3 w-3" />
          <span className={getTextClasses(categoryName, 'truncate max-w-[160px]')}>{categoryName}</span>
        </Badge>
      )
    },
  }

  const actionsColumn: ColumnDef<SubCategory> = {
    id: 'actions',
    header: t('actions'),
    cell: ({ row }) => {
      const subCategory = row.original

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
                dispatch({ type: 'SET_SUBCATEGORY', payload: subCategory })
                dispatch({ type: 'SET_OPEN', payload: true })
              }}
            >
              <Edit className="mr-2 h-4 w-4" />
              {t('edit')}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                dispatch({ type: 'SET_SUBCATEGORY', payload: subCategory })
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
    enableHiding: false,
  }

  return [selectColumn, nameColumn, categoryColumn, actionsColumn]
}

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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Category } from '@/stores/category.slice'
import { useCategories } from '../context/categories-context'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { cn } from '@/lib/utils'

export function useCategoryColumns(
  subCategoriesByCategory: Record<string, Array<{ id: string; name: string }>> = {}
): ColumnDef<Category>[] {
  const { dispatch } = useCategories()
  const { t, language } = useLanguage()
  const { showUrdu } = useUrduDisplay()

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
      const urdu = showUrdu ? category.nameUrdu?.trim() : undefined
      const subCategories = subCategoriesByCategory[category.id] || []
      return (
        <div className={`flex items-start gap-3 ${language === 'ur' ? 'flex-row-reverse' : ''}`}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarImage
              src={category.image?.url || ''}
              alt={category.name}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10">
              {(category.name?.charAt(0) || '?').toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-row flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className={getTextClasses(category.name || 'Unnamed category', 'shrink-0 font-medium')}>{category.name || 'Unnamed category'}</span>
              {urdu ? (
                <span dir='rtl' className={cn('min-w-0 truncate', getUrduSecondaryNameClasses(urdu))}>
                  {urdu}
                </span>
              ) : null}
            </div>
            {subCategories.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex w-fit items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                  >
                    <FolderTree className="h-2.5 w-2.5" />
                    {t('subcategories_count_badge', { count: subCategories.length })}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-3" align="start" onClick={(e) => e.stopPropagation()}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('subcategories')}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {subCategories.map((sub) => (
                      <span
                        key={sub.id}
                        className={getTextClasses(
                          sub.name,
                          'rounded-full bg-muted px-2 py-0.5 text-xs font-medium'
                        )}
                      >
                        {sub.name}
                      </span>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
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
    enableHiding: false,
  }

  // Return columns in different order based on language
  if (language === 'ur') {
    // return [selectColumn, actionsColumn, nameColumn]
    return [selectColumn, nameColumn, actionsColumn]
  } else {
    return [selectColumn, nameColumn, actionsColumn]
  }
}

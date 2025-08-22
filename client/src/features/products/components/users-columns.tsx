import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import LongText from '@/components/long-text'
import { Product } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'

export const useProductColumns = (): ColumnDef<Product>[] => {
  const { t } = useLanguage()
  
  return [
  {
    id: 'select',
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && 'indeterminate')}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label='Select all'
        className='translate-y-[2px]'
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label='Select row'
        className='translate-y-[2px]'
      />
    ),
    enableSorting: false,
    enableHiding: true,
  },
  {
    accessorKey: 'name',
    header: ({ column }) => <DataTableColumnHeader column={column} title='product_name' />,
    cell: ({ row }) => {
      const product = row.original
      return (
        <div className="flex items-center gap-2">
          {product.image?.url ? (
            <img 
              src={product.image.url} 
              alt={product.name}
              className="w-8 h-8 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
              <span className="text-sm font-medium text-muted-foreground">
                {product.name?.charAt(0).toUpperCase() || 'P'}
              </span>
            </div>
          )}
          <LongText className='max-w-36'>{row.getValue('name')}</LongText>
        </div>
      )
    },
    enableHiding: true,
  },
    {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title='description' />,
    cell: ({ row }) => <LongText className='max-w-36'>{row.getValue('description')}</LongText>,
    enableHiding: true,
  },
  {
    accessorKey: 'barcode',
    header: ({ column }) => <DataTableColumnHeader column={column} title='barcode' />,
    cell: ({ row }) => <div>{row.getValue('barcode')}</div>,
    enableHiding: true,
  },
  {
    accessorKey: 'price',
    header: ({ column }) => <DataTableColumnHeader column={column} title='price' />,
    cell: ({ row }) => <div>{row.getValue('price')}</div>,
  },
  {
    accessorKey: 'cost',
    header: ({ column }) => <DataTableColumnHeader column={column} title='cost' />,
    cell: ({ row }) => <div>{row.getValue('cost')}</div>,
  },
  {
    accessorKey: 'stockQuantity',
    header: ({ column }) => <DataTableColumnHeader column={column} title='stock_quantity' />,
    cell: ({ row }) => (
      <Badge variant='outline' className={cn('capitalize')}>
        {row.getValue('stockQuantity')}
      </Badge>
    ),
    filterFn: (row, id, value) => value.includes(row.getValue(id)),
    enableSorting: true,
  },
{
  id: 'actions',
  header: () => t('actions'),
  cell: DataTableRowActions,
}
]
}

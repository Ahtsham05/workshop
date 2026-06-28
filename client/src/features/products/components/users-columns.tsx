import { ColumnDef } from '@tanstack/react-table'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Package } from 'lucide-react'
import LongText from '@/components/long-text'
import { Product } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { getUnitLabel, DEFAULT_UNIT } from '@/lib/units'

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
      const urdu = product.nameUrdu?.trim()
      return (
        <div className='flex min-w-0 items-center gap-2'>
          {product.image?.url ? (
            <img
              src={product.image.url}
              alt={product.name}
              className='h-8 w-8 flex-shrink-0 rounded-full object-cover'
            />
          ) : (
            <div className='flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gray-100 to-gray-200'>
              <Package className='h-4 w-4 text-gray-400' />
            </div>
          )}
          <div className='flex min-w-0 flex-1 flex-row flex-wrap items-center gap-x-2 gap-y-0.5'>
            <LongText className={getTextClasses(row.getValue('name') || 'Unnamed product', 'max-w-36 shrink-0')}>
              {row.getValue('name') || 'Unnamed product'}
            </LongText>
            {urdu ? (
              <span
                dir='rtl'
                className={cn(
                  getUrduSecondaryNameClasses(urdu),
                  'min-w-0 max-w-[min(12rem,100%)] truncate sm:max-w-[14rem]',
                )}
              >
                {urdu}
              </span>
            ) : null}
          </div>
        </div>
      )
    },
    enableHiding: true,
  },
    {
    accessorKey: 'description',
    header: ({ column }) => <DataTableColumnHeader column={column} title='description' />,
    cell: ({ row }) => <LongText className={getTextClasses(row.getValue('description'), 'max-w-36')}>{row.getValue('description')}</LongText>,
    enableHiding: true,
  },
  {
    accessorKey: 'categories',
    header: ({ column }) => <DataTableColumnHeader column={column} title='categories' />,
    cell: ({ row }) => {
      const product = row.original
      const categories = product.categories || []
      
      if (categories.length === 0) {
        return <span className="text-muted-foreground">-</span>
      }
      
      return (
        <div className="flex flex-wrap gap-1">
          {categories.slice(0, 2).map((category) => (
            <Badge key={category._id} variant="secondary" className="flex items-center gap-1">
              {category.image?.url && (
                <img 
                  src={category.image.url} 
                  alt={category.name}
                  className="w-3 h-3 rounded-full object-cover"
                />
              )}
              <span className={getTextClasses(category.name, "text-xs")}>{category.name}</span>
            </Badge>
          ))}
          {categories.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{categories.length - 2}
            </Badge>
          )}
        </div>
      )
    },
    enableHiding: true,
  },
  {
    id: 'brand',
    accessorFn: (product) => (typeof product.brandId === 'object' && product.brandId ? product.brandId.name : ''),
    header: ({ column }) => <DataTableColumnHeader column={column} title='brand' />,
    cell: ({ row }) => {
      const brand = row.original.brandId
      if (!brand || typeof brand !== 'object') {
        return <span className="text-muted-foreground">-</span>
      }
      return (
        <Badge variant="secondary" className="flex items-center gap-1 max-w-fit">
          {brand.logo?.url && (
            <img src={brand.logo.url} alt={brand.name} className="w-3 h-3 rounded-full object-cover" />
          )}
          <span className={getTextClasses(brand.name, 'text-xs')}>{brand.name}</span>
        </Badge>
      )
    },
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
    cell: ({ row }) => {
      const product = row.original
      const range = product.hasVariants ? product.variantPriceRange : null
      if (range) {
        return (
          <div>
            {range.minPrice === range.maxPrice ? range.minPrice : `${range.minPrice}–${range.maxPrice}`}
          </div>
        )
      }
      const value = Number(row.getValue('price') ?? 0)
      return <div>{value}</div>
    },
  },
  {
    accessorKey: 'cost',
    header: ({ column }) => <DataTableColumnHeader column={column} title='cost' />,
    cell: ({ row }) => {
      const product = row.original
      const range = product.hasVariants ? product.variantPriceRange : null
      if (range) {
        return (
          <div>
            {range.minCost === range.maxCost ? range.minCost : `${range.minCost}–${range.maxCost}`}
          </div>
        )
      }
      const value = Number(row.getValue('cost') ?? 0)
      return <div>{value}</div>
    },
  },
  {
    accessorKey: 'stockQuantity',
    header: ({ column }) => <DataTableColumnHeader column={column} title='stock_quantity' />,
    cell: ({ row }) => {
      const product = row.original
      const unit = product.unit || DEFAULT_UNIT
      const value = product.hasVariants ? (product.variantStockTotal ?? 0) : Number(row.getValue('stockQuantity') ?? 0)
      return (
        <Badge variant='outline' className={cn('capitalize')}>
          {value} {getUnitLabel(unit)}
        </Badge>
      )
    },
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

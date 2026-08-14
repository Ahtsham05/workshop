import { ColumnDef } from '@tanstack/react-table'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Package, ShieldCheck, Fingerprint, Layers, Clock } from 'lucide-react'
import LongText from '@/components/long-text'
import { Product } from '../data/schema'
import { DataTableColumnHeader } from './data-table-column-header'
import { DataTableRowActions } from './data-table-row-actions'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { getUnitLabel, DEFAULT_UNIT } from '@/lib/units'
import { getDisplayStockValue } from '@/lib/product-stock-display'
import { useExpiringBatchesByProduct, daysUntil } from '../hooks/use-expiring-batches-by-product'

export const useProductColumns = (): ColumnDef<Product>[] => {
  const { t } = useLanguage()
  const { showUrdu } = useUrduDisplay()
  const expiringByProduct = useExpiringBatchesByProduct()

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
      const urdu = showUrdu ? product.nameUrdu?.trim() : undefined
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
    accessorKey: 'subCategories',
    header: ({ column }) => <DataTableColumnHeader column={column} title='sub categories' />,
    cell: ({ row }) => {
      const product = row.original
      const subCategories = product.subCategories || []

      if (subCategories.length === 0) {
        return <span className="text-muted-foreground">-</span>
      }

      return (
        <div className="flex flex-wrap gap-1">
          {subCategories.slice(0, 2).map((subCategory) => (
            <Badge key={subCategory._id} variant="outline" className="flex items-center gap-1">
              {subCategory.image?.url && (
                <img
                  src={subCategory.image.url}
                  alt={subCategory.name}
                  className="w-3 h-3 rounded-full object-cover"
                />
              )}
              <span className={getTextClasses(subCategory.name, "text-xs")}>{subCategory.name}</span>
            </Badge>
          ))}
          {subCategories.length > 2 && (
            <Badge variant="outline" className="text-xs">
              +{subCategories.length - 2}
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
    id: 'stockValue',
    header: ({ column }) => <DataTableColumnHeader column={column} title='stock_value' />,
    cell: ({ row }) => <div className='tabular-nums'>{getDisplayStockValue(row.original).toLocaleString()}</div>,
    enableHiding: true,
  },
  {
    id: 'tracking',
    header: ({ column }) => <DataTableColumnHeader column={column} title='tracking' />,
    cell: ({ row }) => {
      const product = row.original
      const productId = (product._id || product.id || '').toString()
      const expiry = expiringByProduct.get(productId)
      const badges: ReactNode[] = []

      if (product.trackImei) {
        badges.push(
          <Badge key='imei' variant='outline' className='gap-1 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-400'>
            <ShieldCheck className='h-3 w-3' /> {t('imei_tracked')}
          </Badge>
        )
      } else if (product.trackSerial) {
        badges.push(
          <Badge key='serial' variant='outline' className='gap-1 border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950/40 dark:text-violet-400'>
            <Fingerprint className='h-3 w-3' /> {t('serial_tracked')}
          </Badge>
        )
      }

      if (product.trackBatch || product.trackExpiry) {
        if (expiry) {
          const days = daysUntil(expiry)
          const expired = days < 0
          badges.push(
            <Badge
              key='expiry'
              variant='outline'
              className={cn(
                'gap-1',
                expired
                  ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-400'
                  : 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-400'
              )}
            >
              <Clock className='h-3 w-3' /> {expired ? t('expired') : t('expires_in', { days })}
            </Badge>
          )
        } else {
          badges.push(
            <Badge key='batch' variant='outline' className='gap-1 border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900 dark:bg-teal-950/40 dark:text-teal-400'>
              <Layers className='h-3 w-3' /> {t('batch_tracked')}
            </Badge>
          )
        }
      }

      if (badges.length === 0) return <span className='text-muted-foreground'>-</span>
      return <div className='flex flex-wrap gap-1'>{badges}</div>
    },
    enableHiding: true,
  },
{
  id: 'actions',
  header: () => t('actions'),
  cell: DataTableRowActions,
}
]
}

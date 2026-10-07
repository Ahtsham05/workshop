import { useState } from 'react'
import { Check, ChevronsUpDown } from 'lucide-react'
import {
  useGetManufacturingProductsQuery,
  type ManufacturingProduct,
} from '@/stores/manufacturing.api'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { PRODUCT_TYPE_META, fmtQty } from '../lib/constants'

export type PickedProduct = Pick<
  ManufacturingProduct,
  | 'id'
  | 'name'
  | 'sku'
  | 'unit'
  | 'productType'
  | 'stockQuantity'
  | 'defaultBomId'
  | 'cost'
>

/**
 * Searches the branch's EXISTING product catalog (server-side, debounced). The
 * manufacturing module never creates its own products — it only references these.
 */
export function ProductPicker({
  value,
  onChange,
  productType,
  placeholder,
  disabled,
  excludeIds = [],
  className,
}: {
  value?: { id: string; name: string } | null
  onChange: (product: PickedProduct) => void
  productType?: string
  placeholder?: string
  disabled?: boolean
  excludeIds?: string[]
  className?: string
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 250)
  const { data, isFetching } = useGetManufacturingProductsQuery(
    { search: debounced || undefined, productType, limit: 30 },
    { skip: !open }
  )
  const options = (data?.results || []).filter(
    (p) => !excludeIds.includes(p.id)
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type='button'
          variant='outline'
          role='combobox'
          disabled={disabled}
          className={cn(
            'w-full justify-between font-normal',
            !value && 'text-muted-foreground',
            className
          )}
        >
          <span className='truncate'>
            {value ? value.name : placeholder || t('Select product…')}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className='w-[min(26rem,calc(100vw-2rem))] p-0'
        align='start'
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search name, SKU or barcode…')}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            <CommandEmpty>
              {isFetching ? t('Searching…') : t('No products found.')}
            </CommandEmpty>
            <CommandGroup>
              {options.map((product) => (
                <CommandItem
                  key={product.id}
                  value={product.id}
                  onSelect={() => {
                    onChange(product)
                    setOpen(false)
                  }}
                  className='flex items-center gap-2'
                >
                  <Check
                    className={cn(
                      'h-4 w-4 shrink-0',
                      value?.id === product.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <div className='min-w-0 flex-1'>
                    <div className='truncate'>{product.name}</div>
                    <div className='text-muted-foreground truncate text-xs'>
                      {[
                        product.sku,
                        `${fmtQty(product.stockQuantity)} ${product.unit} ${t('on hand')}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  {product.productType && (
                    <span className='text-muted-foreground shrink-0 rounded border px-1 text-[10px]'>
                      {PRODUCT_TYPE_META[product.productType].short}
                    </span>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

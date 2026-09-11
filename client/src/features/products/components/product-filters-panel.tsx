import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Check, ChevronsUpDown, SlidersHorizontal, X } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

export const ALL_SUBCATEGORIES = 'all'
export const ALL_BRANDS = 'all'
export const NO_QUANTITY_OP = 'none'

export interface QuantityFilter {
  op: string
  value: string
}

interface SubCategoryOption {
  id: string
  name: string
}

interface BrandOption {
  id?: string
  _id?: string
  name: string
}

interface ProductFiltersPanelProps {
  subCategories: SubCategoryOption[]
  subCategoryFilter: string
  onSubCategoryChange: (value: string) => void
  brands: BrandOption[]
  brandFilter: string
  onBrandChange: (value: string) => void
  quantity: QuantityFilter
  onQuantityChange: (next: QuantityFilter) => void
}

const QUANTITY_OPERATORS: { value: string; label: string }[] = [
  { value: 'eq', label: '=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
]

interface ComboOption {
  value: string
  label: string
}

/** Searchable single-select combobox — same Command/Popover pattern used for the product
 *  form's category/brand pickers, so typing filters the list and Up/Down + Enter navigate
 *  and choose an option (built into cmdk, no extra wiring needed). */
function FilterCombobox({
  value,
  onChange,
  options,
  searchPlaceholder,
  emptyText,
}: {
  value: string
  onChange: (value: string) => void
  options: ComboOption[]
  searchPlaceholder: string
  emptyText: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find((o) => o.value === value)
  const filtered = query.trim()
    ? options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()))
    : options

  const handleSelect = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button variant='outline' role='combobox' aria-expanded={open} className='h-9 w-full justify-between font-normal'>
          <span className='truncate'>{selected?.label ?? ''}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[var(--radix-popover-trigger-width)] p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {filtered.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className='cursor-pointer gap-2'
                >
                  <span className={cn('flex-1 truncate', value === option.value && 'font-medium')}>{option.label}</span>
                  {value === option.value && <Check className='h-4 w-4 shrink-0 text-primary' />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** "Filters" popover for the Products list — Sub-Category, Brand, and a numeric Stock
 *  Quantity comparison (=, <, ≤, >, ≥) — alongside the existing Category dropdown and
 *  Active/Inactive select that already live above/next to the table. */
export function ProductFiltersPanel({
  subCategories,
  subCategoryFilter,
  onSubCategoryChange,
  brands,
  brandFilter,
  onBrandChange,
  quantity,
  onQuantityChange,
}: ProductFiltersPanelProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  const activeCount =
    (subCategoryFilter !== ALL_SUBCATEGORIES ? 1 : 0) +
    (brandFilter !== ALL_BRANDS ? 1 : 0) +
    (quantity.op !== NO_QUANTITY_OP && quantity.value.trim() !== '' ? 1 : 0)

  const clearAll = () => {
    onSubCategoryChange(ALL_SUBCATEGORIES)
    onBrandChange(ALL_BRANDS)
    onQuantityChange({ op: NO_QUANTITY_OP, value: '' })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' size='sm' className='h-9 gap-1.5'>
          <SlidersHorizontal className='h-4 w-4' />
          {t('Filters')}
          {activeCount > 0 && (
            <Badge variant='secondary' className='ml-0.5 h-4 px-1.5 text-[10px] leading-none'>
              {activeCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[300px] space-y-3 p-3' align='end'>
        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>{t('subcategories')}</label>
          <FilterCombobox
            value={subCategoryFilter}
            onChange={onSubCategoryChange}
            options={[
              { value: ALL_SUBCATEGORIES, label: t('All Sub-Categories') },
              ...subCategories.map((sc) => ({ value: sc.id, label: sc.name })),
            ]}
            searchPlaceholder={t('search_categories')}
            emptyText={t('no_categories_found')}
          />
        </div>

        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>{t('Brand')}</label>
          <FilterCombobox
            value={brandFilter}
            onChange={onBrandChange}
            options={[
              { value: ALL_BRANDS, label: t('All Brands') },
              ...brands.map((b) => ({ value: b._id || b.id || '', label: b.name })),
            ]}
            searchPlaceholder={t('Search brands...')}
            emptyText={t('No brands found')}
          />
        </div>

        <div className='space-y-1.5'>
          <label className='text-xs font-medium text-muted-foreground'>{t('stock_quantity')}</label>
          <div className='flex items-center gap-2'>
            <Select value={quantity.op} onValueChange={(op) => onQuantityChange({ ...quantity, op })}>
              <SelectTrigger className='h-9 w-[72px] shrink-0'>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_QUANTITY_OP}>—</SelectItem>
                {QUANTITY_OPERATORS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              type='number'
              min={0}
              showVoiceInput={false}
              placeholder={t('stock_quantity')}
              className='h-9 flex-1'
              value={quantity.value}
              onChange={(e) => onQuantityChange({ ...quantity, value: e.target.value })}
            />
          </div>
        </div>

        {activeCount > 0 && (
          <Button variant='ghost' size='sm' className='w-full justify-center gap-1.5 text-muted-foreground' onClick={clearAll}>
            <X className='h-3.5 w-3.5' />
            {t('Clear all filters')}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}

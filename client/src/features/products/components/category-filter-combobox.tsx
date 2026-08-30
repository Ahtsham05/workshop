import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown, LayoutGrid, PackageSearch, PackageX } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'

/** No category filter — the plain, unfiltered product list (today's default view). */
export const NO_CATEGORY_FILTER = 'none'
/** Category-wise breakdown view (chart + per-category totals) instead of a flat list. */
export const ALL_CATEGORIES_BREAKDOWN = 'all'
/** Products with no category assigned — matches the server's sentinel
 *  (product.controller.js UNCATEGORIZED_CATEGORY_VALUE) and the breakdown's own
 *  synthetic bucket (product.service.js UNCATEGORIZED_CATEGORY_ID). */
export const UNCATEGORIZED_CATEGORY = 'uncategorized'

interface CategoryOption {
  id: string
  name: string
}

interface CategoryFilterComboboxProps {
  value: string
  onChange: (value: string) => void
  categories: CategoryOption[]
  className?: string
}

/** Searchable category filter for the Products page — same Command/Popover combobox
 *  pattern used when assigning categories on the product form, plus two fixed entries
 *  ("None" and "All Categories") pinned above the searchable list. */
export function CategoryFilterCombobox({ value, onChange, categories, className }: CategoryFilterComboboxProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selectedCategory = categories.find((c) => c.id === value)
  const label =
    value === NO_CATEGORY_FILTER
      ? t('None')
      : value === ALL_CATEGORIES_BREAKDOWN
        ? t('all_categories')
        : value === UNCATEGORIZED_CATEGORY
          ? t('Uncategorized')
          : selectedCategory?.name || t('None')

  const filtered = query.trim()
    ? categories.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : categories

  const handleSelect = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          className={cn('h-9 w-[220px] justify-between font-normal', className)}
        >
          <span className='truncate'>{label}</span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[280px] p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('search_categories')}
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {!query.trim() && (
              <>
                <CommandGroup>
                  <CommandItem value={NO_CATEGORY_FILTER} onSelect={() => handleSelect(NO_CATEGORY_FILTER)} className='cursor-pointer gap-2'>
                    <PackageSearch className='h-4 w-4 text-muted-foreground' />
                    <div className='flex-1'>
                      <div>{t('None')}</div>
                      <div className='text-xs text-muted-foreground'>{t('Show all products, ungrouped')}</div>
                    </div>
                    {value === NO_CATEGORY_FILTER && <Check className='h-4 w-4 text-primary' />}
                  </CommandItem>
                  <CommandItem value={ALL_CATEGORIES_BREAKDOWN} onSelect={() => handleSelect(ALL_CATEGORIES_BREAKDOWN)} className='cursor-pointer gap-2'>
                    <LayoutGrid className='h-4 w-4 text-muted-foreground' />
                    <div className='flex-1'>
                      <div>{t('all_categories')}</div>
                      <div className='text-xs text-muted-foreground'>{t('Category-wise breakdown')}</div>
                    </div>
                    {value === ALL_CATEGORIES_BREAKDOWN && <Check className='h-4 w-4 text-primary' />}
                  </CommandItem>
                  <CommandItem value={UNCATEGORIZED_CATEGORY} onSelect={() => handleSelect(UNCATEGORIZED_CATEGORY)} className='cursor-pointer gap-2'>
                    <PackageX className='h-4 w-4 text-muted-foreground' />
                    <div className='flex-1'>
                      <div>{t('Uncategorized')}</div>
                      <div className='text-xs text-muted-foreground'>{t('Products with no category assigned')}</div>
                    </div>
                    {value === UNCATEGORIZED_CATEGORY && <Check className='h-4 w-4 text-primary' />}
                  </CommandItem>
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
            <CommandEmpty>{t('no_categories_found')}</CommandEmpty>
            <CommandGroup>
              {filtered.map((category) => (
                <CommandItem
                  key={category.id}
                  value={`category-${category.id}`}
                  onSelect={() => handleSelect(category.id)}
                  className='cursor-pointer gap-2'
                >
                  <span className='flex-1 truncate'>{category.name}</span>
                  {value === category.id && <Check className='h-4 w-4 text-primary' />}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

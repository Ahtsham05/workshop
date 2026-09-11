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
import { Checkbox } from '@/components/ui/checkbox'
import { Check, ChevronsUpDown, SlidersHorizontal, X } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { useGetDistinctProductTagsQuery } from '@/stores/product.api'

export const ALL_SUBCATEGORIES = 'all'
export const ALL_BRANDS = 'all'
export const NO_QUANTITY_OP = 'none'

export interface QuantityFilter {
  op: string
  value: string
}

export interface RangeFilter {
  min: string
  max: string
}

export interface TrackingFilter {
  imei: boolean
  serial: boolean
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
  tags: string[]
  onTagsChange: (next: string[]) => void
  priceRange: RangeFilter
  onPriceRangeChange: (next: RangeFilter) => void
  costRange: RangeFilter
  onCostRangeChange: (next: RangeFilter) => void
  tracking: TrackingFilter
  onTrackingChange: (next: TrackingFilter) => void
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

/** Multi-select tags checklist — same Command/Popover shell as FilterCombobox above, but
 *  toggles membership in an array instead of replacing a single value, and stays open
 *  after each pick so several tags can be selected in one popover visit. Options come
 *  from useGetDistinctProductTagsQuery (every tag value already used somewhere in this
 *  org/branch's catalog), so there's nothing to type that wouldn't match an existing tag. */
function TagsMultiSelect({ value, onChange }: { value: string[]; onChange: (next: string[]) => void }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const { data: allTags = [], isLoading } = useGetDistinctProductTagsQuery()
  const selected = new Set(value)

  const toggle = (tag: string) => {
    onChange(selected.has(tag) ? value.filter((v) => v !== tag) : [...value, tag])
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant='outline' role='combobox' aria-expanded={open} className='h-9 w-full justify-between font-normal'>
          <span className='truncate'>
            {value.length === 0 ? t('All Tags') : value.length === 1 ? value[0] : `${value.length} ${t('tags')}`}
          </span>
          <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[var(--radix-popover-trigger-width)] p-0' align='start'>
        <Command>
          <CommandInput placeholder={t('search_tags')} />
          <CommandList>
            <CommandEmpty>{isLoading ? t('loading') : t('No tags found')}</CommandEmpty>
            <CommandGroup>
              {allTags.map((tag) => (
                <CommandItem key={tag} value={tag} onSelect={() => toggle(tag)} className='cursor-pointer gap-2'>
                  <Checkbox checked={selected.has(tag)} className='pointer-events-none' />
                  <span className='flex-1 truncate'>{tag}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** "Filters" popover for the Products list — Sub-Category, Brand, Tags, Price/Cost
 *  range, Tracking type, and a numeric Stock Quantity comparison (=, <, ≤, >, ≥) —
 *  alongside the existing Category dropdown and Active/Inactive select that already
 *  live above/next to the table. */
export function ProductFiltersPanel({
  subCategories,
  subCategoryFilter,
  onSubCategoryChange,
  brands,
  brandFilter,
  onBrandChange,
  quantity,
  onQuantityChange,
  tags,
  onTagsChange,
  priceRange,
  onPriceRangeChange,
  costRange,
  onCostRangeChange,
  tracking,
  onTrackingChange,
}: ProductFiltersPanelProps) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)

  // Draft state — every control below edits these, not the applied filters directly.
  // Nothing reaches the product query (or the parent's state at all) until "Apply
  // Filters" is clicked, so opening the panel, changing your mind, and clicking away
  // costs nothing. Re-synced from the applied props each time the popover opens (see
  // handleOpenChange), so a closed-without-applying edit never lingers into the next visit.
  const [draftSubCategory, setDraftSubCategory] = useState(subCategoryFilter)
  const [draftBrand, setDraftBrand] = useState(brandFilter)
  const [draftQuantity, setDraftQuantity] = useState(quantity)
  const [draftTags, setDraftTags] = useState(tags)
  const [draftPriceRange, setDraftPriceRange] = useState(priceRange)
  const [draftCostRange, setDraftCostRange] = useState(costRange)
  const [draftTracking, setDraftTracking] = useState(tracking)

  const handleOpenChange = (next: boolean) => {
    if (next) {
      setDraftSubCategory(subCategoryFilter)
      setDraftBrand(brandFilter)
      setDraftQuantity(quantity)
      setDraftTags(tags)
      setDraftPriceRange(priceRange)
      setDraftCostRange(costRange)
      setDraftTracking(tracking)
    }
    setOpen(next)
  }

  // Reflects the APPLIED filters (props), not the in-progress draft — this is what's
  // actually affecting the product list right now.
  const activeCount =
    (subCategoryFilter !== ALL_SUBCATEGORIES ? 1 : 0) +
    (brandFilter !== ALL_BRANDS ? 1 : 0) +
    (quantity.op !== NO_QUANTITY_OP && quantity.value.trim() !== '' ? 1 : 0) +
    (tags.length > 0 ? 1 : 0) +
    (priceRange.min.trim() !== '' || priceRange.max.trim() !== '' ? 1 : 0) +
    (costRange.min.trim() !== '' || costRange.max.trim() !== '' ? 1 : 0) +
    (tracking.imei || tracking.serial ? 1 : 0)

  const applyFilters = () => {
    onSubCategoryChange(draftSubCategory)
    onBrandChange(draftBrand)
    onQuantityChange(draftQuantity)
    onTagsChange(draftTags)
    onPriceRangeChange(draftPriceRange)
    onCostRangeChange(draftCostRange)
    onTrackingChange(draftTracking)
    setOpen(false)
  }

  const resetFilters = () => {
    setDraftSubCategory(ALL_SUBCATEGORIES)
    setDraftBrand(ALL_BRANDS)
    setDraftQuantity({ op: NO_QUANTITY_OP, value: '' })
    setDraftTags([])
    setDraftPriceRange({ min: '', max: '' })
    setDraftCostRange({ min: '', max: '' })
    setDraftTracking({ imei: false, serial: false })
    onSubCategoryChange(ALL_SUBCATEGORIES)
    onBrandChange(ALL_BRANDS)
    onQuantityChange({ op: NO_QUANTITY_OP, value: '' })
    onTagsChange([])
    onPriceRangeChange({ min: '', max: '' })
    onCostRangeChange({ min: '', max: '' })
    onTrackingChange({ imei: false, serial: false })
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
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
      <PopoverContent
        className='flex max-h-[var(--radix-popover-content-available-height)] w-[320px] flex-col p-0'
        align='end'
        sideOffset={8}
      >
        <div className='min-h-0 space-y-3 overflow-y-auto p-3'>
          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>{t('subcategories')}</label>
            <FilterCombobox
              value={draftSubCategory}
              onChange={setDraftSubCategory}
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
              value={draftBrand}
              onChange={setDraftBrand}
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
              <Select value={draftQuantity.op} onValueChange={(op) => setDraftQuantity({ ...draftQuantity, op })}>
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
                value={draftQuantity.value}
                onChange={(e) => setDraftQuantity({ ...draftQuantity, value: e.target.value })}
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>{t('tags')}</label>
            <TagsMultiSelect value={draftTags} onChange={setDraftTags} />
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>{t('price')}</label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                min={0}
                showVoiceInput={false}
                placeholder={t('min')}
                className='h-9 flex-1'
                value={draftPriceRange.min}
                onChange={(e) => setDraftPriceRange({ ...draftPriceRange, min: e.target.value })}
              />
              <span className='text-muted-foreground'>–</span>
              <Input
                type='number'
                min={0}
                showVoiceInput={false}
                placeholder={t('max')}
                className='h-9 flex-1'
                value={draftPriceRange.max}
                onChange={(e) => setDraftPriceRange({ ...draftPriceRange, max: e.target.value })}
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>{t('cost')}</label>
            <div className='flex items-center gap-2'>
              <Input
                type='number'
                min={0}
                showVoiceInput={false}
                placeholder={t('min')}
                className='h-9 flex-1'
                value={draftCostRange.min}
                onChange={(e) => setDraftCostRange({ ...draftCostRange, min: e.target.value })}
              />
              <span className='text-muted-foreground'>–</span>
              <Input
                type='number'
                min={0}
                showVoiceInput={false}
                placeholder={t('max')}
                className='h-9 flex-1'
                value={draftCostRange.max}
                onChange={(e) => setDraftCostRange({ ...draftCostRange, max: e.target.value })}
              />
            </div>
          </div>

          <div className='space-y-1.5'>
            <label className='text-xs font-medium text-muted-foreground'>{t('tracking')}</label>
            <div className='flex items-center gap-4'>
              <label className='flex items-center gap-1.5 text-sm font-normal'>
                <Checkbox
                  checked={draftTracking.imei}
                  onCheckedChange={(checked) => setDraftTracking({ ...draftTracking, imei: !!checked })}
                />
                {t('imei_tracked')}
              </label>
              <label className='flex items-center gap-1.5 text-sm font-normal'>
                <Checkbox
                  checked={draftTracking.serial}
                  onCheckedChange={(checked) => setDraftTracking({ ...draftTracking, serial: !!checked })}
                />
                {t('serial_tracked')}
              </label>
            </div>
          </div>
        </div>

        <div className='flex shrink-0 gap-2 border-t p-3'>
          <Button variant='outline' size='sm' className='flex-1 gap-1.5' onClick={resetFilters}>
            <X className='h-3.5 w-3.5' />
            {t('Reset')}
          </Button>
          <Button size='sm' className='flex-1' onClick={applyFilters}>
            {t('Apply Filters')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

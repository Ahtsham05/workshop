import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { PRODUCT_TYPE_META } from '../lib/constants'
import type { StockSheetOptions } from '../lib/report-types'
import type { StockSheetFilters } from '../lib/stock-sheet-state'
import { FilterChips, SearchField } from './list-controls'

/*
 * Controls of the inventory stock sheet: which items (category, sub-category, brand,
 * product type, search), how the tables are grouped, what each date column covers, and
 * how many dates go on a printed page.
 */

const NONE = 'none'

interface PickOption {
  value: string
  label: string
  count?: number
}

function MultiPicker({
  label,
  allLabel,
  options,
  value,
  onChange,
  loading,
}: {
  label: string
  allLabel: string
  options: PickOption[]
  value: string[]
  onChange: (next: string[]) => void
  loading?: boolean
}) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const chosen = options.filter((o) => value.includes(o.value))
  // A remembered choice that no longer exists (deleted category) still filters — show it.
  const missing = value.length - chosen.length
  const summary = !value.length
    ? allLabel
    : chosen.length === 1 && !missing
      ? chosen[0].label
      : chosen.length <= 2 && !missing
        ? chosen.map((o) => o.label).join(', ')
        : `${value.length} ${t('selected')}`
  const toggle = (v: string) =>
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  return (
    <div className='min-w-0 space-y-1'>
      <Label className='text-muted-foreground text-xs'>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant='outline'
            role='combobox'
            aria-expanded={open}
            aria-label={label}
            className={cn('h-9 w-full justify-between px-3 font-normal', !value.length && 'text-muted-foreground')}
          >
            <span className='truncate'>{loading && !options.length ? t('Loading…') : summary}</span>
            <span className='flex shrink-0 items-center gap-1'>
              {value.length > 0 && (
                <span className='bg-foreground text-background rounded-full px-1.5 text-[11px] font-semibold tabular-nums'>
                  {value.length}
                </span>
              )}
              <ChevronsUpDown className='h-4 w-4 opacity-50' />
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className='w-[var(--radix-popover-trigger-width)] min-w-64 p-0' align='start'>
          <Command>
            <CommandInput placeholder={`${t('Search')} ${label.toLowerCase()}`} />
            <CommandList>
              <CommandEmpty>{t('Nothing found.')}</CommandEmpty>
              <CommandGroup>
                {options.map((o) => {
                  const on = value.includes(o.value)
                  return (
                    <CommandItem
                      key={o.value}
                      value={`${o.label} ${o.value}`}
                      onSelect={() => toggle(o.value)}
                      className='gap-2'
                    >
                      <span
                        className={cn(
                          'flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border',
                          on ? 'border-foreground bg-foreground text-background' : 'border-muted-foreground/40'
                        )}
                        aria-hidden
                      >
                        {on && <Check className='h-3 w-3' />}
                      </span>
                      <span className={cn('min-w-0 flex-1 truncate', o.value === NONE && 'italic')}>{o.label}</span>
                      {o.count != null && (
                        <span className='text-muted-foreground text-xs tabular-nums'>{o.count}</span>
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            </CommandList>
            {value.length > 0 && (
              <div className='border-t p-1'>
                <Button variant='ghost' size='sm' className='w-full justify-center' onClick={() => onChange([])}>
                  <X className='h-4 w-4' />
                  {t('Clear')} — {allLabel}
                </Button>
              </div>
            )}
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  )
}

export function StockSheetControls({
  options,
  loading,
  filters,
  onChange,
  search,
  onSearchChange,
}: {
  options?: StockSheetOptions
  loading?: boolean
  filters: StockSheetFilters
  onChange: (patch: Partial<StockSheetFilters>) => void
  search: string
  onSearchChange: (value: string) => void
}) {
  const { t } = useLanguage()

  const categoryOptions = useMemo<PickOption[]>(
    () => [
      ...(options?.categories || []).map((c) => ({ value: c.id, label: c.name, count: c.count })),
      ...(options?.noCategory ? [{ value: NONE, label: t('No category'), count: options.noCategory }] : []),
    ],
    [options, t]
  )
  // Sub-categories of the chosen categories only.
  const subOptions = useMemo<PickOption[]>(() => {
    const chosen = filters.categoryIds.filter((id) => id !== NONE)
    return [
      ...(options?.subCategories || [])
        .filter((s) => !chosen.length || !s.categoryId || chosen.includes(s.categoryId))
        .map((s) => ({ value: s.id, label: s.name, count: s.count })),
      ...(options?.noSubCategory ? [{ value: NONE, label: t('No sub-category'), count: options.noSubCategory }] : []),
    ]
  }, [options, filters.categoryIds, t])
  const brandOptions = useMemo<PickOption[]>(
    () => [
      ...(options?.brands || []).map((b) => ({ value: b.id, label: b.name, count: b.count })),
      ...(options?.noBrand ? [{ value: NONE, label: t('No brand'), count: options.noBrand }] : []),
    ],
    [options, t]
  )
  const typeOptions = useMemo<PickOption[]>(() => {
    const counts = new Map((options?.types || []).map((x) => [x.type || NONE, x.count]))
    return [
      ...Object.entries(PRODUCT_TYPE_META)
        .filter(([type]) => counts.has(type))
        .map(([type, meta]) => ({ value: type, label: t(meta.label), count: counts.get(type) })),
      ...(counts.has(NONE) ? [{ value: NONE, label: t('No product type'), count: counts.get(NONE) }] : []),
    ]
  }, [options, t])

  const setCategories = (categoryIds: string[]) => {
    // Drop sub-categories that no longer sit under a chosen category.
    const chosen = categoryIds.filter((id) => id !== NONE)
    const parentOf = new Map((options?.subCategories || []).map((s) => [s.id, s.categoryId]))
    const subCategoryIds = chosen.length
      ? filters.subCategoryIds.filter((id) => {
          const parent = parentOf.get(id)
          return id === NONE || !parent || chosen.includes(parent)
        })
      : filters.subCategoryIds
    onChange({ categoryIds, subCategoryIds })
  }
  const filtered =
    filters.categoryIds.length + filters.subCategoryIds.length + filters.brandIds.length + filters.productTypes.length > 0

  return (
    <div className='space-y-3 border-t pt-3'>
      <div className='grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4'>
        <MultiPicker
          label={t('Category')}
          allLabel={t('All categories')}
          options={categoryOptions}
          value={filters.categoryIds}
          onChange={setCategories}
          loading={loading}
        />
        <MultiPicker
          label={t('Sub-category')}
          allLabel={t('All sub-categories')}
          options={subOptions}
          value={filters.subCategoryIds}
          onChange={(subCategoryIds) => onChange({ subCategoryIds })}
          loading={loading}
        />
        <MultiPicker
          label={t('Brand')}
          allLabel={t('All brands')}
          options={brandOptions}
          value={filters.brandIds}
          onChange={(brandIds) => onChange({ brandIds })}
          loading={loading}
        />
        <MultiPicker
          label={t('Product type')}
          allLabel={t('All types')}
          options={typeOptions}
          value={filters.productTypes}
          onChange={(productTypes) => onChange({ productTypes })}
          loading={loading}
        />
      </div>

      <div className='flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between'>
        <div className='min-w-0 space-y-1'>
          <span className='text-muted-foreground block text-xs'>{t('One table per')}</span>
          <FilterChips
            label={t('One table per')}
            value={filters.groupBy}
            onChange={(v) => onChange({ groupBy: v as StockSheetFilters['groupBy'] })}
            options={[
              { value: 'category', label: t('Category') },
              { value: 'subcategory', label: t('Sub-category') },
              { value: 'brand', label: t('Brand') },
              { value: 'type', label: t('Product type') },
              { value: 'none', label: t('One list') },
            ]}
          />
        </div>
        <div className='min-w-0 space-y-1'>
          <span className='text-muted-foreground block text-xs'>{t('Date columns')}</span>
          <FilterChips
            label={t('Date columns')}
            value={filters.interval}
            onChange={(v) => onChange({ interval: v as StockSheetFilters['interval'] })}
            options={[
              { value: 'day', label: t('Day by day') },
              { value: 'week', label: t('Week by week') },
              { value: 'month', label: t('Month by month') },
            ]}
          />
        </div>
      </div>

      <div className='flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <SearchField value={search} onChange={onSearchChange} placeholder={t('Search item, SKU or barcode')} />
          {filtered && (
            <Button
              variant='ghost'
              size='sm'
              className='self-start sm:self-auto'
              onClick={() => onChange({ categoryIds: [], subCategoryIds: [], brandIds: [], productTypes: [] })}
            >
              <X className='h-4 w-4' />
              {t('Clear filters')}
            </Button>
          )}
        </div>
        <div className='flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-5'>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={filters.activeDays} onCheckedChange={(activeDays) => onChange({ activeDays })} />
            {t('Only dates with movement')}
          </label>
          <label className='flex items-center gap-2 text-sm'>
            <Switch checked={filters.hideIdle} onCheckedChange={(hideIdle) => onChange({ hideIdle })} />
            {t('Hide items with no stock and no movement')}
          </label>
          <div className='flex items-center gap-2 text-sm'>
            <span className='text-muted-foreground whitespace-nowrap'>{t('Dates per printed page')}</span>
            <Select
              value={String(filters.datesPerPage)}
              onValueChange={(v) => onChange({ datesPerPage: Number(v) })}
            >
              <SelectTrigger className='h-8 w-20' aria-label={t('Dates per printed page')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                  <SelectItem key={n} value={String(n)}>
                    {n}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
  )
}

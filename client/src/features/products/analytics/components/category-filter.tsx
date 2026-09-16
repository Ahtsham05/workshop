import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, FolderTree, PackageX, Tags } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import type { CategoryFacet } from '@/stores/productAnalytics.api'

export const UNCATEGORIZED = 'uncategorized'

interface Props {
  value: string
  onChange: (value: string) => void
  categories: CategoryFacet[]
  uncategorizedCount: number
  className?: string
}

/**
 * Searchable category filter for the ranking table. Options and counts come from the rankings
 * response itself (every category that has products, counted over the whole catalog), so the
 * list is complete however many categories exist — and same-named categories are told apart
 * by their product counts.
 */
export function CategoryFilter({ value, onChange, categories, uncategorizedCount, className }: Props) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = categories.find((category) => category.id === value)
  const label = value === UNCATEGORIZED ? t('Uncategorized') : selected?.name || t('All categories')

  const term = query.trim().toLowerCase()
  const filtered = useMemo(
    () => (term ? categories.filter((category) => category.name.toLowerCase().includes(term)) : categories),
    [categories, term],
  )

  const choose = (next: string) => {
    onChange(next)
    setOpen(false)
    setQuery('')
  }

  const count = (n: number) => <span className='ml-auto text-xs tabular-nums text-muted-foreground'>{n.toLocaleString()}</span>

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant='outline'
          role='combobox'
          aria-expanded={open}
          aria-label={t('Category')}
          className={cn('h-9 w-[200px] justify-between gap-2 font-normal', value && 'border-primary/40 bg-primary/5', className)}
        >
          <Tags className='h-4 w-4 shrink-0 text-muted-foreground' />
          <span className='flex-1 truncate text-left'>{label}</span>
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[280px] p-0' align='start'>
        <Command shouldFilter={false}>
          <CommandInput placeholder={t('Search categories...')} value={query} onValueChange={setQuery} />
          <CommandList className='max-h-[320px]'>
            {!term ? (
              <>
                <CommandGroup>
                  <CommandItem value='__all' onSelect={() => choose('')} className='cursor-pointer gap-2'>
                    <FolderTree className='h-4 w-4 text-muted-foreground' />
                    <span className='flex-1'>{t('All categories')}</span>
                    {!value ? <Check className='h-4 w-4 text-primary' /> : null}
                  </CommandItem>
                  {uncategorizedCount > 0 ? (
                    <CommandItem value='__uncategorized' onSelect={() => choose(UNCATEGORIZED)} className='cursor-pointer gap-2'>
                      <PackageX className='h-4 w-4 text-muted-foreground' />
                      <span className='flex-1'>{t('Uncategorized')}</span>
                      {value === UNCATEGORIZED ? <Check className='h-4 w-4 text-primary' /> : count(uncategorizedCount)}
                    </CommandItem>
                  ) : null}
                </CommandGroup>
                <CommandSeparator />
              </>
            ) : null}
            {filtered.length === 0 ? (
              <CommandEmpty>{t('No categories match "{{query}}"', { query: query.trim() })}</CommandEmpty>
            ) : (
              <CommandGroup heading={term ? t('{{count}} found', { count: filtered.length }) : t('Categories')}>
                {filtered.map((category) => (
                  <CommandItem
                    key={category.id}
                    value={`category-${category.id}`}
                    onSelect={() => choose(category.id)}
                    className='cursor-pointer gap-2'
                  >
                    <span className='min-w-0 flex-1 truncate' title={category.name}>
                      {category.name}
                    </span>
                    {value === category.id ? <Check className='h-4 w-4 shrink-0 text-primary' /> : count(category.productCount)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

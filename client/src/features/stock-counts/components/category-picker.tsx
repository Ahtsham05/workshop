import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { filterAndRankBySearch } from '@/utils/urdu-text-utils'

export interface CategoryOption {
  id: string
  name: string
  itemCount: number
}

interface CategoryPickerProps {
  categories: CategoryOption[]
  loading: boolean
  failed?: boolean
  value: string[]
  onChange: (ids: string[]) => void
  onRetry?: () => void
}

/**
 * Category filter for count dialogs: always searchable, "Select all / Clear" that act on what
 * the search shows, selected ones listed as removable chips, and a skeleton while loading so
 * the dialog doesn't change height when the list arrives.
 */
export function CategoryPicker({ categories, loading, failed, value, onChange, onRetry }: CategoryPickerProps) {
  const { t } = useLanguage()
  const [search, setSearch] = useState('')
  const selected = useMemo(() => new Set(value), [value])
  const q = search.trim().toLowerCase()
  const visible = useMemo(() => (q ? filterAndRankBySearch(categories, q, (c) => [c.name]) : categories), [categories, q])
  const allVisibleSelected = visible.length > 0 && visible.every((c) => selected.has(c.id))
  const byId = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  const toggle = (id: string) => onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id])
  const toggleVisible = () => {
    if (allVisibleSelected) onChange(value.filter((id) => !visible.some((c) => c.id === id)))
    else onChange([...new Set([...value, ...visible.map((c) => c.id)])])
  }
  const selectedItems = value.reduce((sum, id) => sum + (byId.get(id)?.itemCount ?? 0), 0)

  return (
    <div className='space-y-2'>
      <div className='flex items-center justify-between gap-2'>
        <span className='text-sm font-medium'>{t('Categories')}</span>
        {!loading && categories.length > 0 && (
          <div className='flex items-center gap-1'>
            <Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={toggleVisible} disabled={visible.length === 0}>
              {allVisibleSelected ? (q ? t('Unselect shown') : t('Unselect all')) : q ? t('Select shown') : t('Select all')}
            </Button>
            {value.length > 0 && (
              <Button type='button' variant='ghost' size='sm' className='h-7 px-2 text-xs' onClick={() => onChange([])}>
                {t('Clear')}
              </Button>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <div className='space-y-2 rounded-md border p-2' aria-busy='true' aria-label={t('Loading categories')}>
          <Skeleton className='h-8 w-full' />
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className='h-6 w-full' />
          ))}
        </div>
      ) : failed ? (
        <div className='rounded-md border p-3 text-sm text-muted-foreground'>
          {t('Could not load categories.')}{' '}
          {onRetry && (
            <button type='button' className='text-primary underline' onClick={onRetry}>
              {t('Try again')}
            </button>
          )}
        </div>
      ) : categories.length === 0 ? (
        <div className='rounded-md border p-3 text-sm text-muted-foreground'>{t('No categories yet — every product will be included.')}</div>
      ) : (
        <>
          <div className='relative'>
            <Search className='absolute top-2.5 left-2.5 size-4 text-muted-foreground' />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('Search {{n}} categories…').replace('{{n}}', String(categories.length))}
              showVoiceInput={false}
              className='h-9 pr-8 pl-8'
            />
            {search && (
              <button type='button' onClick={() => setSearch('')} className='absolute top-2.5 right-2.5' aria-label={t('Clear search')}>
                <X className='size-4 text-muted-foreground hover:text-foreground' />
              </button>
            )}
          </div>
          <div className='max-h-56 min-h-24 overflow-y-auto rounded-md border p-1' role='group' aria-label={t('Categories')}>
            {visible.map((category) => {
              const on = selected.has(category.id)
              return (
                <label
                  key={category.id}
                  className={cn('flex cursor-pointer items-center gap-2.5 rounded px-2 py-1.5 text-sm hover:bg-accent', on && 'bg-primary/5')}
                >
                  <Checkbox checked={on} onCheckedChange={() => toggle(category.id)} />
                  <span className='min-w-0 flex-1 truncate'>{category.name || t('Unnamed')}</span>
                  <span className='text-xs text-muted-foreground tabular-nums'>{category.itemCount}</span>
                </label>
              )
            })}
            {visible.length === 0 && <p className='px-2 py-4 text-center text-sm text-muted-foreground'>{t('No category matches “{{q}}”').replace('{{q}}', search)}</p>}
          </div>
          <p className='text-xs text-muted-foreground'>
            {value.length === 0
              ? t('None selected = every category.')
              : t('{{c}} categories selected · {{n}} product(s)').replace('{{c}}', String(value.length)).replace('{{n}}', String(selectedItems))}
          </p>
        </>
      )}
    </div>
  )
}

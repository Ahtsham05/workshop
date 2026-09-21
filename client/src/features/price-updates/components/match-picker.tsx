import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Loader2, Unlink } from 'lucide-react'

import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useLanguage } from '@/context/language-context'
import { cn } from '@/lib/utils'
import { useSearchProductsMutation, type CatalogEntry } from '@/stores/priceUpdate.api'

import { formatNumber } from '../lib/format'
import type { DerivedRow } from '../lib/session'

interface MatchPickerProps {
  row: DerivedRow
  onPick: (entry: CatalogEntry) => void
  onUnlink: () => void
  children: ReactNode
}

export function MatchPicker({ row, onPick, onUnlink, children }: MatchPickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align='start' className='w-[min(92vw,420px)] p-0'>
        {open && (
          <PickerBody
            row={row}
            onPick={(entry) => {
              onPick(entry)
              setOpen(false)
            }}
            onUnlink={() => {
              onUnlink()
              setOpen(false)
            }}
          />
        )}
      </PopoverContent>
    </Popover>
  )
}

function EntryLine({ entry, selected, score }: { entry: CatalogEntry; selected: boolean; score?: number }) {
  const { t } = useLanguage()
  return (
    <div className='flex w-full items-start gap-2'>
      <Check className={cn('mt-0.5 h-4 w-4 shrink-0', selected ? 'opacity-100 text-primary' : 'opacity-0')} />
      <div className='min-w-0 flex-1'>
        <div className='flex items-center justify-between gap-2'>
          <span className='truncate text-sm font-medium'>{entry.name}</span>
          {score !== undefined && <span className='shrink-0 text-[11px] text-muted-foreground'>{Math.round(score * 100)}%</span>}
        </div>
        <div className='flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground'>
          {(entry.sku || entry.barcode) && <span className='font-mono'>{entry.sku || entry.barcode}</span>}
          <span>{t('Stock')}: {formatNumber(entry.stock)}</span>
          <span>
            {formatNumber(entry.cost)} → {formatNumber(entry.price)}
          </span>
          {!entry.isActive && <span className='text-amber-600'>{t('Inactive')}</span>}
        </div>
      </div>
    </div>
  )
}

function PickerBody({ row, onPick, onUnlink }: { row: DerivedRow; onPick: (entry: CatalogEntry) => void; onUnlink: () => void }) {
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CatalogEntry[] | null>(null)
  const [search, { isLoading }] = useSearchProductsMutation()

  // The matcher's own runners-up, plus the currently linked product, before anything is typed.
  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    const list: Array<{ entry: CatalogEntry; score?: number }> = []
    if (row.entry) {
      seen.add(row.entry.id)
      list.push({ entry: row.entry, score: row.row.match.entry?.id === row.entry.id ? row.row.match.score : undefined })
    }
    row.row.match.alternatives.forEach((alt) => {
      if (!seen.has(alt.entry.id)) {
        seen.add(alt.entry.id)
        list.push({ entry: alt.entry, score: alt.score })
      }
    })
    return list
  }, [row])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults(null)
      return
    }
    const timer = setTimeout(async () => {
      try {
        const res = await search({ q, limit: 12 }).unwrap()
        setResults(res.results)
      } catch {
        setResults([])
      }
    }, 250)
    return () => clearTimeout(timer)
  }, [query, search])

  const shown = results !== null ? results.map((entry) => ({ entry, score: undefined as number | undefined })) : suggestions

  return (
    <Command shouldFilter={false}>
      <CommandInput value={query} onValueChange={setQuery} placeholder={t('Search your products…')} />
      <CommandList className='max-h-72'>
        {isLoading && (
          <div className='flex items-center gap-2 px-3 py-2 text-xs text-muted-foreground'>
            <Loader2 className='h-3.5 w-3.5 animate-spin' /> {t('Searching…')}
          </div>
        )}
        {!isLoading && shown.length === 0 && <CommandEmpty>{results !== null ? t('No product found.') : t('Type a name, SKU or barcode.')}</CommandEmpty>}
        {shown.length > 0 && (
          <CommandGroup heading={results !== null ? t('Results') : t('Suggestions')}>
            {shown.map(({ entry, score }) => (
              <CommandItem key={entry.id} value={entry.id} onSelect={() => onPick(entry)} className='items-start'>
                <EntryLine entry={entry} selected={row.entry?.id === entry.id} score={score} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {row.entry && (
          <CommandGroup>
            <CommandItem value='__unlink' onSelect={onUnlink} className='text-muted-foreground'>
              <Unlink className='mr-2 h-4 w-4' /> {t('This line is not one of my products')}
            </CommandItem>
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}

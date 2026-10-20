import { useMemo, useState } from 'react'
import { ChevronDown, Loader2, Package, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { VoiceInputButton } from '@/components/ui/voice-input-button'
import { useLanguage } from '@/context/language-context'
import { useUrduDisplay } from '@/context/urdu-display-context'
import { usePickerEnterGuard } from '@/lib/invoice-form-keyboard'
import { useFormatMoney } from '@/lib/format-money'
import { cn } from '@/lib/utils'
import { detectCurrentKeyboardLanguage } from '@/utils/keyboard-language-utils'
import { filterAndRankBySearch, getTextClasses, getUrduSecondaryNameClasses } from '@/utils/urdu-text-utils'
import { useGetPurchasableCatalogQuery, type PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

const MAX_VISIBLE = 50
const EMPTY: PurchaseCatalogItem[] = []

/** Same thresholds the invoice picker colours stock with. */
const stockClass = (qty: number) =>
  qty <= 0 ? 'text-red-600 font-medium' : qty <= 5 ? 'text-red-500 font-medium' : qty <= 20 ? 'text-amber-500' : 'text-green-600'

interface CatalogProductPickerProps {
  /** The picked row (product or real variant), or null. */
  value: PurchaseCatalogItem | null
  onChange: (item: PurchaseCatalogItem) => void
  placeholder?: string
  disabled?: boolean
  className?: string
  id?: string
}

/**
 * The New Invoice product picker as a standalone field: the branch's sellable catalog (one
 * row per product, one per real variant), ranked as you type — name, Urdu name, barcode,
 * brand — with photo, price and stock on every row; ↑/↓ + Enter to pick, voice search.
 * Reads the same cached catalog query as Invoice/Purchase, so opening it costs nothing.
 */
export function CatalogProductPicker({ value, onChange, placeholder, disabled, className, id }: CatalogProductPickerProps) {
  const { t } = useLanguage()
  const { showUrdu } = useUrduDisplay()
  const formatMoney = useFormatMoney()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const enterGuard = usePickerEnterGuard(open, query)
  const { data: catalog = EMPTY, isLoading } = useGetPurchasableCatalogQuery()

  const matches = useMemo(
    () => filterAndRankBySearch(catalog, query, (item) => [item.name, item.nameUrdu, item.barcode, item.brand?.name]),
    [catalog, query],
  )
  const visible = useMemo(() => matches.slice(0, MAX_VISIBLE), [matches])
  const label = value?.name || placeholder || t('select_product')

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        setQuery('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          id={id}
          type='button'
          variant='outline'
          role='combobox'
          aria-expanded={open}
          disabled={disabled}
          className={cn('h-10 w-full justify-between text-sm font-normal', !value && 'border-dashed', className)}
        >
          <span className='flex min-w-0 flex-1 items-center gap-2'>
            {value?.image?.url ? (
              <img src={value.image.url} alt='' className='h-6 w-6 shrink-0 rounded object-cover' />
            ) : (
              <Search className='h-3.5 w-3.5 shrink-0 text-muted-foreground' />
            )}
            <span className={getTextClasses(label, cn('truncate text-left', !value && 'text-muted-foreground'))} title={label}>
              {label}
            </span>
            {showUrdu && value?.nameUrdu?.trim() ? (
              <span dir='auto' className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(value.nameUrdu))}>
                {value.nameUrdu.trim()}
              </span>
            ) : null}
          </span>
          <ChevronDown className='h-3 w-3 shrink-0 opacity-50' />
        </Button>
      </PopoverTrigger>
      <PopoverContent className='w-[calc(100vw-2rem)] max-w-[560px] p-0' align='start' side='bottom' sideOffset={4}>
        <Command shouldFilter={false} {...enterGuard}>
          <div className='relative'>
            <CommandInput placeholder={t('search_products')} value={query} onValueChange={setQuery} />
            <div className='absolute right-2 top-1/2 z-10 -translate-y-1/2'>
              <VoiceInputButton onTranscript={setQuery} language={detectCurrentKeyboardLanguage() === 'ur' ? 'ur-PK' : 'en-US'} size='sm' />
            </div>
          </div>
          <CommandList className='max-h-[300px] overflow-y-auto'>
            {isLoading && matches.length === 0 ? (
              <div className='flex flex-col items-center gap-2 py-8 text-sm text-muted-foreground'>
                <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                {t('loading_products')}
              </div>
            ) : matches.length === 0 ? (
              <div className='py-6 text-center text-sm text-muted-foreground'>{t('no_products_found')}</div>
            ) : (
              <CommandGroup>
                {visible.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={`${item.id}-${item.name}`}
                    onSelect={() => {
                      onChange(item)
                      setOpen(false)
                      setQuery('')
                    }}
                    className='flex cursor-pointer items-center gap-2 p-3'
                  >
                    <div className='flex min-w-0 flex-1 items-center gap-3'>
                      {item.image?.url ? (
                        <img src={item.image.url} alt={item.name} className='h-8 w-8 shrink-0 rounded object-cover' />
                      ) : (
                        <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded bg-muted'>
                          <Package className='h-4 w-4 text-muted-foreground' />
                        </div>
                      )}
                      <div className='flex min-w-0 flex-1 flex-col'>
                        <div className='flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-0.5'>
                          <span className={getTextClasses(item.name, 'shrink-0 truncate text-sm font-medium')} title={item.name}>
                            {item.name}
                          </span>
                          {showUrdu && item.nameUrdu?.trim() ? (
                            <span dir='auto' className={cn('min-w-0 truncate text-xs', getUrduSecondaryNameClasses(item.nameUrdu))} title={item.nameUrdu.trim()}>
                              {item.nameUrdu.trim()}
                            </span>
                          ) : null}
                          {item.brand?.name && (
                            <Badge variant='secondary' className='shrink-0 px-1.5 py-0 text-[10px]'>
                              {item.brand.name}
                            </Badge>
                          )}
                          {(item.trackImei || item.trackSerial) && (
                            <Badge variant='outline' className='shrink-0 px-1.5 py-0 text-[10px]'>
                              {item.trackImei ? 'IMEI' : t('Serial')}
                            </Badge>
                          )}
                        </div>
                        <div className='flex items-center gap-2 text-xs text-muted-foreground'>
                          <span>{formatMoney(Number(item.price || 0))}</span>
                          <span className={stockClass(item.stockQuantity)}>Stock: {item.stockQuantity}</span>
                          {item.barcode && <span className='truncate font-mono'>{item.barcode}</span>}
                        </div>
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {matches.length > visible.length ? (
            <div className='border-t px-3 py-2 text-center text-xs text-muted-foreground'>
              {t('Showing {{shown}} of {{total}} — keep typing to narrow', { shown: visible.length, total: matches.length })}
            </div>
          ) : null}
        </Command>
      </PopoverContent>
    </Popover>
  )
}

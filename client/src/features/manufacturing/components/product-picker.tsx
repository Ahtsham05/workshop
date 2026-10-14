import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronsUpDown, Loader2, Package, Plus } from 'lucide-react'
import { useDispatch } from 'react-redux'
import {
  manufacturingApi,
  useGetManufacturingProductsQuery,
  type ManufacturingProduct,
  type ProductType,
} from '@/stores/manufacturing.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import type { AppDispatch } from '@/stores/store'
import { useFormatMoney } from '@/lib/format-money'
import { afterPaint } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { Button } from '@/components/ui/button'
import {
  Command,
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
import { UsersActionDialog } from '@/features/products/components/users-action-dialog'
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

const LIMIT = 30
const NAV_KEYS = ['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp']

const stockTone = (qty: number) =>
  qty <= 0
    ? 'text-red-600 font-medium'
    : qty <= 5
      ? 'text-red-500 font-medium'
      : qty <= 20
        ? 'text-amber-500'
        : 'text-green-600'

/**
 * Searches the branch's EXISTING product catalog (server-side, debounced), laid out like
 * the invoice's product search. The manufacturing module never keeps its own product
 * list — it only references these (and "Add product" creates a normal catalog product).
 *
 * Keyboard: type to search, ↑/↓ to move, Enter to pick. With nothing typed and nothing
 * chosen with the arrows, Enter calls `onEmptyEnter` ("done here") rather than picking
 * whatever happens to be first. Enter before the results arrive picks the best match
 * once they do (fast typing, barcode scanners).
 */
export function ProductPicker({
  value,
  onChange,
  productType,
  placeholder,
  searchPlaceholder,
  disabled,
  excludeIds = [],
  className,
  open: openProp,
  onOpenChange,
  onEmptyEnter,
  createAs,
  icon,
  id,
  'data-field': dataField,
}: {
  value?: { id: string; name: string } | null
  onChange: (product: PickedProduct) => void
  /** One type, or a comma list (may include 'unclassified'). */
  productType?: string
  placeholder?: string
  searchPlaceholder?: string
  disabled?: boolean
  excludeIds?: string[]
  className?: string
  /** Control the list from outside, e.g. open it when an Enter-key chain arrives here. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Enter with nothing typed or chosen — "done here, move on". */
  onEmptyEnter?: () => void
  /** Offer "Add product" when nothing matches; the new product starts as this type. */
  createAs?: ProductType
  /** Shown before the name in the trigger. */
  icon?: ReactNode
  /** On the trigger, e.g. so an Enter-key chain can focus it. */
  id?: string
  'data-field'?: string
}) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const dispatch = useDispatch<AppDispatch>()
  const { hasPermission } = usePermissions()
  const canCreate = !!createAs && hasPermission('createProducts')

  const [openState, setOpenState] = useState(false)
  const open = openProp ?? openState
  const [search, setSearch] = useState('')
  const searchRef = useRef('')
  // The highlighted row (cmdk value = product id). Nothing is highlighted on an empty
  // search until the person moves with the arrows or the mouse.
  const [active, setActive] = useState('')
  const navigated = useRef(false)
  const [showHighlight, setShowHighlight] = useState(false)
  const markNavigated = () => {
    navigated.current = true
    if (!showHighlight) setShowHighlight(true)
  }
  // Enter pressed before the search caught up: pick the best match once results arrive.
  const pendingEnter = useRef(false)
  // The caller moved focus on (e.g. to the row's Qty) — don't let the closing list pull
  // it back to the trigger, or the next keystrokes land in the wrong place.
  const focusMovedOn = useRef(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)

  const [creating, setCreating] = useState<string | null>(null)
  const created = useRef<PickedProduct | null>(null)

  const updateSearch = (next: string) => {
    searchRef.current = next
    pendingEnter.current = false
    navigated.current = false
    setShowHighlight(false)
    if (!next.trim()) setActive('')
    setSearch(next)
  }
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next)
    onOpenChange?.(next)
    if (!next) updateSearch('')
  }

  const debounced = useDebouncedValue(search, 250)
  const { data, isFetching } = useGetManufacturingProductsQuery(
    { search: debounced.trim() || undefined, productType, limit: LIMIT },
    { skip: !open }
  )
  const options = (data?.results || []).filter(
    (p) => !excludeIds.includes(p.id)
  )
  const settled = !isFetching && debounced === search
  const showCreate =
    canCreate && settled && !!search.trim() && options.length === 0

  const handOff = (action: () => void) => {
    action()
    const now = document.activeElement
    focusMovedOn.current =
      !!now && now !== document.body && !contentRef.current?.contains(now)
    setOpen(false)
  }
  const pick = (product: PickedProduct) => {
    pendingEnter.current = false
    handOff(() => onChange(product))
  }
  const startCreate = () => {
    pendingEnter.current = false
    const name = searchRef.current.trim()
    setOpen(false)
    setCreating(name)
  }
  const bestMatch = () => {
    const q = searchRef.current.trim().toLowerCase()
    return (
      options.find(
        (p) =>
          (p.sku && p.sku.toLowerCase() === q) ||
          (p.barcode && p.barcode.toLowerCase() === q)
      ) ||
      options.find((p) => p.id === active) ||
      options[0]
    )
  }

  useEffect(() => {
    if (!pendingEnter.current || !settled) return
    pendingEnter.current = false
    const match = bestMatch()
    if (match) pick(match)
    else if (canCreate && searchRef.current.trim()) startCreate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, data])

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (NAV_KEYS.includes(e.key)) {
      // First move on an empty search starts from the top (or bottom), not from the
      // row cmdk quietly pre-selected.
      if (!navigated.current && !search.trim() && options.length) {
        e.preventDefault()
        e.stopPropagation()
        const up = e.key === 'ArrowUp' || e.key === 'End' || e.key === 'PageUp'
        setActive(options[up ? options.length - 1 : 0].id)
      }
      markNavigated()
      return
    }
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
    // Enter is handled here, not by cmdk, so it always does the one right thing.
    e.preventDefault()
    e.stopPropagation()
    if (!search.trim()) {
      const chosen = navigated.current
        ? options.find((p) => p.id === active)
        : undefined
      if (chosen) pick(chosen)
      else if (onEmptyEnter) handOff(onEmptyEnter)
      return
    }
    if (!settled) {
      pendingEnter.current = true
      return
    }
    const match = bestMatch()
    if (match) pick(match)
    else if (showCreate) startCreate()
  }

  // Typing on the closed trigger opens the search with that first letter.
  const onTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (
      e.key.length !== 1 ||
      e.key === ' ' ||
      e.ctrlKey ||
      e.metaKey ||
      e.altKey
    )
      return
    e.preventDefault()
    updateSearch(e.key)
    setOpen(true)
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type='button'
            variant='outline'
            role='combobox'
            id={id}
            disabled={disabled}
            data-field={dataField}
            onKeyDown={onTriggerKeyDown}
            className={cn(
              'w-full justify-between font-normal',
              !value && 'text-muted-foreground',
              className
            )}
          >
            <span className='flex min-w-0 items-center gap-2'>
              {icon}
              <span className='truncate'>
                {value ? value.name : placeholder || t('Select product…')}
              </span>
            </span>
            <ChevronsUpDown className='ml-2 h-4 w-4 shrink-0 opacity-50' />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          ref={contentRef}
          className='w-[calc(100vw-2rem)] max-w-[560px] p-0'
          align='start'
          side='bottom'
          sideOffset={4}
          onCloseAutoFocus={(e) => {
            if (!focusMovedOn.current) return
            focusMovedOn.current = false
            e.preventDefault()
          }}
          onOpenAutoFocus={(e) => {
            // Caret after a letter typed on the trigger, not before it.
            e.preventDefault()
            const el = inputRef.current
            el?.focus()
            el?.setSelectionRange(el.value.length, el.value.length)
          }}
        >
          <Command
            shouldFilter={false}
            value={active}
            onValueChange={(v) => {
              if (searchRef.current.trim() || navigated.current) setActive(v)
            }}
          >
            <CommandInput
              ref={inputRef}
              placeholder={
                searchPlaceholder || t('Search name, SKU or barcode…')
              }
              value={search}
              onValueChange={updateSearch}
              onKeyDown={onSearchKeyDown}
            />
            <CommandList
              className='max-h-[300px] overflow-y-auto'
              onPointerMoveCapture={markNavigated}
            >
              {!data && isFetching ? (
                <div className='text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm'>
                  <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                  {t('Loading products…')}
                </div>
              ) : options.length === 0 ? (
                <div className='flex flex-col items-center gap-3 px-4 py-6 text-center'>
                  <p className='text-muted-foreground text-sm'>
                    {settled ? t('No products found.') : t('Searching…')}
                  </p>
                  {showCreate && (
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='max-w-full gap-2'
                      onClick={startCreate}
                    >
                      <Plus className='h-4 w-4 shrink-0' />
                      <span className='truncate'>
                        {t('Add product')} “{search.trim()}”
                      </span>
                    </Button>
                  )}
                </div>
              ) : (
                <CommandGroup>
                  {options.map((product) => {
                    const meta = product.productType
                      ? PRODUCT_TYPE_META[product.productType]
                      : null
                    return (
                      <CommandItem
                        key={product.id}
                        value={product.id}
                        onSelect={() => pick(product)}
                        className={cn(
                          'flex cursor-pointer items-center gap-3 p-2.5',
                          // Nothing chosen yet on an empty search: no row looks picked.
                          !search.trim() &&
                            !showHighlight &&
                            'data-[selected=true]:text-foreground data-[selected=true]:bg-transparent'
                        )}
                      >
                        {product.image?.url ? (
                          <img
                            src={product.image.url}
                            alt=''
                            className='h-8 w-8 shrink-0 rounded object-cover'
                          />
                        ) : (
                          <div className='bg-muted flex h-8 w-8 shrink-0 items-center justify-center rounded'>
                            <Package className='text-muted-foreground h-4 w-4' />
                          </div>
                        )}
                        <div className='flex min-w-0 flex-1 flex-col'>
                          <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5'>
                            <span
                              className='truncate text-sm font-medium'
                              title={product.name}
                            >
                              {product.name}
                            </span>
                            {meta && (
                              <span
                                className={cn(
                                  'shrink-0 rounded border px-1.5 py-px text-[10px] font-medium',
                                  meta.className
                                )}
                              >
                                {t(meta.label)}
                              </span>
                            )}
                            {product.defaultBomId && (
                              <span className='text-muted-foreground shrink-0 rounded border px-1.5 py-px text-[10px]'>
                                {t('Has BOM')}
                              </span>
                            )}
                          </div>
                          <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs'>
                            {product.sku && <span>{product.sku}</span>}
                            <span className={stockTone(product.stockQuantity)}>
                              {t('Stock')}: {fmtQty(product.stockQuantity)}{' '}
                              {product.unit}
                            </span>
                            {product.cost > 0 && (
                              <span className='text-amber-600 dark:text-amber-400'>
                                {t('Cost')}: {formatMoney(product.cost)}
                              </span>
                            )}
                          </div>
                        </div>
                        {value?.id === product.id && (
                          <Check className='text-primary h-4 w-4 shrink-0' />
                        )}
                      </CommandItem>
                    )
                  })}
                </CommandGroup>
              )}
            </CommandList>
            <div className='text-muted-foreground flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]'>
              <span>
                {data && data.totalResults > options.length
                  ? `${options.length} ${t('of')} ${data.totalResults} · ${t('type to narrow')}`
                  : `${options.length} ${t('products')}`}
              </span>
              <span className='max-sm:hidden'>
                ↑↓ {t('move')} · Enter {t('pick')} · Esc {t('close')}
              </span>
            </div>
          </Command>
        </PopoverContent>
      </Popover>

      {creating !== null && (
        <UsersActionDialog
          open
          defaultName={creating}
          defaultProductType={createAs}
          onCreated={(p) => {
            created.current = {
              id: String(p?.id || p?._id),
              name: p?.name || creating,
              sku: p?.sku,
              unit: p?.unit || 'pcs',
              productType: p?.productType ?? createAs ?? null,
              stockQuantity: Number(p?.stockQuantity) || 0,
              defaultBomId: null,
              cost: Number(p?.cost) || 0,
            }
            dispatch(
              manufacturingApi.util.invalidateTags([
                'MfgProduct',
                'MfgDashboard',
              ])
            )
            dispatch(
              purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog'])
            )
          }}
          onOpenChange={(o) => {
            if (o) return
            setCreating(null)
            const product = created.current
            created.current = null
            // After the product dialog has handed focus back.
            if (product) afterPaint(() => onChange(product))
          }}
        />
      )}
    </>
  )
}

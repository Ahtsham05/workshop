import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  Check,
  ChevronsUpDown,
  Loader2,
  Package,
  Plus,
  RotateCw,
} from 'lucide-react'
import { useDispatch } from 'react-redux'
import {
  manufacturingApi,
  type ManufacturingProduct,
  type ProductType,
} from '@/stores/manufacturing.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import type { AppDispatch } from '@/stores/store'
import { useFormatMoney } from '@/features/manufacturing/lib/use-mfg-money'
import { afterPaint } from '@/lib/invoice-form-keyboard'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
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
import {
  highlightParts,
  searchCatalog,
  useCatalogProducts,
} from '../lib/product-catalog'

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

// Rows drawn at once — the whole catalog is searched, only the best this many are shown.
const RENDER_LIMIT = 60
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
 * Searches the branch's EXISTING product catalog, laid out like the invoice's product
 * search. The catalog is fetched once and cached (lib/product-catalog.ts) — every picker
 * on every manufacturing screen shares it, and typing searches it in memory, so no
 * request is sent per keystroke or per open. The manufacturing module never keeps its
 * own product list ("Add product" creates a normal catalog product).
 *
 * Keyboard: type to search, ↑/↓ to move, Enter to pick. With nothing typed and nothing
 * chosen with the arrows, Enter calls `onEmptyEnter` ("done here") rather than picking
 * whatever happens to be first. Enter before the catalog's first load picks the best
 * match once it arrives (fast typing, barcode scanners). When only near-spellings match,
 * the first Enter highlights the top suggestion and a second one picks it — a typo never
 * silently picks a different product.
 */
export function ProductPicker({
  value,
  onChange,
  productType,
  packRole,
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
  /** Packing role filter — see ManufacturingProductFilters.packRole. */
  packRole?: 'make' | 'pack' | 'packs'
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

  // Mounted = prefetched: the list is ready before the person opens it.
  const catalog = useCatalogProducts({ productType, packRole })
  const excludeKey = excludeIds.join(',')
  const candidates = useMemo(() => {
    if (!excludeKey) return catalog.products
    const excluded = new Set(excludeKey.split(','))
    return catalog.products.filter((p) => !excluded.has(p.id))
  }, [catalog.products, excludeKey])
  // Only an open list is searched — a BOM's many row pickers cost nothing while closed.
  const result = useMemo(
    () =>
      open
        ? searchCatalog(candidates, search, RENDER_LIMIT)
        : { items: [], total: 0, fuzzy: false },
    [open, candidates, search]
  )
  const options = result.items
  const settled = !!catalog.data
  const showCreate =
    canCreate && settled && !!search.trim() && (!options.length || result.fuzzy)

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
  // Ranked best-first, so the top row is the exact SKU / barcode / name match if any.
  const bestMatch = () =>
    (navigated.current && options.find((p) => p.id === active)) || options[0]
  // Near-spellings only: the first Enter shows which product it would take.
  const enterOnMatches = () => {
    if (result.fuzzy && !navigated.current) {
      if (options[0]) setActive(options[0].id)
      markNavigated()
      return
    }
    const match = bestMatch()
    if (match) pick(match)
    else if (showCreate) startCreate()
  }

  // While typing, the highlighted row is the top-ranked one (what Enter takes) — cmdk
  // would otherwise keep a row from the previous search highlighted.
  useEffect(() => {
    if (navigated.current || !searchRef.current.trim()) return
    setActive(result.fuzzy ? '' : (options[0]?.id ?? ''))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result])

  useEffect(() => {
    if (!pendingEnter.current || !settled) return
    pendingEnter.current = false
    enterOnMatches()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled])

  const onSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (NAV_KEYS.includes(e.key)) {
      // First move on an empty search (or among near-spellings) starts from the top (or
      // bottom), not from the row cmdk quietly pre-selected.
      if (
        !navigated.current &&
        (!search.trim() || result.fuzzy) &&
        options.length
      ) {
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
    enterOnMatches()
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
              {!settled && catalog.isError ? (
                <div className='flex flex-col items-center gap-3 px-4 py-6 text-center'>
                  <p className='text-muted-foreground text-sm'>
                    {t('Could not load products.')}
                  </p>
                  <Button
                    type='button'
                    variant='outline'
                    size='sm'
                    className='gap-2'
                    onClick={() => void catalog.refetch()}
                  >
                    <RotateCw className='h-4 w-4' />
                    {t('Retry')}
                  </Button>
                </div>
              ) : !settled ? (
                <div className='text-muted-foreground flex flex-col items-center gap-2 py-8 text-sm'>
                  <Loader2 className='h-6 w-6 animate-spin' aria-hidden />
                  {t('Loading products…')}
                </div>
              ) : options.length === 0 ? (
                <div className='flex flex-col items-center gap-3 px-4 py-6 text-center'>
                  <p className='text-muted-foreground text-sm'>
                    {search.trim()
                      ? t('No products found.')
                      : t('No products yet.')}
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
                <CommandGroup
                  heading={
                    result.fuzzy
                      ? `${t('No exact match')} — ${t('did you mean')}…`
                      : undefined
                  }
                >
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
                          // Nothing chosen yet on an empty search (or among mere
                          // near-spellings): no row looks picked.
                          (!search.trim() || result.fuzzy) &&
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
                              {highlightParts(product.name, search).map(
                                (part, i) =>
                                  part.match ? (
                                    <mark
                                      key={i}
                                      className='text-primary rounded-sm bg-transparent font-semibold'
                                    >
                                      {part.text}
                                    </mark>
                                  ) : (
                                    part.text
                                  )
                              )}
                            </span>
                            {product.isActive === false && (
                              <span className='text-muted-foreground shrink-0 rounded border border-dashed px-1.5 py-px text-[10px]'>
                                {t('Inactive')}
                              </span>
                            )}
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
                            {product.packOf && (
                              <span
                                className='shrink-0 rounded border border-sky-500/40 px-1.5 py-px text-[10px] text-sky-700 dark:text-sky-300'
                                title={`${t('Packed from')} ${product.packOf.productName}`}
                              >
                                {t('Pack')} · {fmtQty(product.packOf.contentQuantity)}{' '}
                                {product.packOf.contentUnit}
                              </span>
                            )}
                            {!!product.packSizeCount && (
                              <span className='shrink-0 rounded border border-violet-500/40 px-1.5 py-px text-[10px] text-violet-700 dark:text-violet-300'>
                                {product.packSizeCount} {t('pack sizes')}
                              </span>
                            )}
                          </div>
                          <div className='text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs'>
                            {product.sku && <span>{product.sku}</span>}
                            {product.barcode &&
                              product.barcode !== product.sku && (
                                <span>{product.barcode}</span>
                              )}
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
              {showCreate && options.length > 0 && (
                <div className='border-t p-1.5'>
                  <Button
                    type='button'
                    variant='ghost'
                    size='sm'
                    className='w-full justify-start gap-2'
                    onClick={startCreate}
                  >
                    <Plus className='h-4 w-4 shrink-0' />
                    <span className='truncate'>
                      {t('Add product')} “{search.trim()}”
                    </span>
                  </Button>
                </div>
              )}
            </CommandList>
            <div className='text-muted-foreground flex items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]'>
              <span>
                {result.total > options.length
                  ? `${options.length} ${t('of')} ${result.total.toLocaleString()} · ${t('type to narrow')}`
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

import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { LayoutGrid, List, Package, Plus, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'

type ViewMode = 'grid' | 'list'
const VIEW_MODE_KEY = 'fastBillingCatalogViewMode'

function getInitialViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_KEY)
  return stored === 'list' ? 'list' : 'grid'
}

type CategoryGroup = {
  id: string
  name: string
  products: PurchaseCatalogItem[]
}

function groupByCategory(products: PurchaseCatalogItem[]): CategoryGroup[] {
  const map = new Map<string, CategoryGroup>()
  for (const product of products) {
    const first = product.categories?.[0]
    const id = first?._id || product.category || 'other'
    const name = first?.name || product.category || 'Other'
    if (!map.has(id)) map.set(id, { id, name, products: [] })
    map.get(id)!.products.push(product)
  }
  return Array.from(map.values())
}

type Props = {
  products: PurchaseCatalogItem[]
  searchTerm: string
  onSearchTermChange: (v: string) => void
  onRequestAdd: (item: PurchaseCatalogItem) => void
  className?: string
}

export function ProductQuickGrid({ products, searchTerm, onSearchTermChange, onRequestAdd, className }: Props) {
  const [localSearch, setLocalSearch] = useState(searchTerm)
  const [selectedCategoryId, setSelectedCategoryId] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>(getInitialViewMode)

  useEffect(() => {
    localStorage.setItem(VIEW_MODE_KEY, viewMode)
  }, [viewMode])

  useEffect(() => {
    setLocalSearch(searchTerm)
  }, [searchTerm])

  const categories = useMemo(() => groupByCategory(products), [products])

  useEffect(() => {
    if (categories.length === 0) return
    setSelectedCategoryId((prev) => (prev && categories.some((c) => c.id === prev) ? prev : categories[0]!.id))
  }, [categories])

  const q = (searchTerm || localSearch).trim().toLowerCase()

  const filtered = useMemo(() => {
    if (q) {
      return products
        .filter(
          (p) =>
            p.name?.toLowerCase().includes(q) ||
            p.nameUrdu?.toLowerCase().includes(q) ||
            p.barcode?.toLowerCase().includes(q),
        )
        .slice(0, 150)
    }
    const cat = categories.find((c) => c.id === selectedCategoryId)
    return (cat ? cat.products : products).slice(0, 150)
  }, [products, q, categories, selectedCategoryId])

  return (
    <Card
      className={cn(
        'flex min-w-0 flex-col overflow-hidden border-border/60 py-0 shadow-md',
        'h-[min(680px,calc(100vh-330px))]',
        className,
      )}
    >
      <CardHeader className='shrink-0 gap-2 border-b border-border/60 bg-muted/20 px-4 py-3'>
        <CardTitle className='flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight'>
          <span className='flex items-center gap-2'>
            <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <Package className='h-4 w-4' />
            </span>
            Products
          </span>
          <Badge variant='secondary' className='font-normal'>
            {filtered.length} shown
          </Badge>
          <div className='ml-auto flex items-center gap-0.5 rounded-md border border-border/70 bg-background p-0.5'>
            <Button
              type='button'
              size='icon'
              variant={viewMode === 'grid' ? 'default' : 'ghost'}
              className='h-7 w-7'
              onClick={() => setViewMode('grid')}
              title='Grid view'
            >
              <LayoutGrid className='h-3.5 w-3.5' />
            </Button>
            <Button
              type='button'
              size='icon'
              variant={viewMode === 'list' ? 'default' : 'ghost'}
              className='h-7 w-7'
              onClick={() => setViewMode('list')}
              title='List view'
            >
              <List className='h-3.5 w-3.5' />
            </Button>
          </div>
        </CardTitle>
        <div className='relative'>
          <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            placeholder='Search by name or barcode…'
            value={localSearch}
            onChange={(e) => {
              setLocalSearch(e.target.value)
              onSearchTermChange(e.target.value)
            }}
            className='h-9 pl-9 shadow-none'
          />
        </div>
        {!q && categories.length > 1 && (
          <div className='flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {categories.map((c) => (
              <button
                key={c.id}
                type='button'
                onClick={() => setSelectedCategoryId(c.id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  selectedCategoryId === c.id
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/80 bg-background text-foreground hover:bg-muted/80',
                )}
              >
                <span className='max-w-[120px] truncate'>{c.name}</span>
                <span className='ml-1.5 tabular-nums opacity-80'>{c.products.length}</span>
              </button>
            ))}
          </div>
        )}
      </CardHeader>
      <CardContent className='flex min-h-0 flex-1 flex-col p-3 sm:p-4'>
        <ScrollArea type='always' className='min-h-0 flex-1 pr-2'>
          {filtered.length === 0 ? (
            <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center text-muted-foreground'>
              <Package className='mb-2 h-10 w-10 opacity-35' />
              <p className='text-sm'>No products match your search.</p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className='grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4'>
              {filtered.map((product) => {
                const disabled = product.stockQuantity <= 0
                const priceStr = product.price.toLocaleString(undefined, { style: 'currency', currency: 'PKR' })
                return (
                  <button
                    key={product.id}
                    type='button'
                    disabled={disabled}
                    onClick={() => onRequestAdd(product)}
                    className={cn(
                      'group relative overflow-hidden rounded-xl border border-border/70 bg-card text-left shadow-sm ring-1 ring-black/[0.04] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.97] dark:ring-white/10',
                      disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-primary/40 hover:shadow-lg',
                    )}
                  >
                    <div className={cn('relative aspect-[4/3] w-full overflow-hidden bg-muted', disabled && 'grayscale')}>
                      {product.image?.url ? (
                        <img
                          src={product.image.url}
                          alt=''
                          loading='lazy'
                          decoding='async'
                          className='h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]'
                        />
                      ) : (
                        <div className='flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/10 via-muted to-muted/70'>
                          <Package className='h-7 w-7 text-muted-foreground/45' />
                        </div>
                      )}
                      {!disabled && product.stockQuantity <= 5 && (
                        <Badge variant='destructive' className='absolute right-1.5 top-1.5 z-10 px-1.5 py-0 text-[10px] shadow-sm'>
                          Low stock
                        </Badge>
                      )}
                      {disabled && (
                        <Badge variant='secondary' className='absolute right-1.5 top-1.5 z-10 px-1.5 py-0 text-[10px] shadow-sm'>
                          Out
                        </Badge>
                      )}
                      <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pb-2 pt-10'>
                        <p className='line-clamp-2 text-[13px] font-semibold leading-tight text-white'>{product.name}</p>
                        <p className='mt-0.5 text-xs font-bold tabular-nums text-white'>{priceStr}</p>
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className='overflow-hidden rounded-lg border border-border/70'>
              <div className='grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 border-b border-border/70 bg-muted/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                <span>Product</span>
                <span className='w-16 text-right'>Stock</span>
                <span className='w-20 text-right'>Price</span>
                <span className='w-9' />
              </div>
              <ul className='divide-y divide-border/60'>
                {filtered.map((product, idx) => {
                  const disabled = product.stockQuantity <= 0
                  const lowStock = !disabled && product.stockQuantity <= 5
                  return (
                    <li
                      key={product.id}
                      className={cn(
                        'grid cursor-pointer grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-3 px-3 py-2 text-sm transition-colors',
                        disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-primary/5',
                        idx % 2 === 1 && !disabled && 'bg-muted/15',
                      )}
                      onClick={() => !disabled && onRequestAdd(product)}
                    >
                      <div className='flex min-w-0 items-center gap-2.5'>
                        <div className='flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted'>
                          {product.image?.url ? (
                            <img src={product.image.url} alt='' className='h-full w-full object-cover' />
                          ) : (
                            <Package className='h-4 w-4 text-muted-foreground/50' />
                          )}
                        </div>
                        <div className='min-w-0'>
                          <p className='truncate font-medium leading-tight'>{product.name}</p>
                          <p className='truncate text-xs text-muted-foreground'>
                            {product.barcode || product.unit || '—'}
                          </p>
                        </div>
                      </div>
                      <span
                        className={cn(
                          'w-16 text-right text-xs font-medium tabular-nums',
                          disabled ? 'text-destructive' : lowStock ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
                        )}
                      >
                        {disabled ? 'Out' : product.stockQuantity}
                      </span>
                      <span className='w-20 text-right font-semibold tabular-nums'>Rs{product.price.toFixed(0)}</span>
                      <Button
                        type='button'
                        size='icon'
                        variant='outline'
                        disabled={disabled}
                        className='h-8 w-8 shrink-0'
                        onClick={(e) => {
                          e.stopPropagation()
                          onRequestAdd(product)
                        }}
                      >
                        <Plus className='h-3.5 w-3.5' />
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

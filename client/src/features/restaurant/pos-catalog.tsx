import { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Package, Image as ImageIcon, List, UtensilsCrossed } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export type PosProduct = {
  id?: string
  _id?: string
  name: string
  price: number
  /** When omitted, item is treated as available */
  stockQuantity?: number
  image?: { url?: string; publicId?: string }
  category?: { _id: string; name: string; image?: { url?: string } }
  categories?: { _id: string; name: string; image?: { url?: string } }[]
  barcode?: string
  description?: string
}

/** Best-effort image URL from product or nested category artwork */
export function resolvePosProductImageUrl(product: PosProduct): string | undefined {
  const u = product.image?.url?.trim()
  if (u) return u
  const catImg = product.category && 'image' in product.category ? product.category.image?.url?.trim() : undefined
  if (catImg) return catImg
  const nested = product.categories?.find((c) => c.image?.url?.trim())?.image?.url?.trim()
  return nested || undefined
}

export type PosCategory = {
  _id: string
  name: string
  products: PosProduct[]
}

function groupProductsByCategory(products: PosProduct[]): PosCategory[] {
  const categoryMap = new Map<string, PosCategory>()
  products.forEach((product) => {
    let categoryId = 'other'
    let categoryName = 'Other'
    if (product.category) {
      categoryId = product.category._id
      categoryName = product.category.name
    } else if (product.categories && product.categories.length > 0) {
      categoryId = product.categories[0]._id
      categoryName = product.categories[0].name
    }
    if (!categoryMap.has(categoryId)) {
      categoryMap.set(categoryId, {
        _id: categoryId,
        name: categoryName,
        products: [],
      })
    }
    categoryMap.get(categoryId)!.products.push(product)
  })
  return Array.from(categoryMap.values())
}

export function PosMenuCatalog({
  products,
  onPickProduct,
}: {
  products: PosProduct[] | null | undefined
  onPickProduct: (product: PosProduct) => void
}) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('')
  const [showImages, setShowImages] = useState(true)

  const categorizedProducts = useMemo(
    () => (products?.length ? groupProductsByCategory(products) : []),
    [products],
  )

  const allCategories = useMemo(
    () => categorizedProducts.filter((c) => c.products.length > 0),
    [categorizedProducts],
  )

  useEffect(() => {
    if (allCategories.length === 0) return
    setSelectedCategoryId((prev) => {
      if (prev && allCategories.some((c) => c._id === prev)) return prev
      const other = allCategories.find((c) => c.name?.toLowerCase() === 'other')
      return other ? other._id : allCategories[0]!._id
    })
  }, [allCategories])

  const filteredCategories = useMemo(() => {
    if (!categorizedProducts.length) return []
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      return categorizedProducts
        .map((category) => ({
          ...category,
          products: category.products.filter(
            (product) =>
              (product.name?.toLowerCase() || '').includes(q) ||
              (product.barcode?.toLowerCase() || '').includes(q) ||
              (product.description?.toLowerCase() || '').includes(q),
          ),
        }))
        .filter((category) => category.products.length > 0)
    }
    if (selectedCategoryId) {
      return categorizedProducts.filter((c) => c._id === selectedCategoryId)
    }
    return categorizedProducts
  }, [categorizedProducts, searchTerm, selectedCategoryId])

  const handleCardClick = (product: PosProduct) => {
    const sq = product.stockQuantity
    if (sq !== undefined && sq <= 0) {
      toast.error(`${product.name} is out of stock`)
      return
    }
    onPickProduct(product)
  }

  const totalShown = filteredCategories.reduce((n, c) => n + c.products.length, 0)

  return (
    <Card className='min-w-0 xl:col-span-7 overflow-hidden border-border/60 shadow-md'>
      <CardHeader className='border-b border-border/60 bg-muted/20 px-4 py-3'>
        <CardTitle className='flex flex-wrap items-center gap-2 text-base font-semibold tracking-tight'>
          <span className='flex items-center gap-2'>
            <span className='flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary'>
              <UtensilsCrossed className='h-4 w-4' />
            </span>
            Menu
          </span>
          <Badge variant='secondary' className='font-normal'>
            {totalShown} items
          </Badge>
        </CardTitle>
        <p className='text-xs text-muted-foreground'>
          Tap to add · Search works across name, barcode, and description
        </p>
      </CardHeader>
      <CardContent className='space-y-3 p-3 sm:p-4'>
        <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
          <div className='relative min-w-0 flex-1'>
            <Search className='absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
            <Input
              type='search'
              placeholder='Search dishes or barcode…'
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className='h-9 border-border/80 bg-background pl-9 shadow-none'
            />
          </div>
          <div className='flex shrink-0 items-center gap-2 rounded-lg border border-border/80 bg-muted/30 px-2.5 py-1.5'>
            <Switch id='pos-show-images' checked={showImages} onCheckedChange={setShowImages} />
            <Label htmlFor='pos-show-images' className='flex cursor-pointer items-center gap-1.5 text-xs font-medium'>
              {showImages ? <ImageIcon className='h-3.5 w-3.5' /> : <List className='h-3.5 w-3.5' />}
              {showImages ? 'Photos' : 'List'}
            </Label>
          </div>
        </div>

        <div className='space-y-1.5'>
          <Label className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
            Categories
          </Label>
          <div className='flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden'>
            {allCategories.map((category) => (
              <button
                key={category._id}
                type='button'
                onClick={() => setSelectedCategoryId(category._id)}
                className={cn(
                  'shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  selectedCategoryId === category._id && !searchTerm.trim()
                    ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                    : 'border-border/80 bg-background text-foreground hover:bg-muted/80',
                )}
              >
                <span className='max-w-[140px] truncate'>{category.name}</span>
                <span
                  className={cn(
                    'ml-1.5 tabular-nums opacity-80',
                    selectedCategoryId === category._id && !searchTerm.trim()
                      ? 'text-primary-foreground/90'
                      : 'text-muted-foreground',
                  )}
                >
                  {category.products.length}
                </span>
              </button>
            ))}
          </div>
        </div>

        <ScrollArea
          type='always'
          className='h-[min(560px,calc(100vh-240px))] rounded-lg border border-border/60 bg-muted/15 pr-2 shadow-inner'
        >
          <div className='space-y-5 pb-1'>
            {filteredCategories.length === 0 ? (
              <div className='flex flex-col items-center justify-center rounded-xl border border-dashed py-14 text-center text-muted-foreground'>
                <Package className='mb-2 h-10 w-10 opacity-35' />
                <p className='text-sm'>
                  {searchTerm.trim() ? 'No dishes match your search.' : 'No products in this branch.'}
                </p>
              </div>
            ) : (
              filteredCategories.map((category) => (
                <div key={category._id} className='space-y-2'>
                  <div className='flex items-baseline gap-2'>
                    <h3 className='text-sm font-semibold tracking-tight'>{category.name}</h3>
                    <span className='text-xs text-muted-foreground tabular-nums'>
                      {category.products.length} items
                    </span>
                  </div>
                  <div
                    className={
                      showImages
                        ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4'
                        : 'space-y-1.5'
                    }
                  >
                    {category.products.map((product) => {
                      const pid = product.id || product._id || product.name
                      const sq = product.stockQuantity
                      const disabled = sq !== undefined && sq <= 0
                      const imgUrl = resolvePosProductImageUrl(product)
                      const priceStr = product.price.toLocaleString(undefined, {
                        style: 'currency',
                        currency: 'PKR',
                      })
                      return (
                        <button
                          key={pid}
                          type='button'
                          disabled={disabled}
                          onClick={() => handleCardClick(product)}
                          className={cn(
                            'group text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            showImages
                              ? 'relative overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm ring-1 ring-black/[0.04] dark:ring-white/10'
                              : 'flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card p-2.5 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/5',
                            disabled
                              ? 'cursor-not-allowed opacity-55'
                              : 'hover:border-primary/35 hover:shadow-md',
                          )}
                        >
                          {showImages ? (
                            <>
                              <div
                                className={cn(
                                  'relative aspect-[4/3] w-full overflow-hidden bg-muted',
                                  disabled && 'grayscale',
                                )}
                              >
                                {imgUrl ? (
                                  <img
                                    src={imgUrl}
                                    alt=''
                                    loading='lazy'
                                    decoding='async'
                                    className='h-full w-full object-cover transition duration-300 group-hover:scale-[1.03]'
                                  />
                                ) : (
                                  <div className='flex h-full w-full flex-col items-center justify-center gap-1 bg-gradient-to-br from-muted via-muted/90 to-muted/70'>
                                    <UtensilsCrossed className='h-7 w-7 text-muted-foreground/45' />
                                    <span className='px-2 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70'>
                                      No photo
                                    </span>
                                  </div>
                                )}
                                {sq !== undefined && sq <= 5 && sq > 0 && (
                                  <Badge
                                    variant='destructive'
                                    className='absolute right-1.5 top-1.5 z-10 px-1.5 py-0 text-[10px] shadow-sm'
                                  >
                                    Low stock
                                  </Badge>
                                )}
                                {disabled && (
                                  <Badge
                                    variant='secondary'
                                    className='absolute right-1.5 top-1.5 z-10 px-1.5 py-0 text-[10px] shadow-sm'
                                  >
                                    Out
                                  </Badge>
                                )}
                                <div className='absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-2 pb-2 pt-10'>
                                  <p className='line-clamp-2 text-[13px] font-semibold leading-tight text-white'>
                                    {product.name}
                                  </p>
                                  <p className='mt-0.5 text-xs font-medium tabular-nums text-white/95'>
                                    {priceStr}
                                  </p>
                                </div>
                              </div>
                            </>
                          ) : (
                            <>
                              {imgUrl ? (
                                <div className='relative h-11 w-11 shrink-0 overflow-hidden rounded-md ring-1 ring-border/60'>
                                  <img
                                    src={imgUrl}
                                    alt=''
                                    loading='lazy'
                                    className='h-full w-full object-cover'
                                  />
                                </div>
                              ) : (
                                <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-muted text-[11px] font-semibold uppercase text-muted-foreground'>
                                  {(product.name.slice(0, 2) || '·').replace(/\s/g, '')}
                                </div>
                              )}
                              <div className='min-w-0 flex-1'>
                                <p className='truncate text-sm font-medium leading-tight'>{product.name}</p>
                                <div className='mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground'>
                                  <span className='font-semibold tabular-nums text-foreground'>
                                    {priceStr}
                                  </span>
                                  {product.stockQuantity !== undefined && (
                                    <span>Stock {product.stockQuantity}</span>
                                  )}
                                </div>
                              </div>
                            </>
                          )}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  )
}

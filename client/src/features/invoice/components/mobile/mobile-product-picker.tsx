import { useState } from 'react'
import { Camera, ImagePlus, Loader2, Plus, ScanBarcode, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MobileCameraScanner } from '@/components/mobile-camera-scanner'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useFormatMoney } from '@/lib/format-money'
import { getTextClasses } from '@/utils/urdu-text-utils'
import type { PurchaseCatalogItem } from '@/stores/purchaseCatalog.api'
import { MobileScreen } from './mobile-screen'

interface MobileProductPickerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  query: string
  onQueryChange: (query: string) => void
  products: PurchaseCatalogItem[]
  totalMatches: number
  /** The whole sellable catalog — barcode scans look the code up here, not just in the visible page. */
  catalog: PurchaseCatalogItem[]
  loading: boolean
  showUrdu: boolean
  /** Stock in the invoice's warehouse (multi-warehouse orgs), or null when not tracked. */
  warehouseQtyOf?: (productId: string, variantId?: string) => number | null
  warehouseName?: string
  onPick: (item: PurchaseCatalogItem) => void
  onCreate?: () => void
}

const stockTone = (qty: number) =>
  qty <= 0
    ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-950/40 dark:text-red-300'
    : qty <= 5
      ? 'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950/40 dark:text-orange-300'
      : qty <= 20
        ? 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950/40 dark:text-amber-300'
        : 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950/40 dark:text-emerald-300'

/** "Search: Product" — full-screen product list with photo, price and stock, plus a camera
 *  barcode scan in the header (Odoo's barcode button next to the Product field). */
export function MobileProductPicker({
  open,
  onOpenChange,
  query,
  onQueryChange,
  products,
  totalMatches,
  catalog,
  loading,
  showUrdu,
  warehouseQtyOf,
  warehouseName,
  onPick,
  onCreate,
}: MobileProductPickerProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const [scanOpen, setScanOpen] = useState(false)

  const pickByBarcode = (code: string) => {
    const value = code.trim()
    if (!value) return false
    const hit = catalog.find((item) => item.barcode && item.barcode.trim() === value)
    if (hit) {
      onPick(hit)
      return true
    }
    return false
  }

  return (
    <>
      <MobileScreen
        open={open}
        onOpenChange={onOpenChange}
        title={t('Search: Product') || 'Search: Product'}
        headerRight={
          <>
            {query ? (
              <Button type='button' variant='ghost' size='sm' className='h-9 text-sm text-primary' onClick={() => onQueryChange('')}>
                {t('Clear')}
              </Button>
            ) : null}
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-10 w-10 rounded-full'
              aria-label={t('scan_barcode') || 'Scan barcode'}
              onClick={() => setScanOpen(true)}
            >
              <ScanBarcode className='h-5 w-5' />
            </Button>
          </>
        }
        subHeader={
          <div className='px-3 py-2.5'>
            <div className='relative'>
              <Search className='pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
              <Input
                type='search'
                enterKeyHint='search'
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={(e) => {
                  // A hardware scanner types the code and presses Enter.
                  if (e.key === 'Enter' && pickByBarcode(query)) e.preventDefault()
                }}
                placeholder={t('search_products') || 'Search products…'}
                className='h-11 rounded-xl bg-muted/50 pl-9 text-[15px]'
              />
            </div>
          </div>
        }
        footer={
          <div className='grid grid-cols-2 gap-2'>
            {onCreate ? (
              <Button type='button' className='h-11 gap-1.5 text-[15px]' onClick={onCreate}>
                <Plus className='h-4 w-4' />
                {t('New')}
              </Button>
            ) : (
              <span />
            )}
            <Button type='button' variant='secondary' className='h-11 gap-1.5 text-[15px]' onClick={() => onOpenChange(false)}>
              <X className='h-4 w-4' />
              {t('Close')}
            </Button>
          </div>
        }
      >
        {loading && products.length === 0 ? (
          <div className='flex flex-col items-center gap-2 py-16 text-sm text-muted-foreground'>
            <Loader2 className='h-6 w-6 animate-spin' />
            {t('loading_products')}
          </div>
        ) : products.length === 0 ? (
          <div className='px-6 py-14 text-center'>
            <p className='text-sm font-medium'>{t('no_products_found')}</p>
            <p className='mt-1 text-xs text-muted-foreground'>{t('check_product_is_active')}</p>
            {onCreate && query.trim() ? (
              <Button type='button' variant='link' className='mt-1' onClick={onCreate}>
                <Plus className='mr-1 h-4 w-4' />
                {t('add_product')} “{query.trim()}”
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className='divide-y'>
            {products.map((item) => {
              const urdu = showUrdu ? item.nameUrdu?.trim() : ''
              const whQty = warehouseQtyOf ? warehouseQtyOf(item.productId, item.variantId) : null
              return (
                <li key={item.id}>
                  <button
                    type='button'
                    onClick={() => onPick(item)}
                    className='flex w-full items-center gap-3 px-3 py-3 text-left active:bg-muted'
                  >
                    <span className='min-w-0 flex-1'>
                      <span className={getTextClasses(item.name, 'block text-[15px] leading-snug font-semibold break-words')}>
                        {item.name}
                      </span>
                      {urdu ? (
                        <span dir='auto' className='block truncate text-sm text-muted-foreground'>
                          {urdu}
                        </span>
                      ) : null}
                      {item.barcode || item.brand?.name ? (
                        <span className='mt-0.5 block truncate text-xs text-muted-foreground'>
                          {[item.brand?.name, item.barcode ? `[${item.barcode}]` : ''].filter(Boolean).join(' · ')}
                        </span>
                      ) : null}
                      <span className='mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]'>
                        <span className='text-muted-foreground'>
                          {t('Price')}: <span className='font-semibold text-foreground tabular-nums'>{formatMoney(Number(item.price || 0))}</span>
                        </span>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset tabular-nums', stockTone(item.stockQuantity))}>
                          {item.stockQuantity <= 0 ? t('Out of stock') || 'Out of stock' : `${item.stockQuantity} ${item.unit || ''} ${t('in stock') || 'in stock'}`}
                        </span>
                        {whQty !== null && warehouseName ? (
                          <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium tabular-nums'>
                            {warehouseName}: {whQty}
                          </span>
                        ) : null}
                      </span>
                    </span>
                    {item.image?.url ? (
                      <img src={item.image.url} alt='' loading='lazy' className='h-16 w-16 shrink-0 rounded-lg border object-cover' />
                    ) : (
                      <span className='flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground/50'>
                        <ImagePlus className='h-7 w-7' />
                      </span>
                    )}
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {totalMatches > products.length && (
          <p className='px-4 py-3 text-center text-xs text-muted-foreground'>
            {t('Showing {{shown}} of {{total}} — keep typing to narrow', { shown: products.length, total: totalMatches })}
          </p>
        )}
      </MobileScreen>

      <MobileCameraScanner
        isOpen={scanOpen}
        onOpenChange={setScanOpen}
        trigger={<span className='hidden' aria-hidden><Camera /></span>}
        onScanResult={(code) => {
          setScanOpen(false)
          if (!pickByBarcode(code)) {
            onQueryChange(code)
            toast.info(`${t('No product with barcode') || 'No product with barcode'} ${code}`)
          }
        }}
      />
    </>
  )
}

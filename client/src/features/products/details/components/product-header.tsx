import type { ReactNode } from 'react'
import { Link, useNavigate, useRouter } from '@tanstack/react-router'
import { ArrowLeft, ClipboardEdit, DollarSign, Fingerprint, Layers, Pencil, RefreshCw, ShoppingCart } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { FlagBadge } from '@/components/flag-badge'
import { ColorDot } from '@/components/color-swatch-picker'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { getUnitLabel } from '@/lib/units'
import { formatBusinessDate } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import type { ProductAnalyticsResponse } from '@/stores/productAnalytics.api'
import { MovementBadge, AbcBadge } from '../../analytics/components/analytics-badges'
import { ProductThumb } from '../../analytics/components/product-thumb'
import { formatPct, formatQty } from '../../analytics/lib/analytics-format'
import { suggestReorderQuantity } from '../lib/reorder'

interface Props {
  data: ProductAnalyticsResponse
  refreshing: boolean
  onRefresh: () => void
  onEdit: () => void
}

/** One labelled fact in the details grid; long values truncate with the full text on hover. */
function Fact({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  const title = typeof value === 'string' ? value : undefined
  return (
    <div className='min-w-0'>
      <dt className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{label}</dt>
      <dd className='mt-0.5 truncate text-sm font-medium' title={title}>
        {value || <span className='font-normal text-muted-foreground'>—</span>}
      </dd>
      {sub ? <dd className='truncate text-xs text-muted-foreground'>{sub}</dd> : null}
    </div>
  )
}

/** A price figure in the pricing block. */
function PriceFigure({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'danger' | 'success' }) {
  return (
    <div className='flex min-w-0 flex-col justify-center px-4 py-3.5'>
      <span className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>{label}</span>
      <span
        className={cn(
          'mt-0.5 text-base font-semibold leading-tight tabular-nums break-words sm:text-lg',
          tone === 'danger' && 'text-rose-600 dark:text-rose-400',
          tone === 'success' && 'text-emerald-600 dark:text-emerald-400',
        )}
      >
        {value}
      </span>
      {sub ? <span className='text-xs text-muted-foreground'>{sub}</span> : null}
    </div>
  )
}

export function ProductHeader({ data, refreshing, onRefresh, onEdit }: Props) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { hasPermission } = usePermissions()
  const router = useRouter()
  const navigate = useNavigate()
  const { product, metrics, lastPurchase, lastSale } = data

  const canEdit = hasPermission('editProducts')
  const canPurchase = hasPermission('createPurchases') && !product.hasVariants
  const canCheckPrice = hasPermission('viewPriceChecker')
  const reorderQty = suggestReorderQuantity(metrics)

  const unitMargin = product.price - product.cost
  const unitMarginPct = product.price > 0 ? (unitMargin / product.price) * 100 : null
  const range = (min: number, max: number) => (min === max ? formatMoney(min) : `${formatMoney(min)} – ${formatMoney(max)}`)

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else navigate({ to: '/products' })
  }

  return (
    <div className='space-y-3'>
      <nav className='flex min-w-0 items-center gap-1 text-sm text-muted-foreground' aria-label={t('Breadcrumb')}>
        <Button variant='ghost' size='icon' className='-ml-2 h-8 w-8 shrink-0' onClick={goBack} aria-label={t('Back')}>
          <ArrowLeft className='h-4 w-4' />
        </Button>
        <Link to='/products' className='shrink-0 hover:text-foreground hover:underline'>
          {t('Products')}
        </Link>
        <span aria-hidden className='px-1'>
          /
        </span>
        <span className='truncate text-foreground'>{product.name}</span>
        <Button
          variant='ghost'
          size='icon'
          className='ml-auto h-8 w-8 shrink-0 md:hidden'
          onClick={onRefresh}
          disabled={refreshing}
          aria-label={t('Refresh')}
        >
          <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
        </Button>
      </nav>

      <Card className='gap-0 overflow-hidden py-0'>
        {/* Identity + actions */}
        <div className='flex flex-col gap-4 p-4 sm:p-5 md:flex-row md:items-start md:justify-between'>
          <div className='flex min-w-0 items-start gap-4'>
            <ProductThumb url={product.image?.url} name={product.name} size='lg' />
            <div className='min-w-0 space-y-2'>
              <div>
                <div className='flex min-w-0 flex-wrap items-center gap-2'>
                  <ColorDot hex={product.color} />
                  <h1 className='break-words text-xl font-bold leading-tight tracking-tight sm:text-2xl'>{product.name}</h1>
                  <FlagBadge flag={product.flag} />
                </div>
                {product.nameUrdu ? (
                  <p dir='rtl' className='mt-0.5 w-fit text-base text-muted-foreground'>
                    {product.nameUrdu}
                  </p>
                ) : null}
              </div>
              <div className='flex flex-wrap items-center gap-1.5'>
                <Badge
                  variant='outline'
                  className={cn(
                    'gap-1.5 font-medium',
                    product.isActive
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
                      : 'text-muted-foreground',
                  )}
                >
                  <span className={cn('h-1.5 w-1.5 rounded-full', product.isActive ? 'bg-emerald-500' : 'bg-muted-foreground')} aria-hidden />
                  {product.isActive ? t('Active') : t('Inactive')}
                </Badge>
                {metrics.abcClass ? (
                  <span className='inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium'>
                    <AbcBadge value={metrics.abcClass} className='h-4 w-4 rounded text-[10px]' />
                    {t('Class {{cls}}', { cls: metrics.abcClass })}
                  </span>
                ) : null}
                <MovementBadge value={metrics.movement} />
                {product.trackImei || product.trackSerial ? (
                  <Badge variant='outline' className='gap-1 font-medium'>
                    <Fingerprint className='h-3 w-3' />
                    {product.trackImei ? t('IMEI tracked') : t('Serial tracked')}
                  </Badge>
                ) : null}
                {product.hasVariants ? (
                  <Badge variant='outline' className='gap-1 font-medium'>
                    <Layers className='h-3 w-3' />
                    {t('{{count}} variants', { count: data.variants.length })}
                  </Badge>
                ) : null}
                {product.tags.slice(0, 4).map((tag) => (
                  <Badge key={tag} variant='secondary' className='font-normal'>
                    #{tag}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Phones: Edit full-width on top, secondary actions side by side. md+: one right-aligned toolbar. */}
          <div className='grid shrink-0 grid-cols-2 gap-2 md:flex md:items-center md:justify-end'>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant='outline' size='icon' className='hidden h-9 w-9 md:inline-flex' onClick={onRefresh} disabled={refreshing} aria-label={t('Refresh')}>
                  <RefreshCw className={cn('h-4 w-4', refreshing && 'animate-spin')} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t('Refresh')}</TooltipContent>
            </Tooltip>
            {canPurchase ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant='outline'
                    className='h-9 w-full gap-2 md:w-auto'
                    onClick={() =>
                      navigate({
                        to: '/purchase-invoice',
                        search: {
                          ...(lastPurchase?.supplierId ? { supplierId: lastPurchase.supplierId } : {}),
                          prefillItems: [{ productId: product.id, quantity: reorderQty }],
                        },
                      })
                    }
                  >
                    <ShoppingCart className='h-4 w-4' />
                    {t('Reorder')}
                  </Button>
                </TooltipTrigger>
                <TooltipContent className='max-w-xs'>
                  {t('New purchase for {{qty}} units (about 30 days of stock at the current pace)', { qty: formatQty(reorderQty) })}
                </TooltipContent>
              </Tooltip>
            ) : null}
            {canCheckPrice ? (
              <Button
                variant='outline'
                className='h-9 w-full gap-2 md:w-auto'
                onClick={() => navigate({ to: '/price-checker', search: { q: product.name } })}
              >
                <DollarSign className='h-4 w-4' />
                {t('Check Price')}
              </Button>
            ) : null}
            {canEdit ? (
              <Button
                variant='outline'
                className={cn('h-9 w-full gap-2 md:w-auto', !canPurchase && !canCheckPrice && 'col-span-2 md:col-span-1')}
                onClick={() => navigate({ to: '/stock-adjustments', search: { productId: product.id, productName: product.name } })}
              >
                <ClipboardEdit className='h-4 w-4' />
                {t('Adjust stock')}
              </Button>
            ) : null}
            {canEdit ? (
              <Button className='order-first col-span-2 h-9 w-full gap-2 md:order-none md:col-span-1 md:w-auto' onClick={onEdit}>
                <Pencil className='h-4 w-4' />
                {t('Edit product')}
              </Button>
            ) : null}
          </div>
        </div>

        {/* Pricing + details */}
        <div className='grid border-t lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)]'>
          <div className='grid grid-cols-3 divide-x border-b bg-muted/30 lg:border-r lg:border-b-0'>
            {product.hasVariants && product.priceRange ? (
              <>
                <PriceFigure label={t('Price range')} value={range(product.priceRange.minPrice, product.priceRange.maxPrice)} />
                <PriceFigure label={t('Cost range')} value={range(product.priceRange.minCost, product.priceRange.maxCost)} />
                <PriceFigure label={t('Variants')} value={String(data.variants.length)} sub={t('priced separately')} />
              </>
            ) : (
              <>
                <PriceFigure label={t('Selling price')} value={formatMoney(product.price)} />
                <PriceFigure label={t('Cost')} value={formatMoney(product.cost)} />
                <PriceFigure
                  label={t('Margin / unit')}
                  value={formatMoney(unitMargin)}
                  sub={unitMarginPct !== null ? t('{{pct}} of price', { pct: formatPct(unitMarginPct) }) : undefined}
                  tone={unitMargin < 0 ? 'danger' : unitMargin > 0 ? 'success' : undefined}
                />
              </>
            )}
          </div>

          <dl className='grid grid-cols-2 gap-x-6 gap-y-3 p-4 sm:grid-cols-4'>
            <Fact label={t('SKU')} value={product.sku} />
            <Fact label={t('Barcode')} value={product.barcode} />
            <Fact
              label={t('Category')}
              value={product.categories.map((c) => c.name).join(', ')}
              sub={product.subCategories.length ? product.subCategories.map((c) => c.name).join(', ') : undefined}
            />
            <Fact label={t('Brand')} value={product.brand?.name} />
            <Fact label={t('Unit')} value={getUnitLabel(product.unit)} sub={product.shelfLocation ? t('Shelf {{code}}', { code: product.shelfLocation }) : undefined} />
            <Fact
              label={t('Default supplier')}
              value={product.defaultSupplier?.name}
              sub={product.defaultSupplier?.phone || undefined}
            />
            <Fact
              label={t('Last purchased')}
              value={lastPurchase ? formatBusinessDate(lastPurchase.date) : undefined}
              sub={lastPurchase ? [lastPurchase.supplierName, lastPurchase.unitCost !== null ? formatMoney(lastPurchase.unitCost) : null].filter(Boolean).join(' · ') : undefined}
            />
            <Fact
              label={t('Last sold')}
              value={lastSale ? formatBusinessDate(lastSale.date) : undefined}
              sub={lastSale ? `${lastSale.invoiceNumber} · ${formatMoney(lastSale.unitPrice)}` : undefined}
            />
          </dl>
        </div>
      </Card>
    </div>
  )
}

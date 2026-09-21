import { useCallback, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { useDispatch } from 'react-redux'
import { AlertTriangle, PackageSearch } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useLanguage } from '@/context/language-context'
import type { AppDispatch } from '@/stores/store'
import { useGetProductQuery } from '@/stores/product.api'
import { purchaseCatalogApi } from '@/stores/purchaseCatalog.api'
import { productAnalyticsApi, useGetProductAnalyticsQuery } from '@/stores/productAnalytics.api'
import { UsersActionDialog } from '../components/users-action-dialog'
import { useAnalyticsPeriod } from '../analytics/lib/analytics-period'
import { formatRangeLabel } from '../analytics/lib/analytics-format'
import { AnalyticsPeriodPicker } from '../analytics/components/analytics-period-picker'
import { SalesTrendChart } from '../analytics/components/sales-trend-chart'
import { ProductHeader } from './components/product-header'
import { ProductKpis } from './components/product-kpis'
import { ProductInsights } from './components/product-insights'
import { PriceHistoryChart, StockFlowChart } from './components/product-flow-charts'
import { ProductActivityTab } from './components/product-activity-tab'
import { ProductPriceHistoryTab } from './components/product-price-history-tab'
import { ProductCustomersTab } from './components/product-customers-tab'
import { ProductSuppliersTab } from './components/product-suppliers-tab'
import { ProductVariantsTab } from './components/product-variants-tab'

function LoadingState() {
  return (
    <div className='space-y-4'>
      <Skeleton className='h-6 w-48' />
      <Skeleton className='h-40 w-full rounded-xl' />
      <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6'>
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className='h-[88px] rounded-xl' />
        ))}
      </div>
      <Skeleton className='h-80 w-full rounded-xl' />
    </div>
  )
}

/**
 * /products/:productId — one product's performance: KPIs vs the previous period, insights,
 * sales/stock/price charts, and its full history (activity, customers, suppliers, variants).
 */
export default function ProductDetailsPage({ productId }: { productId: string }) {
  const { t } = useLanguage()
  const dispatch = useDispatch<AppDispatch>()
  const { preset, range, setPreset, setCustomRange } = useAnalyticsPeriod()
  const [tab, setTab] = useState('activity')
  const [editOpen, setEditOpen] = useState(false)

  const { currentData, data, isFetching, isError, error, refetch } = useGetProductAnalyticsQuery({ productId, ...range })
  // `data` keeps the last successful result across arg changes — only reuse it (dimmed) while
  // re-ranging the SAME product, never while switching to a different one.
  const analytics = currentData ?? (data?.product.id === productId ? data : undefined)
  const refreshing = isFetching && Boolean(analytics)

  const { data: productForEdit } = useGetProductQuery(productId, { skip: !editOpen })

  const handleSaved = useCallback(() => {
    dispatch(productAnalyticsApi.util.invalidateTags([{ type: 'ProductAnalytics', id: productId }, 'ProductAnalytics']))
    dispatch(purchaseCatalogApi.util.invalidateTags(['PurchaseCatalog']))
  }, [dispatch, productId])

  if (!analytics) {
    if (isError) {
      const notFound = (error as { status?: number } | undefined)?.status === 404
      return notFound ? (
        <Card className='mx-auto mt-10 max-w-md'>
          <CardContent className='flex flex-col items-center gap-3 p-8 text-center'>
            <PackageSearch className='h-10 w-10 text-muted-foreground' aria-hidden />
            <p className='text-lg font-semibold'>{t('Product not found')}</p>
            <p className='text-sm text-muted-foreground'>{t('It may have been deleted, or it belongs to another branch.')}</p>
            <Button asChild variant='outline'>
              <Link to='/products'>{t('Back to products')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Alert variant='destructive' className='mt-4'>
          <AlertTriangle className='h-4 w-4' />
          <AlertTitle>{t('Could not load this product')}</AlertTitle>
          <AlertDescription className='flex flex-wrap items-center gap-2'>
            {t('Check your connection and try again.')}
            <Button size='sm' variant='outline' onClick={() => refetch()}>
              {t('Try again')}
            </Button>
          </AlertDescription>
        </Alert>
      )
    }
    return <LoadingState />
  }

  const hasVariants = analytics.product.hasVariants

  return (
    <div className='space-y-4 pb-8'>
      <ProductHeader data={analytics} refreshing={isFetching} onRefresh={() => refetch()} onEdit={() => setEditOpen(true)} />

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <AnalyticsPeriodPicker preset={preset} range={range} onPresetChange={setPreset} onCustomRange={setCustomRange} />
        <p className='text-xs text-muted-foreground'>
          {t('Compared with')} {formatRangeLabel(analytics.period.previousStartDate, analytics.period.previousEndDate)}
        </p>
      </div>

      <ProductKpis data={analytics} refreshing={refreshing} />

      <div className='grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]'>
        <SalesTrendChart
          title={t('Sales')}
          description={formatRangeLabel(analytics.period.startDate, analytics.period.endDate)}
          series={analytics.series}
          granularity={analytics.period.granularity}
          refreshing={refreshing}
        />
        <ProductInsights insights={analytics.insights} />
      </div>

      <div className='grid grid-cols-1 gap-4 lg:grid-cols-2'>
        <StockFlowChart data={analytics} refreshing={refreshing} />
        <PriceHistoryChart data={analytics} refreshing={refreshing} />
      </div>

      <Card>
        <CardContent className='p-4'>
          <Tabs value={tab} onValueChange={setTab} className='gap-3'>
            <div className='overflow-x-auto'>
              <TabsList>
                <TabsTrigger value='activity'>{t('Activity')}</TabsTrigger>
                <TabsTrigger value='prices'>{t('Price history')}</TabsTrigger>
                <TabsTrigger value='customers'>
                  {t('Customers')}
                  {analytics.customers.uniqueCustomers > 0 ? (
                    <span className='ml-1 text-xs text-muted-foreground tabular-nums'>{analytics.customers.uniqueCustomers}</span>
                  ) : null}
                </TabsTrigger>
                <TabsTrigger value='suppliers'>
                  {t('Suppliers')}
                  {analytics.suppliers.length > 0 ? (
                    <span className='ml-1 text-xs text-muted-foreground tabular-nums'>{analytics.suppliers.length}</span>
                  ) : null}
                </TabsTrigger>
                {hasVariants ? (
                  <TabsTrigger value='variants'>
                    {t('Variants')}
                    <span className='ml-1 text-xs text-muted-foreground tabular-nums'>{analytics.variants.length}</span>
                  </TabsTrigger>
                ) : null}
              </TabsList>
            </div>
            <TabsContent value='activity'>
              <ProductActivityTab productId={productId} range={range} />
            </TabsContent>
            <TabsContent value='prices'>
              <ProductPriceHistoryTab productId={productId} hasVariants={hasVariants} />
            </TabsContent>
            <TabsContent value='customers'>
              <ProductCustomersTab data={analytics} />
            </TabsContent>
            <TabsContent value='suppliers'>
              <ProductSuppliersTab data={analytics} />
            </TabsContent>
            {hasVariants ? (
              <TabsContent value='variants'>
                <ProductVariantsTab data={analytics} />
              </TabsContent>
            ) : null}
          </Tabs>
        </CardContent>
      </Card>

      {editOpen && productForEdit ? (
        <UsersActionDialog
          key={`product-edit-${productId}`}
          open={editOpen}
          onOpenChange={setEditOpen}
          currentRow={productForEdit}
          setFetch={handleSaved}
        />
      ) : null}
    </div>
  )
}

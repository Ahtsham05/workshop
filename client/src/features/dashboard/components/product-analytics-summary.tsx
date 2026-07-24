import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Layers, Tag, Smartphone, TrendingUp, DollarSign } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetProductsByCategoryQuery, useGetProductsByBrandQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'
import {
  dashboardRangeQueryParams,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'

type Props = {
  dateRange: DashboardDateRange
}

export function ProductAnalyticsSummary({ dateRange }: Props) {
  const { t } = useLanguage()
  const { data: categories, isLoading: categoriesLoading } = useGetProductsByCategoryQuery({
    ...dashboardRangeQueryParams(dateRange),
  })
  const { data: brands, isLoading: brandsLoading } = useGetProductsByBrandQuery({
    ...dashboardRangeQueryParams(dateRange),
  })

  const loading = categoriesLoading || brandsLoading

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
        </CardHeader>
        <CardContent>
          <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className='h-24 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => `Rs ${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`

  const totalCategories = categories?.length || 0
  const totalBrands = brands?.length || 0
  const totalCategoryRevenue = categories?.reduce((sum, cat) => sum + cat.totalRevenue, 0) || 0
  const totalBrandRevenue = brands?.reduce((sum, brand) => sum + brand.totalRevenue, 0) || 0
  const totalCategoryProfit = categories?.reduce((sum, cat) => sum + cat.profit, 0) || 0
  const imeiProductBrands = brands?.filter(b => b.hasImeiProducts).length || 0

  const topCategory = categories?.[0]
  const topBrand = brands?.[0]

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5 text-primary' />
          {t('Product Analytics Overview')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4'>
          {/* Categories Summary */}
          <div className='p-4 rounded-lg border bg-gradient-to-br from-blue-50 to-white'>
            <div className='flex items-center justify-between mb-2'>
              <Layers className='h-5 w-5 text-blue-600' />
              <span className='text-2xl font-bold text-blue-900'>{totalCategories}</span>
            </div>
            <p className='text-sm font-medium text-blue-900 mb-1'>
              {t('Active Categories')}
            </p>
            <p className='text-xs text-blue-600'>
              {formatCurrency(totalCategoryRevenue)} {t('Revenue')}
            </p>
            {topCategory && (
              <p className='text-xs text-muted-foreground mt-2 truncate'>
                {t('Top')}: {topCategory.categoryName}
              </p>
            )}
          </div>

          {/* Brands Summary */}
          <div className='p-4 rounded-lg border bg-gradient-to-br from-purple-50 to-white'>
            <div className='flex items-center justify-between mb-2'>
              <Tag className='h-5 w-5 text-purple-600' />
              <span className='text-2xl font-bold text-purple-900'>{totalBrands}</span>
            </div>
            <p className='text-sm font-medium text-purple-900 mb-1'>
              {t('Active Brands')}
            </p>
            <p className='text-xs text-purple-600'>
              {formatCurrency(totalBrandRevenue)} {t('Revenue')}
            </p>
            {topBrand && (
              <p className='text-xs text-muted-foreground mt-2 truncate'>
                {t('Top')}: {topBrand.brandName}
              </p>
            )}
          </div>

          {/* Category Profit */}
          <div className='p-4 rounded-lg border bg-gradient-to-br from-green-50 to-white'>
            <div className='flex items-center justify-between mb-2'>
              <DollarSign className='h-5 w-5 text-green-600' />
              <span className='text-sm font-semibold text-green-900'>
                {totalCategoryRevenue > 0 
                  ? `${((totalCategoryProfit / totalCategoryRevenue) * 100).toFixed(1)}%` 
                  : '0%'}
              </span>
            </div>
            <p className='text-sm font-medium text-green-900 mb-1'>
              {t('Category Margin')}
            </p>
            <p className='text-xs text-green-600'>
              {formatCurrency(totalCategoryProfit)} {t('Profit')}
            </p>
            <p className='text-xs text-muted-foreground mt-2'>
              {t('Across all categories')}
            </p>
          </div>

          {/* IMEI Products */}
          <div className='p-4 rounded-lg border bg-gradient-to-br from-indigo-50 to-white'>
            <div className='flex items-center justify-between mb-2'>
              <Smartphone className='h-5 w-5 text-indigo-600' />
              <span className='text-2xl font-bold text-indigo-900'>{imeiProductBrands}</span>
            </div>
            <p className='text-sm font-medium text-indigo-900 mb-1'>
              {t('IMEI Brands')}
            </p>
            <p className='text-xs text-indigo-600'>
              {t('Brands with IMEI tracking')}
            </p>
            <p className='text-xs text-muted-foreground mt-2'>
              {t('Individual serial tracking')}
            </p>
          </div>
        </div>

        {/* Quick Insights */}
        {(topCategory || topBrand) && (
          <div className='mt-6 p-4 bg-muted/50 rounded-lg'>
            <p className='text-sm font-medium mb-2'>{t('Quick Insights')}</p>
            <div className='space-y-2 text-xs text-muted-foreground'>
              {topCategory && (
                <div className='flex items-center gap-2'>
                  <Layers className='h-3 w-3 text-blue-600' />
                  <span>
                    <strong className='text-foreground'>{topCategory.categoryName}</strong> {t('is your top category with')}{' '}
                    {formatCurrency(topCategory.totalRevenue)} {t('revenue')} ({topCategory.margin.toFixed(1)}% {t('margin')})
                  </span>
                </div>
              )}
              {topBrand && (
                <div className='flex items-center gap-2'>
                  <Tag className='h-3 w-3 text-purple-600' />
                  <span>
                    <strong className='text-foreground'>{topBrand.brandName}</strong> {t('is your top brand with')}{' '}
                    {topBrand.productCount} {t('products')} and {formatCurrency(topBrand.totalRevenue)} {t('revenue')}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

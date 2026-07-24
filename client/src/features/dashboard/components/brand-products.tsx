import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tag, Smartphone } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetProductsByBrandQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'
import {
  dashboardRangeQueryParams,
  formatDashboardRangeLabel,
  type DashboardDateRange,
} from '@/lib/dashboard-date-range'
import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  dateRange: DashboardDateRange
}

export function BrandProducts({ dateRange }: Props) {
  const { t } = useLanguage()
  const { data: brands, isLoading, isFetching } = useGetProductsByBrandQuery({
    ...dashboardRangeQueryParams(dateRange),
  })
  const loading = isLoading || isFetching
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-40' />
          <Skeleton className='h-4 w-56 mt-2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-20 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => `Rs ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className='flex items-center gap-2'>
            <Tag className='h-5 w-5 text-purple-500' />
            {t('Sales by Brand')}
          </CardTitle>
          <CardDescription>
            {t('Product performance grouped by brand')} · {formatDashboardRangeLabel(dateRange, t)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {brands && brands.length > 0 ? (
              brands.map((brand) => (
                <div
                  key={brand.brandId || brand.brandName}
                  className='flex items-start justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer'
                  onClick={() => setSelectedBrand(brand.brandId || null)}
                >
                  <div className='flex items-center gap-3 flex-1 min-w-0'>
                    {brand.brandLogo?.url ? (
                      <img 
                        src={brand.brandLogo.url} 
                        alt={brand.brandName} 
                        className='h-10 w-10 rounded object-cover'
                      />
                    ) : (
                      <div className='h-10 w-10 rounded bg-purple-100 flex items-center justify-center'>
                        <Tag className='h-5 w-5 text-purple-600' />
                      </div>
                    )}
                    <div className='flex-1 min-w-0'>
                      <div className='flex items-center gap-2 mb-1'>
                        <p className='text-sm font-semibold truncate'>{brand.brandName}</p>
                        {brand.hasImeiProducts && (
                          <Badge variant='secondary' className='text-xs'>
                            <Smartphone className='h-3 w-3 mr-1' />
                            {t('IMEI')}
                          </Badge>
                        )}
                      </div>
                      <div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
                        <div>
                          <span className='font-medium'>{t('Products')}:</span> {brand.productCount}
                        </div>
                        <div>
                          <span className='font-medium'>{t('Quantity')}:</span> {brand.totalQuantity}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className='text-right ml-4'>
                    <p className='text-sm font-bold text-primary mb-1'>
                      {formatCurrency(brand.totalRevenue)}
                    </p>
                    <p className='text-xs text-green-600 font-medium mb-1'>
                      {t('Profit')}: {formatCurrency(brand.profit)}
                    </p>
                    <Badge 
                      variant='outline' 
                      className={`text-xs ${
                        brand.margin > 30 
                          ? 'bg-green-50 text-green-700' 
                          : brand.margin > 15 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {brand.margin.toFixed(1)}% {t('Margin')}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center py-8'>
                <Tag className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
                <p className='text-sm text-muted-foreground'>{t('No brand data available')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedBrand && (
        <Dialog open={!!selectedBrand} onOpenChange={() => setSelectedBrand(null)}>
          <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>{t('Brand Details')}</DialogTitle>
              <DialogDescription>
                {t('Detailed product breakdown for this brand')}
              </DialogDescription>
            </DialogHeader>
            {/* Add detailed product list here if needed */}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

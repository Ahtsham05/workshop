import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, TrendingUp } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetTopProductsQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'

export function TopProducts() {
  const { t } = useLanguage()
  const { data: topProducts, isLoading } = useGetTopProductsQuery({ limit: 5 })

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48 mt-2' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className='h-16 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5 text-green-500' />
          {t('Top Selling Products')}
        </CardTitle>
        <CardDescription>{t('Best performing products this month')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className='space-y-3'>
          {topProducts && topProducts.length > 0 ? (
            topProducts.map((product, index) => (
              <div
                key={product.id}
                className='flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors'
              >
                <div className='flex items-center gap-3'>
                  <div className='flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-sm'>
                    #{index + 1}
                  </div>
                  {product.image?.url ? (
                    <img src={product.image.url} alt={product.name} className='h-10 w-10 rounded object-cover' />
                  ) : (
                    <div className='h-10 w-10 rounded bg-gray-200 flex items-center justify-center'>
                      <Package className='h-5 w-5 text-gray-500' />
                    </div>
                  )}
                  <div className='flex-1 min-w-0'>
                    <p className='text-sm font-medium truncate'>{product.name}</p>
                    <p className='text-xs text-muted-foreground'>
                      {product.totalQuantity} {t('units sold')}
                    </p>
                  </div>
                </div>
                <div className='text-right'>
                  <p className='text-sm font-semibold'>Rs{product.totalRevenue.toLocaleString()}</p>
                  <Badge 
                    variant='outline' 
                    className={`text-xs ${product.stockQuantity > 10 ? 'bg-green-50' : product.stockQuantity > 0 ? 'bg-yellow-50' : 'bg-red-50'}`}
                  >
                    {t('Stock')}: {product.stockQuantity}
                  </Badge>
                </div>
              </div>
            ))
          ) : (
            <div className='text-center py-8'>
              <Package className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
              <p className='text-sm text-muted-foreground'>{t('No sales data available')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

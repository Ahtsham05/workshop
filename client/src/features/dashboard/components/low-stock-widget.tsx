import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Package, TrendingDown, ExternalLink } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetLowStockProductsQuery } from '@/stores/dashboard.api'
import { Skeleton } from '@/components/ui/skeleton'
import { useNavigate } from '@tanstack/react-router'

export function LowStockWidget() {
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { data: lowStockProducts, isLoading } = useGetLowStockProductsQuery()

  const outOfStock = lowStockProducts?.filter(p => p.stockQuantity === 0) || []
  const lowStock = lowStockProducts?.filter(p => p.stockQuantity > 0 && p.stockQuantity <= (p.minStockLevel || 10)) || []

  if (isLoading) {
    return (
      <Card className='col-span-1 lg:col-span-3'>
        <CardHeader>
          <Skeleton className='h-6 w-32' />
          <Skeleton className='h-4 w-48 mt-2' />
        </CardHeader>
        <CardContent>
          <Skeleton className='h-[300px] w-full' />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className='col-span-1 lg:col-span-3'>
      <CardHeader>
        <div className='flex items-center justify-between'>
          <div>
            <CardTitle className='flex items-center gap-2'>
              <AlertTriangle className='h-5 w-5 text-orange-500' />
              {t('Inventory Alerts')}
            </CardTitle>
            <CardDescription>{t('Products requiring attention')}</CardDescription>
          </div>
          <Button 
            variant='ghost' 
            size='sm'
            onClick={() => navigate({ to: '/products' })}
          >
            <ExternalLink className='h-4 w-4' />
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className='space-y-4'>
          {/* Out of Stock */}
          {outOfStock.length > 0 && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h4 className='text-sm font-semibold text-red-600 flex items-center gap-2'>
                  <Package className='h-4 w-4' />
                  {t('Out of Stock')} ({outOfStock.length})
                </h4>
              </div>
              <div className='space-y-2 max-h-[120px] overflow-y-auto'>
                {outOfStock.slice(0, 3).map((product) => (
                  <div key={product.id} className='flex items-center justify-between p-2 bg-red-50 dark:bg-red-950/20 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      {product.image?.url ? (
                        <img src={product.image.url} alt={product.name} className='h-8 w-8 rounded object-cover' />
                      ) : (
                        <div className='h-8 w-8 rounded bg-gray-200 flex items-center justify-center'>
                          <Package className='h-4 w-4 text-gray-500' />
                        </div>
                      )}
                      <div>
                        <p className='text-sm font-medium'>{product.name}</p>
                        <p className='text-xs text-muted-foreground'>{product.category}</p>
                      </div>
                    </div>
                    <Badge variant='destructive' className='text-xs'>0</Badge>
                  </div>
                ))}
                {outOfStock.length > 3 && (
                  <p className='text-xs text-center text-muted-foreground'>
                    +{outOfStock.length - 3} {t('more')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Low Stock */}
          {lowStock.length > 0 && (
            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <h4 className='text-sm font-semibold text-orange-600 flex items-center gap-2'>
                  <TrendingDown className='h-4 w-4' />
                  {t('Low Stock')} ({lowStock.length})
                </h4>
              </div>
              <div className='space-y-2 max-h-[120px] overflow-y-auto'>
                {lowStock.slice(0, 3).map((product) => (
                  <div key={product.id} className='flex items-center justify-between p-2 bg-orange-50 dark:bg-orange-950/20 rounded-lg'>
                    <div className='flex items-center gap-2'>
                      {product.image?.url ? (
                        <img src={product.image.url} alt={product.name} className='h-8 w-8 rounded object-cover' />
                      ) : (
                        <div className='h-8 w-8 rounded bg-gray-200 flex items-center justify-center'>
                          <Package className='h-4 w-4 text-gray-500' />
                        </div>
                      )}
                      <div>
                        <p className='text-sm font-medium'>{product.name}</p>
                        <p className='text-xs text-muted-foreground'>{product.category}</p>
                      </div>
                    </div>
                    <Badge variant='outline' className='text-xs bg-orange-100 dark:bg-orange-950'>
                      {product.stockQuantity}
                    </Badge>
                  </div>
                ))}
                {lowStock.length > 3 && (
                  <p className='text-xs text-center text-muted-foreground'>
                    +{lowStock.length - 3} {t('more')}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* No Alerts */}
          {outOfStock.length === 0 && lowStock.length === 0 && (
            <div className='text-center py-8'>
              <Package className='h-12 w-12 mx-auto text-green-500 mb-2' />
              <p className='text-sm font-medium text-green-600'>{t('All products are well stocked!')}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

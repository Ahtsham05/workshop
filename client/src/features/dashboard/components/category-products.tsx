import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Layers, TrendingUp, Package } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { useGetProductsByCategoryQuery } from '@/stores/dashboard.api'
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

export function CategoryProducts({ dateRange }: Props) {
  const { t } = useLanguage()
  const { data: categories, isLoading, isFetching } = useGetProductsByCategoryQuery({
    ...dashboardRangeQueryParams(dateRange),
  })
  const loading = isLoading || isFetching
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

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
            <Layers className='h-5 w-5 text-blue-500' />
            {t('Sales by Category')}
          </CardTitle>
          <CardDescription>
            {t('Product performance grouped by category')} · {formatDashboardRangeLabel(dateRange, t)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {categories && categories.length > 0 ? (
              categories.map((category) => (
                <div
                  key={category.categoryId || category.categoryName}
                  className='flex items-start justify-between p-4 rounded-lg border hover:bg-muted/50 transition-colors cursor-pointer'
                  onClick={() => setSelectedCategory(category.categoryId || null)}
                >
                  <div className='flex-1 min-w-0'>
                    <div className='flex items-center gap-2 mb-2'>
                      <Package className='h-4 w-4 text-muted-foreground' />
                      <p className='text-sm font-semibold truncate'>{category.categoryName}</p>
                    </div>
                    <div className='grid grid-cols-2 gap-2 text-xs text-muted-foreground'>
                      <div>
                        <span className='font-medium'>{t('Products')}:</span> {category.productCount}
                      </div>
                      <div>
                        <span className='font-medium'>{t('Quantity')}:</span> {category.totalQuantity}
                      </div>
                    </div>
                  </div>
                  <div className='text-right ml-4'>
                    <p className='text-sm font-bold text-primary mb-1'>
                      {formatCurrency(category.totalRevenue)}
                    </p>
                    <p className='text-xs text-green-600 font-medium mb-1'>
                      {t('Profit')}: {formatCurrency(category.profit)}
                    </p>
                    <Badge 
                      variant='outline' 
                      className={`text-xs ${
                        category.margin > 30 
                          ? 'bg-green-50 text-green-700' 
                          : category.margin > 15 
                          ? 'bg-blue-50 text-blue-700' 
                          : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {category.margin.toFixed(1)}% {t('Margin')}
                    </Badge>
                  </div>
                </div>
              ))
            ) : (
              <div className='text-center py-8'>
                <Layers className='h-12 w-12 mx-auto text-muted-foreground mb-2' />
                <p className='text-sm text-muted-foreground'>{t('No category data available')}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedCategory && (
        <Dialog open={!!selectedCategory} onOpenChange={() => setSelectedCategory(null)}>
          <DialogContent className='max-w-3xl max-h-[80vh] overflow-y-auto'>
            <DialogHeader>
              <DialogTitle>{t('Category Details')}</DialogTitle>
              <DialogDescription>
                {t('Detailed product breakdown for this category')}
              </DialogDescription>
            </DialogHeader>
            {/* Add detailed product list here if needed */}
          </DialogContent>
        </Dialog>
      )}
    </>
  )
}

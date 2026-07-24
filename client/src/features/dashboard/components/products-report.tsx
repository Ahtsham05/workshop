import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Package, Smartphone, Tag, Layers, TrendingUp, AlertCircle } from 'lucide-react'
import { useLanguage } from '@/context/language-context'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

type ProductReportProps = {
  products: Array<{
    id: string
    name: string
    category?: string
    brand?: string
    trackImei: boolean
    stockQuantity: number
    totalQuantity: number
    totalRevenue: number
    profit: number
    margin: number
  }>
  isLoading?: boolean
}

export function ProductsReport({ products, isLoading }: ProductReportProps) {
  const { t } = useLanguage()

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className='h-6 w-48' />
        </CardHeader>
        <CardContent>
          <div className='space-y-3'>
            {[...Array(10)].map((_, i) => (
              <Skeleton key={i} className='h-12 w-full' />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const formatCurrency = (value: number) => `Rs ${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`

  // Separate products by type
  const imeiProducts = products.filter(p => p.trackImei)
  const regularProducts = products.filter(p => !p.trackImei)

  const renderProductTable = (productList: typeof products, showImeiColumn: boolean = false) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('Product')}</TableHead>
          {showImeiColumn && (
            <TableHead className='text-center'>
              <div className='flex items-center justify-center gap-1'>
                <Smartphone className='h-3 w-3' />
                {t('IMEI')}
              </div>
            </TableHead>
          )}
          <TableHead>
            <div className='flex items-center gap-1'>
              <Layers className='h-3 w-3' />
              {t('Category')}
            </div>
          </TableHead>
          <TableHead>
            <div className='flex items-center gap-1'>
              <Tag className='h-3 w-3' />
              {t('Brand')}
            </div>
          </TableHead>
          <TableHead className='text-right'>{t('Qty Sold')}</TableHead>
          <TableHead className='text-right'>{t('Stock')}</TableHead>
          <TableHead className='text-right'>{t('Revenue')}</TableHead>
          <TableHead className='text-right'>{t('Profit')}</TableHead>
          <TableHead className='text-right'>{t('Margin')}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {productList.length > 0 ? (
          productList.map((product) => (
            <TableRow key={product.id}>
              <TableCell className='font-medium'>
                <div className='flex items-center gap-2'>
                  <Package className='h-4 w-4 text-muted-foreground' />
                  <span className='truncate max-w-[200px]'>{product.name}</span>
                </div>
              </TableCell>
              {showImeiColumn && (
                <TableCell className='text-center'>
                  {product.trackImei && (
                    <Badge variant='secondary' className='text-xs'>
                      <Smartphone className='h-3 w-3 mr-1' />
                      {t('Tracked')}
                    </Badge>
                  )}
                </TableCell>
              )}
              <TableCell>
                <span className='text-xs text-muted-foreground'>
                  {product.category || t('Uncategorized')}
                </span>
              </TableCell>
              <TableCell>
                <span className='text-xs text-muted-foreground'>
                  {product.brand || t('No Brand')}
                </span>
              </TableCell>
              <TableCell className='text-right font-medium'>
                {product.totalQuantity}
              </TableCell>
              <TableCell className='text-right'>
                <Badge 
                  variant='outline' 
                  className={`text-xs ${
                    product.stockQuantity > 10 
                      ? 'bg-green-50 text-green-700' 
                      : product.stockQuantity > 0 
                      ? 'bg-yellow-50 text-yellow-700' 
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  {product.stockQuantity}
                  {product.stockQuantity === 0 && (
                    <AlertCircle className='h-3 w-3 ml-1' />
                  )}
                </Badge>
              </TableCell>
              <TableCell className='text-right font-semibold text-primary'>
                {formatCurrency(product.totalRevenue)}
              </TableCell>
              <TableCell className='text-right font-medium text-green-600'>
                {formatCurrency(product.profit)}
              </TableCell>
              <TableCell className='text-right'>
                <Badge 
                  variant='outline' 
                  className={`text-xs ${
                    product.margin > 30 
                      ? 'bg-green-50 text-green-700' 
                      : product.margin > 15 
                      ? 'bg-blue-50 text-blue-700' 
                      : 'bg-amber-50 text-amber-700'
                  }`}
                >
                  {product.margin.toFixed(1)}%
                </Badge>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell 
              colSpan={showImeiColumn ? 9 : 8} 
              className='text-center py-8 text-muted-foreground'
            >
              {t('No products found')}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className='flex items-center gap-2'>
          <TrendingUp className='h-5 w-5 text-primary' />
          {t('Detailed Product Report')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue='all' className='w-full'>
          <TabsList className='grid w-full grid-cols-3'>
            <TabsTrigger value='all'>
              {t('All Products')} ({products.length})
            </TabsTrigger>
            <TabsTrigger value='imei'>
              <Smartphone className='h-4 w-4 mr-2' />
              {t('IMEI Products')} ({imeiProducts.length})
            </TabsTrigger>
            <TabsTrigger value='regular'>
              <Package className='h-4 w-4 mr-2' />
              {t('Regular Products')} ({regularProducts.length})
            </TabsTrigger>
          </TabsList>
          
          <TabsContent value='all' className='mt-4'>
            <div className='rounded-md border'>
              {renderProductTable(products, true)}
            </div>
          </TabsContent>
          
          <TabsContent value='imei' className='mt-4'>
            <div className='rounded-md border'>
              {renderProductTable(imeiProducts, false)}
            </div>
            {imeiProducts.length > 0 && (
              <div className='mt-4 p-4 bg-blue-50 rounded-md'>
                <div className='flex items-start gap-2'>
                  <Smartphone className='h-5 w-5 text-blue-600 mt-0.5' />
                  <div className='flex-1'>
                    <p className='text-sm font-medium text-blue-900'>
                      {t('IMEI Tracked Products')}
                    </p>
                    <p className='text-xs text-blue-700 mt-1'>
                      {t('These products have individual IMEI/serial number tracking for warranty and inventory management.')}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value='regular' className='mt-4'>
            <div className='rounded-md border'>
              {renderProductTable(regularProducts, false)}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}

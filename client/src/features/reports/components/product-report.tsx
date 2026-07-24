import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGetProductReportQuery } from '@/stores/reports.api'
import { useGetProductsByCategoryQuery, useGetProductsByBrandQuery, useGetCategoryProductsQuery, useGetBrandProductsQuery } from '@/stores/dashboard.api'
import { useLanguage } from '@/context/language-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Eye, Layers, Tag, Package, Smartphone, TrendingUp, AlertCircle, X } from 'lucide-react'
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Search } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import { toast } from 'sonner'
import { ProductDetailDialog } from './product-detail-dialog'
import { kpiCardClass } from '@/lib/stat-card-tones'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface ProductReportProps {
  startDate: string
  endDate: string
}

export const ProductReport = forwardRef<{ exportToExcel: () => void }, ProductReportProps>(
  ({ startDate, endDate }, ref) => {
    const { t, language } = useLanguage()
    const { data, isLoading } = useGetProductReportQuery({ startDate, endDate })
    const { data: categoryData, isLoading: categoryLoading } = useGetProductsByCategoryQuery({
      period: 'custom',
      startDate,
      endDate,
    })
    const { data: brandData, isLoading: brandLoading } = useGetProductsByBrandQuery({
      period: 'custom',
      startDate,
      endDate,
    })
    
    const [selectedProductId, setSelectedProductId] = useState<string | null>(null)
    const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null)
    const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeView, setActiveView] = useState<'products' | 'categories' | 'brands'>('products')

    // Fetch detailed products for selected category/brand
    const { data: categoryProducts, isLoading: categoryProductsLoading } = useGetCategoryProductsQuery(
      { categoryId: selectedCategoryId!, period: 'custom', startDate, endDate },
      { skip: !selectedCategoryId }
    )
    const { data: brandProducts, isLoading: brandProductsLoading } = useGetBrandProductsQuery(
      { brandId: selectedBrandId!, period: 'custom', startDate, endDate },
      { skip: !selectedBrandId }
    )

    const filteredProducts = useMemo(() => {
      if (!data?.data) return []
      const term = searchTerm.trim().toLowerCase()
      if (!term) return data.data
      return data.data.filter((product) =>
        reportEntityName(language, product.productName, product.productNameUrdu)
          .toLowerCase()
          .includes(term)
      )
    }, [data?.data, searchTerm, language])

    useImperativeHandle(ref, () => ({
      exportToExcel: () => {
        try {
          let excelData: any[] = []
          let sheetName = 'Product Report'

          if (activeView === 'categories' && categoryData) {
            excelData = categoryData.map((cat) => ({
              [t('category')]: cat.categoryName,
              [t('products')]: cat.productCount,
              [t('quantity_sold')]: cat.totalQuantity,
              [t('revenue')]: cat.totalRevenue,
              [t('cost')]: cat.totalCost,
              [t('profit')]: cat.profit,
              [t('margin')]: `${cat.margin.toFixed(1)}%`,
            }))
            sheetName = 'Category Report'
          } else if (activeView === 'brands' && brandData) {
            excelData = brandData.map((brand) => ({
              [t('brand')]: brand.brandName,
              [t('products')]: brand.productCount,
              [t('quantity_sold')]: brand.totalQuantity,
              [t('revenue')]: brand.totalRevenue,
              [t('cost')]: brand.totalCost,
              [t('profit')]: brand.profit,
              [t('margin')]: `${brand.margin.toFixed(1)}%`,
              [t('has_imei')]: brand.hasImeiProducts ? 'Yes' : 'No',
            }))
            sheetName = 'Brand Report'
          } else if (data?.data) {
            excelData = data.data.map((product) => ({
              [t('product')]: reportEntityName(language, product.productName, product.productNameUrdu),
              [t('category')]: product.category || 'N/A',
              [t('quantity_sold')]: product.totalQuantitySold,
              [t('revenue')]: product.totalRevenue,
              [t('profit')]: product.totalProfit,
              [t('current_stock')]: product.currentStock,
            }))
          }

          if (excelData.length === 0) {
            toast.error(t('No data available to export'))
            return
          }

          const ws = XLSX.utils.json_to_sheet(excelData)
          const wb = XLSX.utils.book_new()
          XLSX.utils.book_append_sheet(wb, ws, sheetName)
          XLSX.writeFile(wb, `${sheetName.toLowerCase().replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
          toast.success(t('Data exported successfully'))
        } catch (error) {
          console.error('Export error:', error)
          toast.error(t('Failed to export data'))
        }
      },
    }))

    const formatCurrency = (value: number) => 
      new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

    const totalSoldRevenue = data?.data?.reduce((s, p) => s + (p.totalRevenue || 0), 0) ?? 0
    const totalSoldProfit = data?.data?.reduce((s, p) => s + (p.totalProfit || 0), 0) ?? 0
    const totalSoldCost = totalSoldRevenue - totalSoldProfit

    // Category analytics
    const totalCategoryRevenue = categoryData?.reduce((sum, cat) => sum + cat.totalRevenue, 0) || 0
    const totalCategoryProfit = categoryData?.reduce((sum, cat) => sum + cat.profit, 0) || 0
    const avgCategoryMargin = totalCategoryRevenue > 0 
      ? ((totalCategoryProfit / totalCategoryRevenue) * 100) 
      : 0

    // Brand analytics
    const totalBrandRevenue = brandData?.reduce((sum, brand) => sum + brand.totalRevenue, 0) || 0
    const totalBrandProfit = brandData?.reduce((sum, brand) => sum + brand.profit, 0) || 0
    const imeiBrandsCount = brandData?.filter(b => b.hasImeiProducts).length || 0

    if (isLoading && categoryLoading && brandLoading) {
      return <Skeleton className='h-[400px] w-full' />
    }

    return (
      <div className='space-y-6'>
        {/* View Selection Tabs */}
        <Card>
          <CardHeader>
            <CardTitle className='flex items-center gap-2'>
              <TrendingUp className='h-5 w-5' />
              {t('Product Analytics Report')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)}>
              <TabsList className='grid w-full grid-cols-3'>
                <TabsTrigger value='products'>
                  <Package className='h-4 w-4 mr-2' />
                  {t('By Products')}
                </TabsTrigger>
                <TabsTrigger value='categories'>
                  <Layers className='h-4 w-4 mr-2' />
                  {t('By Category')}
                </TabsTrigger>
                <TabsTrigger value='brands'>
                  <Tag className='h-4 w-4 mr-2' />
                  {t('By Brand')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {/* Products View */}
        {activeView === 'products' && (
          <>
            {/* Sales Summary */}
            <div className='grid gap-4 md:grid-cols-3'>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('total_sold_value')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{formatCurrency(totalSoldRevenue)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('total_revenue_from_sales')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('orange')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('total_cost_of_goods_sold')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-orange-600'>{formatCurrency(totalSoldCost)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('cost_of_sold_items')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('total_profit')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-green-600'>{formatCurrency(totalSoldProfit)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>
                    {totalSoldRevenue > 0 ? `${((totalSoldProfit / totalSoldRevenue) * 100).toFixed(1)}% ${t('margin')}` : '—'}
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Inventory Summary */}
            <div className='grid gap-4 md:grid-cols-4'>
              <Card className={kpiCardClass('sky')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('total_products')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{data?.stockSummary?.totalProducts || 0}</div>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('violet')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('stock_value')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{formatCurrency(data?.stockSummary?.totalStockValue || 0)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('current_inventory_value')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('amber')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('low_stock')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-orange-600'>{data?.stockSummary?.lowStockProducts || 0}</div>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('rose')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('out_of_stock')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-red-600'>{data?.stockSummary?.outOfStockProducts || 0}</div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className='flex flex-row items-center justify-between gap-4 space-y-0'>
                <CardTitle>{t('top_selling_products')}</CardTitle>
                <div className='relative w-full max-w-xs'>
                  <Search className='absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
                  <Input
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder={t('search_products')}
                    className='pl-8'
                  />
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('product')}</TableHead>
                      <TableHead className='text-right'>{t('quantity_sold')}</TableHead>
                      <TableHead className='text-right'>{t('revenue')}</TableHead>
                      <TableHead className='text-right'>{t('profit')}</TableHead>
                      <TableHead className='text-right'>{t('current_stock')}</TableHead>
                      <TableHead className='text-right'>{t('actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProducts.map((product) => {
                      const label = reportEntityName(language, product.productName, product.productNameUrdu)
                      return (
                      <TableRow key={product._id}>
                        <TableCell className={cn('font-medium', reportEntityNameClass(language, label))}>{label}</TableCell>
                        <TableCell className='text-right'>{product.totalQuantitySold} {product.unit || 'pcs'}</TableCell>
                        <TableCell className='text-right'>{formatCurrency(product.totalRevenue)}</TableCell>
                        <TableCell className='text-right text-green-600'>{formatCurrency(product.totalProfit)}</TableCell>
                        <TableCell className='text-right'>
                          <Badge variant={product.currentStock === 0 ? 'destructive' : product.currentStock <= 10 ? 'secondary' : 'default'}>
                            {product.currentStock} {product.unit || 'pcs'}
                          </Badge>
                        </TableCell>
                        <TableCell className='text-right'>
                          <Button
                            variant='ghost'
                            size='sm'
                            onClick={() => setSelectedProductId(product._id)}
                          >
                            <Eye className='h-4 w-4' />
                          </Button>
                        </TableCell>
                      </TableRow>
                      )
                    })}
                    {filteredProducts.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className='text-center text-muted-foreground'>
                          {t('no_products_found')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}

        {/* Category View */}
        {activeView === 'categories' && (
          <>
            {/* Category Summary */}
            <div className='grid gap-4 md:grid-cols-4'>
              <Card className={kpiCardClass('blue')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Categories')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{categoryData?.length || 0}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Active product categories')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Revenue')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{formatCurrency(totalCategoryRevenue)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Across all categories')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('green')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Profit')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-green-600'>{formatCurrency(totalCategoryProfit)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Category profit')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('violet')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Avg Margin')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-violet-600'>{avgCategoryMargin.toFixed(1)}%</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Average profit margin')}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Layers className='h-5 w-5 text-blue-600' />
                  {t('Sales by Category')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {categoryLoading ? (
                  <Skeleton className='h-[300px]' />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Category')}</TableHead>
                        <TableHead className='text-right'>{t('Products')}</TableHead>
                        <TableHead className='text-right'>{t('Quantity Sold')}</TableHead>
                        <TableHead className='text-right'>{t('Revenue')}</TableHead>
                        <TableHead className='text-right'>{t('Cost')}</TableHead>
                        <TableHead className='text-right'>{t('Profit')}</TableHead>
                        <TableHead className='text-right'>{t('Margin')}</TableHead>
                        <TableHead className='text-right'>{t('Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryData && categoryData.length > 0 ? (
                        categoryData.map((category) => (
                          <TableRow key={category.categoryId || category.categoryName}>
                            <TableCell className='font-medium'>
                              <div className='flex items-center gap-2'>
                                <Layers className='h-4 w-4 text-blue-600' />
                                {category.categoryName}
                              </div>
                            </TableCell>
                            <TableCell className='text-right'>{category.productCount}</TableCell>
                            <TableCell className='text-right'>{category.totalQuantity}</TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(category.totalRevenue)}
                            </TableCell>
                            <TableCell className='text-right text-orange-600'>
                              {formatCurrency(category.totalCost)}
                            </TableCell>
                            <TableCell className='text-right text-green-600 font-medium'>
                              {formatCurrency(category.profit)}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Badge 
                                variant='outline' 
                                className={`${
                                  category.margin > 30 
                                    ? 'bg-green-50 text-green-700' 
                                    : category.margin > 15 
                                    ? 'bg-blue-50 text-blue-700' 
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {category.margin.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setSelectedCategoryId(category.categoryId)}
                                disabled={!category.categoryId}
                              >
                                <Eye className='h-4 w-4' />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={8} className='text-center text-muted-foreground py-8'>
                            {t('No category data available')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Brand View */}
        {activeView === 'brands' && (
          <>
            {/* Brand Summary */}
            <div className='grid gap-4 md:grid-cols-4'>
              <Card className={kpiCardClass('purple')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Brands')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{brandData?.length || 0}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Active product brands')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('emerald')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Revenue')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold'>{formatCurrency(totalBrandRevenue)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Across all brands')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('green')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('Total Profit')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-green-600'>{formatCurrency(totalBrandProfit)}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Brand profit')}</p>
                </CardContent>
              </Card>
              <Card className={kpiCardClass('indigo')}>
                <CardHeader>
                  <CardTitle className='text-sm'>{t('IMEI Brands')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className='text-2xl font-bold text-indigo-600'>{imeiBrandsCount}</div>
                  <p className='text-xs text-muted-foreground mt-1'>{t('Brands with IMEI tracking')}</p>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className='flex items-center gap-2'>
                  <Tag className='h-5 w-5 text-purple-600' />
                  {t('Sales by Brand')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {brandLoading ? (
                  <Skeleton className='h-[300px]' />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Brand')}</TableHead>
                        <TableHead className='text-center'>{t('Type')}</TableHead>
                        <TableHead className='text-right'>{t('Products')}</TableHead>
                        <TableHead className='text-right'>{t('Quantity Sold')}</TableHead>
                        <TableHead className='text-right'>{t('Revenue')}</TableHead>
                        <TableHead className='text-right'>{t('Cost')}</TableHead>
                        <TableHead className='text-right'>{t('Profit')}</TableHead>
                        <TableHead className='text-right'>{t('Margin')}</TableHead>
                        <TableHead className='text-right'>{t('Actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {brandData && brandData.length > 0 ? (
                        brandData.map((brand) => (
                          <TableRow key={brand.brandId || brand.brandName}>
                            <TableCell className='font-medium'>
                              <div className='flex items-center gap-2'>
                                {brand.brandLogo?.url ? (
                                  <img 
                                    src={brand.brandLogo.url} 
                                    alt={brand.brandName} 
                                    className='h-6 w-6 rounded object-cover'
                                  />
                                ) : (
                                  <Tag className='h-4 w-4 text-purple-600' />
                                )}
                                {brand.brandName}
                              </div>
                            </TableCell>
                            <TableCell className='text-center'>
                              {brand.hasImeiProducts && (
                                <Badge variant='secondary' className='text-xs'>
                                  <Smartphone className='h-3 w-3 mr-1' />
                                  {t('IMEI')}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className='text-right'>{brand.productCount}</TableCell>
                            <TableCell className='text-right'>{brand.totalQuantity}</TableCell>
                            <TableCell className='text-right font-semibold'>
                              {formatCurrency(brand.totalRevenue)}
                            </TableCell>
                            <TableCell className='text-right text-orange-600'>
                              {formatCurrency(brand.totalCost)}
                            </TableCell>
                            <TableCell className='text-right text-green-600 font-medium'>
                              {formatCurrency(brand.profit)}
                            </TableCell>
                            <TableCell className='text-right'>
                              <Badge 
                                variant='outline' 
                                className={`${
                                  brand.margin > 30 
                                    ? 'bg-green-50 text-green-700' 
                                    : brand.margin > 15 
                                    ? 'bg-blue-50 text-blue-700' 
                                    : 'bg-amber-50 text-amber-700'
                                }`}
                              >
                                {brand.margin.toFixed(1)}%
                              </Badge>
                            </TableCell>
                            <TableCell className='text-right'>
                              <Button
                                variant='ghost'
                                size='sm'
                                onClick={() => setSelectedBrandId(brand.brandId)}
                                disabled={!brand.brandId}
                              >
                                <Eye className='h-4 w-4' />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={9} className='text-center text-muted-foreground py-8'>
                            {t('No brand data available')}
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Category Products Dialog */}
        <Dialog open={!!selectedCategoryId} onOpenChange={(open) => !open && setSelectedCategoryId(null)}>
          <DialogContent className='max-w-[96vw] w-full max-h-[92vh]'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Layers className='h-5 w-5 text-blue-600' />
                {t('Products in Category')}
              </DialogTitle>
              <DialogDescription>
                {categoryData?.find(c => c.categoryId === selectedCategoryId)?.categoryName}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 max-h-[calc(90vh-180px)] overflow-y-auto px-1'>
              {categoryProductsLoading ? (
                <Skeleton className='h-[400px]' />
              ) : categoryProducts && categoryProducts.length > 0 ? (
                <>
                  <div className='text-sm text-muted-foreground'>
                    {t('Showing')} {categoryProducts.length} {t('transaction(s)')}
                  </div>
                  <div className='w-full'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-[100px]'>{t('Invoice')}</TableHead>
                          <TableHead className='w-[90px]'>{t('Date')}</TableHead>
                          <TableHead className='w-[140px]'>{t('Customer')}</TableHead>
                          <TableHead>{t('Product')}</TableHead>
                          <TableHead className='text-center w-[60px]'>{t('Type')}</TableHead>
                          <TableHead className='text-right w-[60px]'>{t('Qty')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Price')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Revenue')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Cost')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Profit')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {categoryProducts.map((item, index) => (
                          <TableRow key={`${item.invoiceId}-${item.productId}-${index}`}>
                            <TableCell className='font-medium text-xs'>
                              {item.invoiceNo}
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {format(new Date(item.invoiceDate), 'MMM dd')}
                            </TableCell>
                            <TableCell className='text-xs truncate max-w-[140px]' title={item.customerName}>
                              {item.customerName}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-2'>
                                {item.productImage?.url && (
                                  <img 
                                    src={item.productImage.url} 
                                    alt={item.productName} 
                                    className='h-6 w-6 rounded object-cover flex-shrink-0'
                                  />
                                )}
                                <span className='text-xs truncate' title={item.productName}>
                                  {item.productName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className='text-center'>
                              {item.trackImei && (
                                <Badge variant='secondary' className='text-[10px] px-1 py-0'>
                                  <Smartphone className='h-2.5 w-2.5' />
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className='text-right text-xs'>{item.quantity}</TableCell>
                            <TableCell className='text-right text-xs'>{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className='text-right text-xs font-semibold'>
                              {formatCurrency(item.revenue)}
                            </TableCell>
                            <TableCell className='text-right text-xs text-orange-600'>
                              {formatCurrency(item.cost)}
                            </TableCell>
                            <TableCell className='text-right text-xs text-green-600 font-medium'>
                              {formatCurrency(item.profit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Summary Row */}
                  <div className='border-t pt-4 mt-4'>
                    <div className='grid grid-cols-3 gap-3'>
                      <Card className={kpiCardClass('emerald')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Revenue')}</div>
                          <div className='text-lg font-bold'>
                            {formatCurrency(categoryProducts.reduce((sum, item) => sum + item.revenue, 0))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className={kpiCardClass('orange')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Cost')}</div>
                          <div className='text-lg font-bold text-orange-600'>
                            {formatCurrency(categoryProducts.reduce((sum, item) => sum + item.cost, 0))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className={kpiCardClass('green')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Profit')}</div>
                          <div className='text-lg font-bold text-green-600'>
                            {formatCurrency(categoryProducts.reduce((sum, item) => sum + item.profit, 0))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              ) : (
                <div className='text-center py-8 text-muted-foreground'>
                  {t('No products found in this category')}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* Brand Products Dialog */}
        <Dialog open={!!selectedBrandId} onOpenChange={(open) => !open && setSelectedBrandId(null)}>
          <DialogContent className='max-w-[96vw] w-full max-h-[92vh]'>
            <DialogHeader>
              <DialogTitle className='flex items-center gap-2'>
                <Tag className='h-5 w-5 text-purple-600' />
                {t('Products by Brand')}
              </DialogTitle>
              <DialogDescription>
                {brandData?.find(b => b.brandId === selectedBrandId)?.brandName}
              </DialogDescription>
            </DialogHeader>
            <div className='space-y-4 max-h-[calc(90vh-180px)] overflow-y-auto px-1'>
              {brandProductsLoading ? (
                <Skeleton className='h-[400px]' />
              ) : brandProducts && brandProducts.length > 0 ? (
                <>
                  <div className='text-sm text-muted-foreground'>
                    {t('Showing')} {brandProducts.length} {t('transaction(s)')}
                  </div>
                  <div className='w-full'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='w-[100px]'>{t('Invoice')}</TableHead>
                          <TableHead className='w-[90px]'>{t('Date')}</TableHead>
                          <TableHead className='w-[140px]'>{t('Customer')}</TableHead>
                          <TableHead>{t('Product')}</TableHead>
                          <TableHead className='text-center w-[60px]'>{t('Type')}</TableHead>
                          <TableHead className='text-right w-[60px]'>{t('Qty')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Price')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Revenue')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Cost')}</TableHead>
                          <TableHead className='text-right w-[100px]'>{t('Profit')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {brandProducts.map((item, index) => (
                          <TableRow key={`${item.invoiceId}-${item.productId}-${index}`}>
                            <TableCell className='font-medium text-xs'>
                              {item.invoiceNo}
                            </TableCell>
                            <TableCell className='text-xs text-muted-foreground'>
                              {format(new Date(item.invoiceDate), 'MMM dd')}
                            </TableCell>
                            <TableCell className='text-xs truncate max-w-[140px]' title={item.customerName}>
                              {item.customerName}
                            </TableCell>
                            <TableCell>
                              <div className='flex items-center gap-2'>
                                {item.productImage?.url && (
                                  <img 
                                    src={item.productImage.url} 
                                    alt={item.productName} 
                                    className='h-6 w-6 rounded object-cover flex-shrink-0'
                                  />
                                )}
                                <span className='text-xs truncate' title={item.productName}>
                                  {item.productName}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell className='text-center'>
                              {item.trackImei && (
                                <Badge variant='secondary' className='text-[10px] px-1 py-0'>
                                  <Smartphone className='h-2.5 w-2.5' />
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className='text-right text-xs'>{item.quantity}</TableCell>
                            <TableCell className='text-right text-xs'>{formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className='text-right text-xs font-semibold'>
                              {formatCurrency(item.revenue)}
                            </TableCell>
                            <TableCell className='text-right text-xs text-orange-600'>
                              {formatCurrency(item.cost)}
                            </TableCell>
                            <TableCell className='text-right text-xs text-green-600 font-medium'>
                              {formatCurrency(item.profit)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  {/* Summary Row */}
                  <div className='border-t pt-4 mt-4'>
                    <div className='grid grid-cols-3 gap-3'>
                      <Card className={kpiCardClass('emerald')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Revenue')}</div>
                          <div className='text-lg font-bold'>
                            {formatCurrency(brandProducts.reduce((sum, item) => sum + item.revenue, 0))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className={kpiCardClass('orange')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Cost')}</div>
                          <div className='text-lg font-bold text-orange-600'>
                            {formatCurrency(brandProducts.reduce((sum, item) => sum + item.cost, 0))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card className={kpiCardClass('green')}>
                        <CardContent className='pt-3 pb-3'>
                          <div className='text-xs text-muted-foreground'>{t('Total Profit')}</div>
                          <div className='text-lg font-bold text-green-600'>
                            {formatCurrency(brandProducts.reduce((sum, item) => sum + item.profit, 0))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                </>
              ) : (
                <div className='text-center py-8 text-muted-foreground'>
                  {t('No products found for this brand')}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>

        <ProductDetailDialog
          productId={selectedProductId}
          startDate={startDate}
          endDate={endDate}
          onClose={() => setSelectedProductId(null)}
        />
      </div>
    )
  }
)

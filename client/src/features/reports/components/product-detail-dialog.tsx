import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetProductDetailReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Users, Package } from 'lucide-react'

interface ProductDetailDialogProps {
  productId: string | null
  startDate: string
  endDate: string
  onClose: () => void
}

export function ProductDetailDialog({ productId, startDate, endDate, onClose }: ProductDetailDialogProps) {
  const { t } = useLanguage()
  const { data, isLoading } = useGetProductDetailReportQuery(
    { productId: productId!, startDate, endDate },
    { skip: !productId }
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  if (!productId) return null

  return (
    <Dialog open={!!productId} onOpenChange={onClose}>
      <DialogContent className='min-w-[1200px] max-h-[90vh] overflow-y-auto'>
        <DialogHeader>
          <DialogTitle>{t('Product Details')}</DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <Skeleton className='h-[400px] w-full' />
        ) : data ? (
          <div className='space-y-4'>
            {/* Product Info */}
            <div className='bg-muted/50 p-4 rounded-lg'>
              <h3 className='font-semibold text-lg mb-3'>{data?.product?.name}</h3>
              <div className='grid grid-cols-2 md:grid-cols-4 gap-4'>
                <div>
                  <p className='text-xs text-muted-foreground mb-1'>{t('barcode')}</p>
                  <p className='font-medium'>{data?.product?.barcode || 'N/A'}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground mb-1'>{t('current_stock')}</p>
                  <p className='font-medium'>{data?.product?.currentStock || 0}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground mb-1'>{t('Purchase Price')}</p>
                  <p className='font-medium'>{formatCurrency(data?.product?.purchasePrice || 0)}</p>
                </div>
                <div>
                  <p className='text-xs text-muted-foreground mb-1'>{t('Selling Price')}</p>
                  <p className='font-medium'>{formatCurrency(data?.product?.sellingPrice || 0)}</p>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className='grid gap-3 grid-cols-2 md:grid-cols-4'>
              <div className='bg-green-50 dark:bg-green-950 p-3 rounded-lg border'>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{t('Total Sold')}</p>
                  <TrendingUp className='h-4 w-4 text-green-600' />
                </div>
                <p className='text-2xl font-bold'>{data?.summary?.totalSold || 0}</p>
                <p className='text-xs text-muted-foreground mt-1'>
                  to {data?.summary?.uniqueCustomers || 0} {t('customers')}
                </p>
              </div>

              <div className='bg-blue-50 dark:bg-blue-950 p-3 rounded-lg border'>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{t('Total Purchased')}</p>
                  <TrendingDown className='h-4 w-4 text-blue-600' />
                </div>
                <p className='text-2xl font-bold'>{data?.summary?.totalPurchased || 0}</p>
                <p className='text-xs text-muted-foreground mt-1'>
                  from {data?.summary?.uniqueSuppliers || 0} {t('suppliers')}
                </p>
              </div>

              <div className='bg-emerald-50 dark:bg-emerald-950 p-3 rounded-lg border'>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{t('Total Revenue')}</p>
                  <Package className='h-4 w-4 text-emerald-600' />
                </div>
                <p className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalRevenue || 0)}</p>
                <p className='text-xs text-green-600 mt-1'>
                  {t('Profit')}: {formatCurrency(data?.summary?.totalProfit || 0)}
                </p>
              </div>

              <div className='bg-orange-50 dark:bg-orange-950 p-3 rounded-lg border'>
                <div className='flex items-center justify-between mb-2'>
                  <p className='text-xs font-medium text-muted-foreground'>{t('Total Cost')}</p>
                  <Users className='h-4 w-4 text-orange-600' />
                </div>
                <p className='text-2xl font-bold'>{formatCurrency(data?.summary?.totalCost || 0)}</p>
              </div>
            </div>

            {/* Sales and Purchases Tabs */}
            <Tabs defaultValue='sales'>
              <TabsList className='grid w-full grid-cols-2'>
                <TabsTrigger value='sales'>
                  {t('Sale To Customers')} ({data?.sales?.length || 0})
                </TabsTrigger>
                <TabsTrigger value='purchases'>
                  {t('Purchase From Suppliers')} ({data?.purchases?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value='sales' className='mt-4'>
                <div className='border rounded-lg overflow-hidden'>
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='min-w-[100px]'>{t('date')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('invoice_no')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('customer')}</TableHead>
                          {/* <TableHead className='min-w-[100px]'>{t('phone')}</TableHead> */}
                          <TableHead className='text-right min-w-[80px]'>{t('quantity')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('price')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('amount')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('profit')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.sales && data.sales.length > 0 ? (
                          data.sales.map((sale: any) => (
                            <TableRow key={sale._id}>
                              <TableCell className='whitespace-nowrap'>{format(new Date(sale.date), 'MMM dd, yyyy')}</TableCell>
                              <TableCell>
                                <Badge variant='outline'>{sale.invoiceNumber}</Badge>
                              </TableCell>
                              <TableCell className='font-medium'>{sale.customerName}</TableCell>
                              {/* <TableCell>{sale.customerPhone || 'N/A'}</TableCell> */}
                              <TableCell className='text-right'>{sale.quantity}</TableCell>
                              <TableCell className='text-right'>{formatCurrency(sale.price)}</TableCell>
                              <TableCell className='text-right font-medium'>{formatCurrency(sale.subtotal)}</TableCell>
                              <TableCell className='text-right text-green-600 font-medium'>
                                {formatCurrency(sale.profit || 0)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={8} className='text-center py-8 text-muted-foreground'>
                              {t('no_sales_found')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value='purchases' className='mt-4'>
                <div className='border rounded-lg overflow-hidden'>
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='min-w-[100px]'>{t('date')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('purchase_no')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('supplier')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('phone')}</TableHead>
                          <TableHead className='text-right min-w-[80px]'>{t('quantity')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('price')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('amount')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data?.purchases && data.purchases.length > 0 ? (
                          data.purchases.map((purchase: any) => (
                            <TableRow key={purchase._id}>
                              <TableCell className='whitespace-nowrap'>{format(new Date(purchase.date), 'MMM dd, yyyy')}</TableCell>
                              <TableCell>
                                <Badge variant='outline'>{purchase.purchaseNumber}</Badge>
                              </TableCell>
                              <TableCell className='font-medium'>{purchase.supplierName}</TableCell>
                              <TableCell>{purchase.supplierPhone || 'N/A'}</TableCell>
                              <TableCell className='text-right'>{purchase.quantity}</TableCell>
                              <TableCell className='text-right'>{formatCurrency(purchase.price)}</TableCell>
                              <TableCell className='text-right font-medium'>{formatCurrency(purchase.subtotal)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className='text-center py-8 text-muted-foreground'>
                              {t('no_purchases_found')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <div className='text-center py-8 text-muted-foreground'>
            No data available
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

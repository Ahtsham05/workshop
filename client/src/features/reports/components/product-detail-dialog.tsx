import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
// import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useGetProductDetailReportQuery, useGetStockAdjustmentReportQuery, useGetStockTransferReportQuery } from '@/stores/reports.api'
import { useLanguage } from '@/context/language-context'
import { format } from 'date-fns'
import { Badge } from '@/components/ui/badge'
import { Boxes, ArrowDownToLine, ArrowUpFromLine, Wallet, Receipt } from 'lucide-react'
import { getUnitLabel } from '@/lib/units'
import { reportEntityName, reportEntityNameClass } from '../utils/report-entity-name'
import { expiryBadge } from '../utils/expiry-badge'
import { cn } from '@/lib/utils'
import { AdjustmentTypeBadge } from '@/features/stock-adjustments/components/adjustment-type-badge'
import { TransferStatusBadge } from '@/features/stock-transfer/components/transfer-status-badge'
import { MovementTile } from './movement-tile'
import { formatImeiEntries } from '@/stores/imei.api'

interface ProductDetailDialogProps {
  productId: string | null
  startDate: string
  endDate: string
  onClose: () => void
}

export function ProductDetailDialog({ productId, startDate, endDate, onClose }: ProductDetailDialogProps) {
  const { t, language } = useLanguage()
  const { data, isFetching: isLoading } = useGetProductDetailReportQuery(
    { productId: productId!, startDate, endDate },
    { skip: !productId }
  )
  const { data: adjustmentsData } = useGetStockAdjustmentReportQuery(
    { productId: productId!, startDate, endDate },
    { skip: !productId }
  )
  const { data: transfersData } = useGetStockTransferReportQuery(
    { productId: productId!, startDate, endDate },
    { skip: !productId }
  )

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR' }).format(value)

  if (!productId) return null

  return (
    <Dialog open={!!productId} onOpenChange={onClose}>
      <DialogContent
        className={cn(
          'flex max-h-[92vh] w-[min(96vw,1400px)] max-w-[min(96vw,1400px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[min(96vw,1400px)]',
        )}
      >
        <div className='shrink-0 border-b px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4'>
          <DialogHeader>
            <DialogTitle>{t('Product Details')}</DialogTitle>
          </DialogHeader>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 sm:pb-6 sm:pt-4'>
        {isLoading ? (
          <Skeleton className='h-[400px] w-full' />
        ) : data ? (
          <div className='space-y-4'>
            {/* Product Info */}
            <div className='bg-muted/50 p-4 rounded-lg'>
              <h3
                className={cn(
                  'font-semibold text-lg mb-3',
                  reportEntityNameClass(language, reportEntityName(language, data?.product?.name, data?.product?.nameUrdu)),
                )}
              >
                {reportEntityName(language, data?.product?.name, data?.product?.nameUrdu)}
              </h3>
              <div className='grid grid-cols-2 md:grid-cols-3 gap-4'>
                <div>
                  <p className='text-xs text-muted-foreground mb-1'>{t('barcode')}</p>
                  <p className='font-medium'>{data?.product?.barcode || 'N/A'}</p>
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

            {/* Stock Movement — every quantity that moved this product's stock in the
                selected period, plus where it currently stands. Adjustments only ever
                include 'completed' ones (see getStockAdjustmentReport); transfers are
                filtered to 'completed' here too so an in-transit or cancelled transfer
                — which never actually touched this branch's stock — doesn't inflate the
                in/out totals, even though the Stock Transfers tab below still lists it. */}
            {(() => {
              const completedTransfers = (transfersData?.lineItems ?? []).filter((tr) => tr.status === 'completed')
              const transferIn = completedTransfers
                .filter((tr) => tr.productDirection === 'in')
                .reduce((sum, tr) => sum + tr.quantity, 0)
              const transferOut = completedTransfers
                .filter((tr) => tr.productDirection === 'out')
                .reduce((sum, tr) => sum + tr.quantity, 0)
              const adjustmentIn = (adjustmentsData?.lineItems ?? [])
                .filter((adj) => adj.direction === 'increase')
                .reduce((sum, adj) => sum + adj.quantity, 0)
              const adjustmentOut = (adjustmentsData?.lineItems ?? [])
                .filter((adj) => adj.direction === 'decrease')
                .reduce((sum, adj) => sum + adj.quantity, 0)

              return (
                <div>
                  <h4 className='text-sm font-semibold text-muted-foreground mb-2'>{t('Stock Movement')}</h4>
                  <div className='grid gap-3 grid-cols-2 sm:grid-cols-4 lg:grid-cols-7'>
                    <MovementTile
                      icon={Boxes}
                      tone='slate'
                      label={t('Current Stock')}
                      value={String(data?.product?.currentStock || 0)}
                    />
                    <MovementTile
                      icon={ArrowDownToLine}
                      tone='sky'
                      label={t('Purchased')}
                      value={String(data?.summary?.totalPurchased || 0)}
                      sub={`${t('from')} ${data?.summary?.uniqueSuppliers || 0} ${t('suppliers')}`}
                    />
                    <MovementTile
                      icon={ArrowUpFromLine}
                      tone='emerald'
                      label={t('Sold')}
                      value={String(data?.summary?.totalSold || 0)}
                      sub={`${t('to')} ${data?.summary?.uniqueCustomers || 0} ${t('customers')}`}
                    />
                    <MovementTile icon={ArrowDownToLine} tone='cyan' label={t('Adjustment In')} value={String(adjustmentIn)} />
                    <MovementTile icon={ArrowUpFromLine} tone='rose' label={t('Adjustment Out')} value={String(adjustmentOut)} />
                    <MovementTile icon={ArrowDownToLine} tone='indigo' label={t('Transfer In')} value={String(transferIn)} />
                    <MovementTile icon={ArrowUpFromLine} tone='amber' label={t('Transfer Out')} value={String(transferOut)} />
                  </div>
                </div>
              )
            })()}

            {/* Financial Summary */}
            <div>
              <h4 className='text-sm font-semibold text-muted-foreground mb-2'>{t('Financial Summary')}</h4>
              <div className='grid gap-3 grid-cols-1 sm:grid-cols-2'>
                <MovementTile
                  icon={Wallet}
                  tone='emerald'
                  label={t('Total Revenue')}
                  value={formatCurrency(data?.summary?.totalRevenue || 0)}
                  sub={`${t('Profit')}: ${formatCurrency(data?.summary?.totalProfit || 0)}`}
                />
                <MovementTile
                  icon={Receipt}
                  tone='orange'
                  label={t('Total Cost')}
                  value={formatCurrency(data?.summary?.totalCost || 0)}
                />
              </div>
            </div>

            {/* Sales and Purchases Tabs — a fixed 4-column grid squeezed these labels
                into overlapping, unreadable text on narrow screens (each cell forced to
                ~1/4 the dialog's width regardless of how long its label was). A
                horizontally scrollable row lets each tab keep its natural width and
                just scrolls instead of wrapping/clipping. */}
            <Tabs defaultValue='sales'>
              <TabsList className='flex w-full justify-start overflow-x-auto'>
                <TabsTrigger value='sales' className='shrink-0'>
                  <span className='sm:hidden'>{t('Sales')}</span>
                  <span className='hidden sm:inline'>{t('Sale To Customers')}</span> ({data?.sales?.length || 0})
                </TabsTrigger>
                <TabsTrigger value='purchases' className='shrink-0'>
                  <span className='sm:hidden'>{t('Purchases')}</span>
                  <span className='hidden sm:inline'>{t('Purchase From Suppliers')}</span> ({data?.purchases?.length || 0})
                </TabsTrigger>
                <TabsTrigger value='adjustments' className='shrink-0'>
                  {t('Stock Adjustments')} ({adjustmentsData?.lineItems?.length || 0})
                </TabsTrigger>
                <TabsTrigger value='transfers' className='shrink-0'>
                  {t('Stock Transfers')} ({transfersData?.lineItems?.length || 0})
                </TabsTrigger>
              </TabsList>

              <TabsContent value='sales' className='mt-4'>
                <div className='border rounded-lg overflow-hidden'>
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='min-w-[100px]'>{t('date')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('Invoice#')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('customer')}</TableHead>
                          {/* <TableHead className='min-w-[100px]'>{t('phone')}</TableHead> */}
                          <TableHead className='min-w-[100px]'>Variant</TableHead>
                          <TableHead className='min-w-[100px]'>Batch #</TableHead>
                          <TableHead className='min-w-[100px]'>Expiry</TableHead>
                          <TableHead className='min-w-[150px]'>{t('IMEI/Serial')}</TableHead>
                          <TableHead className='text-right min-w-[80px]'>{t('Quantity')}</TableHead>
                          <TableHead className='min-w-[60px]'>{t('Unit')}</TableHead>
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
                              <TableCell
                                className={cn(
                                  'font-medium',
                                  reportEntityNameClass(
                                    language,
                                    reportEntityName(language, sale.customerName, sale.customerNameUrdu),
                                  ),
                                )}
                              >
                                {reportEntityName(language, sale.customerName, sale.customerNameUrdu)}
                              </TableCell>
                              {/* <TableCell>{sale.customerPhone || 'N/A'}</TableCell> */}
                              <TableCell className='text-muted-foreground text-sm'>{sale.variantLabel || '—'}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground'>
                                {Array.isArray(sale.batchAllocations) && sale.batchAllocations.length > 1
                                  ? sale.batchAllocations.map((a: any) => `${a.batchNumber}×${a.quantity}`).join(', ')
                                  : sale.batchNumber || '—'}
                              </TableCell>
                              <TableCell>{expiryBadge(sale.expiryDate)}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground max-w-[180px] truncate' title={formatImeiEntries(sale.imeis)}>
                                {sale.imeis && sale.imeis.length > 0 ? formatImeiEntries(sale.imeis) : '—'}
                              </TableCell>
                              <TableCell className='text-right'>{sale.quantity}</TableCell>
                              <TableCell className='text-muted-foreground text-sm'>{getUnitLabel(sale.unit)}</TableCell>
                              <TableCell className='text-right'>{formatCurrency(sale.price)}</TableCell>
                              <TableCell className='text-right font-medium'>{formatCurrency(sale.subtotal)}</TableCell>
                              <TableCell className='text-right text-green-600 font-medium'>
                                {formatCurrency(sale.profit || 0)}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={13} className='text-center py-8 text-muted-foreground'>
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
                          <TableHead className='min-w-[100px]'>Variant</TableHead>
                          <TableHead className='min-w-[100px]'>Batch #</TableHead>
                          <TableHead className='min-w-[100px]'>Expiry</TableHead>
                          <TableHead className='min-w-[150px]'>{t('IMEI/Serial')}</TableHead>
                          <TableHead className='text-right min-w-[80px]'>{t('quantity')}</TableHead>
                          <TableHead className='min-w-[60px]'>{t('unit')}</TableHead>
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
                              <TableCell
                                className={cn(
                                  'font-medium',
                                  reportEntityNameClass(
                                    language,
                                    reportEntityName(language, purchase.supplierName, purchase.supplierNameUrdu),
                                  ),
                                )}
                              >
                                {reportEntityName(language, purchase.supplierName, purchase.supplierNameUrdu)}
                              </TableCell>
                              <TableCell>{purchase.supplierPhone || 'N/A'}</TableCell>
                              <TableCell className='text-muted-foreground text-sm'>{purchase.variantLabel || '—'}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground'>{purchase.batchNumber || '—'}</TableCell>
                              <TableCell>{expiryBadge(purchase.expiryDate)}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground max-w-[180px] truncate' title={formatImeiEntries(purchase.imeis)}>
                                {purchase.imeis && purchase.imeis.length > 0 ? formatImeiEntries(purchase.imeis) : '—'}
                              </TableCell>
                              <TableCell className='text-right'>{purchase.quantity}</TableCell>
                              <TableCell className='text-muted-foreground text-sm'>{getUnitLabel(purchase.unit)}</TableCell>
                              <TableCell className='text-right'>{formatCurrency(purchase.price)}</TableCell>
                              <TableCell className='text-right font-medium'>{formatCurrency(purchase.subtotal)}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={12} className='text-center py-8 text-muted-foreground'>
                              {t('no_purchases_found')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value='adjustments' className='mt-4'>
                <div className='border rounded-lg overflow-hidden'>
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='min-w-[100px]'>{t('date')}</TableHead>
                          <TableHead className='min-w-[120px]'>{t('Type')}</TableHead>
                          <TableHead className='min-w-[100px]'>Variant</TableHead>
                          <TableHead className='min-w-[100px]'>Batch #</TableHead>
                          <TableHead className='min-w-[100px]'>Expiry</TableHead>
                          <TableHead className='min-w-[150px]'>{t('IMEI/Serial')}</TableHead>
                          <TableHead className='text-right min-w-[80px]'>Qty</TableHead>
                          <TableHead className='text-right min-w-[120px]'>{t('Stock')}</TableHead>
                          <TableHead className='text-right min-w-[100px]'>{t('value')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('Reason')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('By')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {adjustmentsData?.lineItems && adjustmentsData.lineItems.length > 0 ? (
                          adjustmentsData.lineItems.map((adj) => (
                            <TableRow key={adj.id}>
                              <TableCell className='whitespace-nowrap'>{format(new Date(adj.date), 'MMM dd, yyyy')}</TableCell>
                              <TableCell>
                                <AdjustmentTypeBadge type={adj.type} />
                              </TableCell>
                              <TableCell className='text-muted-foreground text-sm'>{adj.variantLabel || '—'}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground'>{adj.batchNumber || '—'}</TableCell>
                              <TableCell>{adj.expiryDate ? expiryBadge(adj.expiryDate) : '—'}</TableCell>
                              <TableCell
                                className='max-w-[180px] truncate font-mono text-xs text-muted-foreground'
                                title={(adj.imeis || []).join(', ')}
                              >
                                {adj.imeis && adj.imeis.length > 0 ? adj.imeis.join(', ') : '—'}
                              </TableCell>
                              <TableCell
                                className={cn(
                                  'text-right font-medium',
                                  adj.direction === 'increase' ? 'text-emerald-600' : 'text-rose-600'
                                )}
                              >
                                {adj.direction === 'increase' ? '+' : '−'}
                                {adj.quantity}
                              </TableCell>
                              <TableCell className='text-right text-sm text-muted-foreground whitespace-nowrap'>
                                {adj.previousQuantity} → {adj.newQuantity}
                              </TableCell>
                              <TableCell className='text-right'>{adj.totalValue ? formatCurrency(adj.totalValue) : '—'}</TableCell>
                              <TableCell className='text-sm text-muted-foreground max-w-[200px] truncate' title={adj.reason}>
                                {adj.reason || '—'}
                              </TableCell>
                              <TableCell className='text-sm text-muted-foreground'>{adj.createdByName || '—'}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={11} className='text-center py-8 text-muted-foreground'>
                              {t('No stock adjustments found for the selected period')}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value='transfers' className='mt-4'>
                <div className='border rounded-lg overflow-hidden'>
                  <div className='overflow-x-auto'>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className='min-w-[100px]'>{t('date')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('From')}</TableHead>
                          <TableHead className='min-w-[150px]'>{t('To')}</TableHead>
                          <TableHead className='text-right min-w-[80px]'>Qty</TableHead>
                          <TableHead className='min-w-[150px]'>{t('IMEI/Serial')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('Status')}</TableHead>
                          <TableHead className='min-w-[100px]'>{t('By')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {transfersData?.lineItems && transfersData.lineItems.length > 0 ? (
                          transfersData.lineItems.map((tr) => (
                            <TableRow key={tr.id}>
                              <TableCell className='whitespace-nowrap'>{format(new Date(tr.date), 'MMM dd, yyyy')}</TableCell>
                              <TableCell className='text-sm text-muted-foreground'>{tr.fromBranchName || '—'}</TableCell>
                              <TableCell className='text-sm text-muted-foreground'>{tr.toBranchName || '—'}</TableCell>
                              <TableCell className='text-right font-medium'>{tr.quantity}</TableCell>
                              <TableCell className='font-mono text-xs text-muted-foreground max-w-[200px] truncate' title={tr.imeis.join(', ')}>
                                {tr.imeis.length > 0 ? tr.imeis.join(', ') : '—'}
                              </TableCell>
                              <TableCell>
                                <TransferStatusBadge status={tr.status} />
                              </TableCell>
                              <TableCell className='text-sm text-muted-foreground'>{tr.decidedByName || '—'}</TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={7} className='text-center py-8 text-muted-foreground'>
                              {t('No stock transfers found for the selected period')}
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
        </div>
      </DialogContent>
    </Dialog>
  )
}

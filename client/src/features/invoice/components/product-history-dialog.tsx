import { useEffect } from 'react'
import { format } from 'date-fns'
import { History, TrendingUp, TrendingDown, Minus, Calendar, DollarSign, Package, FileText } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useLanguage } from '@/context/language-context'
import { useGetCustomerProductHistoryQuery } from '@/stores/invoice.api'
import { Loader2 } from 'lucide-react'
import { getTextClasses } from '@/utils/urdu-text-utils'

interface ProductHistoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  customerId: string
  productId: string
  productName: string
  customerName: string
  currentPrice: number
}

export function ProductHistoryDialog({
  open,
  onOpenChange,
  customerId,
  productId,
  productName,
  customerName,
  currentPrice,
}: ProductHistoryDialogProps) {
  const { t } = useLanguage()

  // Fetch product history
  const { data: historyData, isLoading, error, refetch } = useGetCustomerProductHistoryQuery(
    { customerId, productId },
    { skip: !open || !customerId || !productId || customerId === 'walk-in' }
  )

  // Refetch when dialog opens
  useEffect(() => {
    if (open && customerId && productId && customerId !== 'walk-in') {
      refetch()
    }
  }, [open, customerId, productId, refetch])

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PK', {
      style: 'currency',
      currency: 'PKR',
    }).format(amount)
  }

  const getPriceTrend = (lastPrice: number, currentPrice: number) => {
    if (lastPrice === currentPrice) {
      return { icon: Minus, color: 'text-gray-500', text: t('same_price') }
    } else if (lastPrice < currentPrice) {
      const increase = ((currentPrice - lastPrice) / lastPrice) * 100
      return { 
        icon: TrendingUp, 
        color: 'text-red-500', 
        text: `+${increase.toFixed(1)}% ${t('increase')}` 
      }
    } else {
      const decrease = ((lastPrice - currentPrice) / lastPrice) * 100
      return { 
        icon: TrendingDown, 
        color: 'text-green-500', 
        text: `-${decrease.toFixed(1)}% ${t('decrease')}` 
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            {t('product_price_history')}
          </DialogTitle>
          <DialogDescription>
            {t('customer')}: <span className={getTextClasses(customerName, "font-semibold")}>{customerName}</span>
            <br />
            {t('product')}: <span className={getTextClasses(productName, "font-semibold")}>{productName}</span>
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('loading_history')}</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-600">{t('error_loading_history')}</p>
          </div>
        ) : !historyData || historyData.history?.length === 0 ? (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">{t('no_purchase_history')}</p>
            <p className="text-sm text-muted-foreground mt-2">
              {t('this_is_first_purchase')}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Summary Card */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted rounded-lg">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('last_price')}</p>
                <p className="text-lg font-bold">{formatCurrency(historyData.lastPrice || 0)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('current_price')}</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(currentPrice)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('total_quantity')}</p>
                <p className="text-lg font-bold">{historyData.totalQuantity || 0}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-1">{t('total_invoices')}</p>
                <p className="text-lg font-bold">{historyData.history?.length || 0}</p>
              </div>
            </div>

            {/* Price Trend */}
            {historyData.lastPrice && (
              <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                {(() => {
                  const trend = getPriceTrend(historyData.lastPrice, currentPrice)
                  const TrendIcon = trend.icon
                  return (
                    <>
                      <TrendIcon className={`h-5 w-5 ${trend.color}`} />
                      <span className={`font-medium ${trend.color}`}>{trend.text}</span>
                      <span className="text-sm text-muted-foreground ml-auto">
                        {t('compared_to_last_purchase')}
                      </span>
                    </>
                  )
                })()}
              </div>
            )}

            <Separator />

            {/* History List */}
            <div>
              <h4 className="font-semibold mb-3">{t('purchase_history')}</h4>
              <ScrollArea className="h-[300px] pr-4">
                <div className="space-y-3">
                  {historyData.history?.map((item: any, index: number) => (
                    <div
                      key={item._id || index}
                      className="p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{item.invoiceNumber}</span>
                          {index === 0 && (
                            <Badge variant="secondary" className="text-xs">
                              {t('latest')}
                            </Badge>
                          )}
                        </div>
                        <Badge 
                          variant={
                            item.type === 'cash' ? 'default' : 
                            item.type === 'credit' ? 'secondary' : 
                            'outline'
                          }
                        >
                          {t(item.type)}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                        <div>
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <Calendar className="h-3 w-3" />
                            <span className="text-xs">{t('date')}</span>
                          </div>
                          <p className="font-medium">
                            {format(new Date(item.date), 'MMM dd, yyyy')}
                          </p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <DollarSign className="h-3 w-3" />
                            <span className="text-xs">{t('unit_price')}</span>
                          </div>
                          <p className="font-medium">{formatCurrency(item.unitPrice)}</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <Package className="h-3 w-3" />
                            <span className="text-xs">{t('quantity')}</span>
                          </div>
                          <p className="font-medium">{item.quantity}</p>
                        </div>

                        <div>
                          <div className="flex items-center gap-1 text-muted-foreground mb-1">
                            <DollarSign className="h-3 w-3" />
                            <span className="text-xs">{t('subtotal')}</span>
                          </div>
                          <p className="font-medium text-primary">
                            {formatCurrency(item.subtotal)}
                          </p>
                        </div>
                      </div>

                      {/* Price comparison with previous */}
                      {index < historyData.history.length - 1 && (
                        <div className="mt-2 pt-2 border-t">
                          {(() => {
                            const prevPrice = historyData.history[index + 1].unitPrice
                            const currentItemPrice = item.unitPrice
                            if (prevPrice !== currentItemPrice) {
                              const diff = currentItemPrice - prevPrice
                              const isIncrease = diff > 0
                              return (
                                <div className="flex items-center gap-1 text-xs">
                                  {isIncrease ? (
                                    <TrendingUp className="h-3 w-3 text-red-500" />
                                  ) : (
                                    <TrendingDown className="h-3 w-3 text-green-500" />
                                  )}
                                  <span className={isIncrease ? 'text-red-500' : 'text-green-500'}>
                                    {formatCurrency(Math.abs(diff))} {isIncrease ? t('more') : t('less')}
                                  </span>
                                  <span className="text-muted-foreground">
                                    {t('than_previous')}
                                  </span>
                                </div>
                              )
                            }
                            return null
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Average Stats */}
            {historyData.avgPrice && (
              <>
                <Separator />
                <div className="grid grid-cols-3 gap-4 p-3 bg-muted rounded-lg text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('average_price')}</p>
                    <p className="font-semibold">{formatCurrency(historyData.avgPrice)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('min_price')}</p>
                    <p className="font-semibold text-green-600">{formatCurrency(historyData.minPrice || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{t('max_price')}</p>
                    <p className="font-semibold text-red-600">{formatCurrency(historyData.maxPrice || 0)}</p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

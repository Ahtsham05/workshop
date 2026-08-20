import { format } from 'date-fns'
import { useGetInvoiceByIdQuery } from '@/stores/invoice.api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { expiryBadge } from '@/features/reports/utils/expiry-badge'
import { useLanguage } from '@/context/language-context'

const STATUS_COLORS: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  draft: 'bg-blue-100 text-blue-800',
  finalized: 'bg-purple-100 text-purple-800',
  cancelled: 'bg-gray-100 text-gray-800',
  refunded: 'bg-red-100 text-red-800',
}

const TYPE_COLORS: Record<string, string> = {
  cash: 'bg-emerald-100 text-emerald-800',
  credit: 'bg-blue-100 text-blue-800',
  pending: 'bg-yellow-100 text-yellow-800',
  quotation: 'bg-violet-100 text-violet-800',
}

const formatDate = (date: unknown) => {
  try {
    if (!date) return '—'
    const dateObj = new Date(date as string)
    if (isNaN(dateObj.getTime())) return '—'
    return format(dateObj, 'MMM dd, yyyy')
  } catch {
    return '—'
  }
}

const formatCurrency = (amount: unknown) => {
  const num = Number(amount)
  return isNaN(num) ? '0.00' : num.toFixed(2)
}

const customerLabel = (invoice: any) => {
  if (invoice.customerId && typeof invoice.customerId === 'object') return invoice.customerId.name
  return invoice.customerName || invoice.walkInCustomerName || 'Walk-in Customer'
}

interface InvoiceDetailDialogProps {
  invoiceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

/**
 * Self-contained "view full invoice" dialog — fetches by id, so any ledger/list that only
 * holds a referenceId can drop this in directly. Mirrors the fields shown by the two
 * accounting-ledger InvoiceDialogContent implementations (customer-ledger-details.tsx,
 * supplier-ledger-details.tsx) plus a payment-status block, kept here as the one shared
 * copy instead of a third/fourth inline duplicate.
 */
export function InvoiceDetailDialog({ invoiceId, open, onOpenChange }: InvoiceDetailDialogProps) {
  const { t } = useLanguage()
  const { data: invoice, isLoading, error } = useGetInvoiceByIdQuery(invoiceId, { skip: !invoiceId || !open })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!w-fit !max-w-[min(96vw,1100px)] min-w-[min(90vw,520px)] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('invoice_details') || 'Invoice Details'}
            {invoice?.invoiceNumber && <span className="text-muted-foreground font-normal"> — {invoice.invoiceNumber}</span>}
          </DialogTitle>
        </DialogHeader>

        {isLoading && <div className="py-8 text-center text-muted-foreground">{t('loading') || 'Loading...'}</div>}
        {!isLoading && (error || !invoice) && (
          <div className="py-8 text-center text-destructive">{t('failed_to_load_invoice') || 'Failed to load invoice details'}</div>
        )}

        {!isLoading && invoice && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">{t('date') || 'Date'}</p>
                <p className="font-medium">{formatDate(invoice.invoiceDate)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('customer') || 'Customer'}</p>
                <p className="font-medium">{customerLabel(invoice)}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('status') || 'Status'}</p>
                <Badge className={STATUS_COLORS[invoice.status] || ''}>{invoice.status || 'N/A'}</Badge>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('type') || 'Type'}</p>
                <Badge className={TYPE_COLORS[invoice.type] || ''} variant="outline">
                  {invoice.type || 'N/A'}
                </Badge>
              </div>
              {invoice.salesmanId?.name && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('salesman') || 'Salesman'}</p>
                  <p className="font-medium">{invoice.salesmanId.name}</p>
                </div>
              )}
              <div>
                <p className="text-sm text-muted-foreground">{t('payment_method') || 'Payment Method'}</p>
                <p className="font-medium capitalize">{invoice.paymentMethod || '—'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">{t('paid') || 'Paid'}</p>
                <p className="font-medium text-green-700">Rs {formatCurrency(invoice.paidAmount)}</p>
              </div>
              {Number(invoice.balance || 0) > 0 && (
                <div>
                  <p className="text-sm text-muted-foreground">{t('balance') || 'Balance'}</p>
                  <p className="font-medium text-red-700">Rs {formatCurrency(invoice.balance)}</p>
                </div>
              )}
            </div>

            <div>
              <p className="text-sm text-muted-foreground mb-2">{t('items') || 'Items'}</p>
              <div className="overflow-x-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('product') || 'Product'}</TableHead>
                      <TableHead>{t('variant') || 'Variant'}</TableHead>
                      <TableHead>{t('batch') || 'Batch #'}</TableHead>
                      <TableHead>{t('expiry') || 'Expiry'}</TableHead>
                      <TableHead>{t('quantity') || 'Qty'}</TableHead>
                      <TableHead>{t('price') || 'Price'}</TableHead>
                      <TableHead className="text-right">{t('total') || 'Total'}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(invoice.items || []).length > 0 ? (
                      invoice.items.map((item: any, index: number) => {
                        const variantLabel = item.variantId?.attributes
                          ? Object.values(item.variantId.attributes as Record<string, string>).join(' / ')
                          : ''
                        return (
                          <TableRow key={index}>
                            <TableCell className="max-w-[220px] truncate" title={item.name}>
                              {item.name || '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground">{variantLabel || '—'}</TableCell>
                            <TableCell className="font-mono text-xs text-muted-foreground">
                              {item.batchId?.batchNumber || item.batchNumber || '—'}
                            </TableCell>
                            <TableCell>{expiryBadge(item.batchId?.expiryDate)}</TableCell>
                            <TableCell>{item.quantity || 0}</TableCell>
                            <TableCell>Rs {formatCurrency(item.unitPrice)}</TableCell>
                            <TableCell className="text-right">
                              {Number(item.discountAmount || 0) > 0 && (
                                <div className="text-xs text-muted-foreground line-through">
                                  Rs {formatCurrency((item.quantity || 0) * (item.unitPrice || 0))}
                                </div>
                              )}
                              Rs {formatCurrency(item.subtotal)}
                              {Number(item.discountAmount || 0) > 0 && (
                                <div className="text-xs text-green-600">-Rs {formatCurrency(item.discountAmount)}</div>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center text-muted-foreground">
                          {t('no_items') || 'No items'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="flex justify-end">
              <div className="w-full sm:w-64 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('subtotal') || 'Subtotal'}</span>
                  <span>Rs {formatCurrency(invoice.subtotal)}</span>
                </div>
                {Number(invoice.discount || 0) > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>{t('discount') || 'Discount'}</span>
                    <span>-Rs {formatCurrency(invoice.discount)}</span>
                  </div>
                )}
                {Number(invoice.tax || 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">{t('tax') || 'Tax'}</span>
                    <span>Rs {formatCurrency(invoice.tax)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold text-base border-t pt-1">
                  <span>{t('total') || 'Total'}</span>
                  <span>Rs {formatCurrency(invoice.total)}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

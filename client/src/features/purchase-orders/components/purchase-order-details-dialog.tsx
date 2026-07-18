import {
  Calendar,
  ClipboardList,
  Package,
  PackageCheck,
  Truck,
  User,
} from 'lucide-react'

import { formatBusinessDate, formatBusinessDateTime } from '@/lib/business-timezone'
import { cn } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import { WhatsAppSendButton } from '@/components/whatsapp/whatsapp-send-button'
import { SmsSendButton } from '@/components/sms/sms-send-button'
import { buildPurchaseOrderMessage, buildPurchaseOrderItemsSummary } from '@/utils/sms-messages'
import { useBranchName } from '@/hooks/use-branch-name'
import type { PurchaseOrder, PurchaseOrderStatus } from '@/stores/purchaseOrder.api'

const STATUS_STYLES: Record<PurchaseOrderStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  completed: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  cancelled: 'bg-rose-100 text-rose-700 border-rose-200',
}

const STATUS_LABELS: Record<PurchaseOrderStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  partial: 'Partial',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const formatMoney = (value: number) =>
  Number(value || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

function getReceiptInvoiceMeta(rcpt: any) {
  const purchase = rcpt?.purchase
  if (purchase && typeof purchase === 'object') {
    const totalAmount = Number(purchase.totalAmount || 0)
    const paidAmount = Number(purchase.paidAmount || 0)
    const balance =
      purchase.balance !== undefined && purchase.balance !== null
        ? Number(purchase.balance)
        : Math.max(0, totalAmount - paidAmount)
    return {
      totalAmount,
      paidAmount,
      balance,
      paymentType: purchase.paymentType as string | undefined,
    }
  }

  const totalAmount = (rcpt?.items || []).reduce(
    (sum: number, line: any) =>
      sum + Number(line.receivedQuantity || 0) * Number(line.priceAtPurchase || 0),
    0,
  )
  return {
    totalAmount,
    paidAmount: 0,
    balance: totalAmount,
    paymentType: undefined,
  }
}

interface Props {
  order: PurchaseOrder | null
  open: boolean
  onClose: () => void
}

export default function PurchaseOrderDetailsDialog({ order, open, onClose }: Props) {
  const branchName = useBranchName()
  if (!order) return null

  const orderedQty = order.items.reduce((s, i) => s + Number(i.quantity || 0), 0)
  const receivedQty = order.items.reduce(
    (s, i) => s + Math.min(Number(i.quantity || 0), Number(i.receivedQuantity || 0)),
    0,
  )
  const remainingQty = Math.max(0, orderedQty - receivedQty)
  const pct = orderedQty === 0 ? 0 : Math.min(100, Math.round((receivedQty / orderedQty) * 100))

  const receiptTotals = (order.receipts || []).reduce(
    (acc, rcpt) => {
      const meta = getReceiptInvoiceMeta(rcpt)
      acc.invoiced += meta.totalAmount
      acc.paid += meta.paidAmount
      acc.balance += meta.balance
      return acc
    },
    { invoiced: 0, paid: 0, balance: 0 },
  )

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent className='top-[3vh] flex h-[94vh] max-h-[94vh] w-full max-w-5xl translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl'>
        <div className='shrink-0 border-b bg-muted/30 px-5 py-4 sm:px-6'>
          <DialogHeader className='space-y-3 text-left'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
              <div className='space-y-1'>
                <DialogTitle className='flex flex-wrap items-center gap-2 text-xl'>
                  <ClipboardList className='h-5 w-5 text-primary' />
                  {order.orderNumber}
                  <Badge
                    className={cn('border', STATUS_STYLES[order.status])}
                    variant='secondary'
                  >
                    {STATUS_LABELS[order.status]}
                  </Badge>
                </DialogTitle>
                <DialogDescription>
                  Purchase order summary, line items, and goods receipts.
                </DialogDescription>
              </div>
              <div className='text-right'>
                <p className='text-xs uppercase tracking-wide text-muted-foreground'>Order total</p>
                <p className='text-2xl font-bold tabular-nums text-primary'>
                  Rs {formatMoney(order.totalAmount)}
                </p>
              </div>
            </div>

            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4'>
              <InfoTile
                icon={User}
                label='Supplier'
                value={order.supplier?.name || 'N/A'}
                sub={order.supplier?.phone}
                leading={
                  order.supplier?.name ? (
                    <ContactPhotoCell
                      picture={order.supplier?.picture}
                      name={order.supplier.name}
                      className='h-9 w-9 shrink-0 rounded-full'
                    />
                  ) : undefined
                }
              />
              <InfoTile
                icon={Calendar}
                label='Order date'
                value={formatBusinessDate(order.orderDate)}
                sub={
                  order.expectedDeliveryDate
                    ? `Expected ${formatBusinessDate(order.expectedDeliveryDate)}`
                    : undefined
                }
              />
              <InfoTile
                icon={Package}
                label='Line items'
                value={`${order.items.length} product${order.items.length === 1 ? '' : 's'}`}
                sub={`${orderedQty} units ordered`}
              />
              <InfoTile
                icon={Truck}
                label='Receipt progress'
                value={`${receivedQty} / ${orderedQty} units`}
                sub={`${remainingQty} remaining · ${pct}%`}
              />
            </div>

            {(order.supplier?.phone || order.supplier?.whatsapp) && (
              <div className='flex flex-wrap items-center gap-2'>
                <span className='text-xs text-muted-foreground'>Send this order to supplier:</span>
                <WhatsAppSendButton
                  phone={order.supplier?.phone}
                  whatsapp={order.supplier?.whatsapp}
                  name={order.supplier?.name}
                  showLabel
                  size='sm'
                  variant='outline'
                  message={buildPurchaseOrderMessage({
                    branchName,
                    supplierName: order.supplier?.name,
                    orderNumber: order.orderNumber,
                    items: order.items.map((i) => ({ name: i.productName || 'Item', quantity: i.quantity, unit: i.unit })),
                  })}
                  templateCategory='purchase_order'
                  templateParams={[
                    order.supplier?.name || 'there',
                    order.orderNumber,
                    buildPurchaseOrderItemsSummary(
                      order.items.map((i) => ({ name: i.productName || 'Item', quantity: i.quantity, unit: i.unit })),
                    ),
                  ]}
                />
                <SmsSendButton
                  phone={order.supplier?.phone}
                  name={order.supplier?.name}
                  showLabel
                  size='sm'
                  variant='outline'
                  defaultMessage={buildPurchaseOrderMessage({
                    branchName,
                    supplierName: order.supplier?.name,
                    orderNumber: order.orderNumber,
                    items: order.items.map((i) => ({ name: i.productName || 'Item', quantity: i.quantity, unit: i.unit })),
                  })}
                />
              </div>
            )}

            <div className='rounded-lg border bg-background p-3'>
              <div className='mb-2 flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                <span>Delivery progress</span>
                <span className='tabular-nums'>{pct}% complete</span>
              </div>
              <Progress
                value={pct}
                className={cn(
                  'h-2.5',
                  order.status === 'completed' && '[&>div]:bg-emerald-500',
                  order.status === 'partial' && '[&>div]:bg-amber-500',
                )}
              />
            </div>
          </DialogHeader>
        </div>

        <div className='min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-5 py-4 pb-6 sm:px-6'>
          <div className='grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px] lg:items-start'>
            <div className='space-y-4'>
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='flex items-center gap-2 text-base'>
                    <Package className='h-4 w-4' />
                    Order items
                  </CardTitle>
                </CardHeader>
                <CardContent className='p-0'>
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-[640px] text-sm'>
                      <thead>
                        <tr className='border-b bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground'>
                          <th className='px-4 py-2.5 text-left font-medium'>Product</th>
                          <th className='px-3 py-2.5 text-right font-medium w-20'>Ordered</th>
                          <th className='px-3 py-2.5 text-right font-medium w-20'>Received</th>
                          <th className='px-3 py-2.5 text-right font-medium w-20'>Left</th>
                          <th className='px-3 py-2.5 text-right font-medium w-24'>Cost</th>
                          <th className='px-4 py-2.5 text-right font-medium w-28'>Line total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.items.map((item: any, idx: number) => {
                          const product = item.product
                          const productName =
                            item.productName ||
                            (typeof product === 'object' ? product?.name : '') ||
                            'Unknown'
                          const ordered = Number(item.quantity || 0)
                          const rec = Number(item.receivedQuantity || 0)
                          const remaining = Math.max(0, ordered - rec)

                          return (
                            <tr
                              key={idx}
                              className='border-b last:border-0 hover:bg-muted/20'
                            >
                              <td className='px-4 py-3'>
                                <p className='font-medium leading-tight'>{productName}</p>
                                <p className='mt-0.5 text-xs text-muted-foreground'>
                                  {item.unit || 'pcs'}
                                </p>
                              </td>
                              <td className='px-3 py-3 text-right tabular-nums font-medium'>
                                {ordered}
                              </td>
                              <td className='px-3 py-3 text-right tabular-nums text-emerald-600'>
                                {rec}
                              </td>
                              <td className='px-3 py-3 text-right tabular-nums'>
                                <span
                                  className={cn(
                                    remaining > 0 ? 'text-amber-600 font-medium' : 'text-muted-foreground',
                                  )}
                                >
                                  {remaining}
                                </span>
                              </td>
                              <td className='px-3 py-3 text-right tabular-nums'>
                                Rs {formatMoney(item.expectedPrice || 0)}
                              </td>
                              <td className='px-4 py-3 text-right tabular-nums font-semibold'>
                                Rs {formatMoney(item.total || 0)}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {order.receipts && order.receipts.length > 0 ? (
                <Card>
                  <CardHeader className='pb-3'>
                    <CardTitle className='flex items-center gap-2 text-base'>
                      <PackageCheck className='h-4 w-4 text-emerald-600' />
                      Goods receipts ({order.receipts.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className='space-y-3'>
                    {order.receipts.length > 1 ? (
                      <div className='grid grid-cols-3 gap-2 rounded-lg border bg-muted/30 p-3 text-sm'>
                        <div>
                          <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                            All invoices
                          </p>
                          <p className='font-semibold tabular-nums'>
                            Rs {formatMoney(receiptTotals.invoiced)}
                          </p>
                        </div>
                        <div>
                          <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                            Total paid
                          </p>
                          <p className='font-semibold tabular-nums text-emerald-600'>
                            Rs {formatMoney(receiptTotals.paid)}
                          </p>
                        </div>
                        <div>
                          <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                            Total balance
                          </p>
                          <p
                            className={cn(
                              'font-semibold tabular-nums',
                              receiptTotals.balance > 0 ? 'text-amber-600' : 'text-muted-foreground',
                            )}
                          >
                            Rs {formatMoney(receiptTotals.balance)}
                          </p>
                        </div>
                      </div>
                    ) : null}
                    {order.receipts.map((rcpt: any, idx: number) => {
                      const invoiceMeta = getReceiptInvoiceMeta(rcpt)
                      return (
                      <div
                        key={idx}
                        className='overflow-hidden rounded-lg border bg-card'
                      >
                        <div className='flex flex-wrap items-start justify-between gap-3 border-b bg-muted/30 px-3 py-2.5'>
                          <div>
                            <p className='font-semibold text-sm'>
                              {rcpt.purchaseInvoiceNumber ||
                                (typeof rcpt.purchase === 'object'
                                  ? rcpt.purchase?.invoiceNumber
                                  : undefined) ||
                                `Receipt #${idx + 1}`}
                            </p>
                            <p className='text-xs text-muted-foreground'>
                              {formatBusinessDateTime(rcpt.receivedAt)}
                              {(rcpt.receivedBy as any)?.name
                                ? ` · ${(rcpt.receivedBy as any).name}`
                                : ''}
                              {invoiceMeta.paymentType ? ` · ${invoiceMeta.paymentType}` : ''}
                            </p>
                          </div>
                          <div className='flex flex-wrap items-center gap-2'>
                            <Badge variant='outline'>{rcpt.items.length} lines</Badge>
                          </div>
                        </div>
                        <div className='grid grid-cols-3 gap-2 border-b bg-background px-3 py-2 text-xs sm:text-sm'>
                          <div>
                            <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                              Invoice total
                            </p>
                            <p className='font-semibold tabular-nums'>
                              Rs {formatMoney(invoiceMeta.totalAmount)}
                            </p>
                          </div>
                          <div>
                            <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                              Paid
                            </p>
                            <p className='font-semibold tabular-nums text-emerald-600'>
                              Rs {formatMoney(invoiceMeta.paidAmount)}
                            </p>
                          </div>
                          <div>
                            <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>
                              Balance
                            </p>
                            <p
                              className={cn(
                                'font-semibold tabular-nums',
                                invoiceMeta.balance > 0 ? 'text-amber-600' : 'text-muted-foreground',
                              )}
                            >
                              Rs {formatMoney(invoiceMeta.balance)}
                            </p>
                          </div>
                        </div>
                        <div className='divide-y'>
                          {rcpt.items.map((line: any, lineIdx: number) => {
                            const orderItem = order.items.find((it: any) => {
                              const pid =
                                typeof it.product === 'object'
                                  ? it.product?._id || it.product?.id
                                  : it.product
                              const linePid =
                                typeof line.product === 'object'
                                  ? line.product?._id || line.product?.id
                                  : line.product
                              return String(pid) === String(linePid)
                            })
                            const productName =
                              (orderItem as any)?.productName ||
                              (typeof line.product === 'object' ? line.product?.name : '') ||
                              'Unknown'
                            const lineTotal =
                              Number(line.receivedQuantity || 0) *
                              Number(line.priceAtPurchase || 0)
                            return (
                              <div
                                key={lineIdx}
                                className='flex items-center justify-between gap-3 px-3 py-2 text-sm'
                              >
                                <span className='min-w-0 truncate font-medium'>{productName}</span>
                                <span className='shrink-0 tabular-nums text-muted-foreground'>
                                  {Number(line.receivedQuantity || 0)} {line.unit || 'pcs'}
                                </span>
                                <span className='shrink-0 tabular-nums text-muted-foreground'>
                                  @ Rs {formatMoney(line.priceAtPurchase || 0)}
                                </span>
                                <span className='shrink-0 tabular-nums font-medium'>
                                  Rs {formatMoney(lineTotal)}
                                </span>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )})}
                  </CardContent>
                </Card>
              ) : null}

              {order.notes || order.termsAndConditions ? (
                <Card>
                  <CardContent className='space-y-3 p-4'>
                    {order.notes ? (
                      <div>
                        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                          Notes
                        </p>
                        <p className='mt-1 text-sm whitespace-pre-wrap'>{order.notes}</p>
                      </div>
                    ) : null}
                    {order.termsAndConditions ? (
                      <div>
                        <p className='text-xs font-medium uppercase tracking-wide text-muted-foreground'>
                          Terms & conditions
                        </p>
                        <p className='mt-1 text-sm whitespace-pre-wrap'>
                          {order.termsAndConditions}
                        </p>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {order.cancellationReason ? (
                <div className='rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm dark:bg-rose-950/30'>
                  <p className='font-semibold text-rose-700 dark:text-rose-400'>
                    Cancellation reason
                  </p>
                  <p className='mt-1 text-rose-700 dark:text-rose-300'>
                    {order.cancellationReason}
                  </p>
                </div>
              ) : null}
            </div>

            <div className='space-y-4 lg:sticky lg:top-0 lg:self-start'>
              <Card>
                <CardHeader className='pb-3'>
                  <CardTitle className='text-base'>Summary</CardTitle>
                </CardHeader>
                <CardContent className='space-y-2'>
                  <SummaryRow label='Subtotal' value={order.subtotal} />
                  {order.discount ? (
                    <SummaryRow label='Discount' value={-Math.abs(order.discount)} muted />
                  ) : null}
                  {order.tax ? <SummaryRow label='Tax' value={order.tax} /> : null}
                  {order.shippingCost ? (
                    <SummaryRow label='Shipping' value={order.shippingCost} />
                  ) : null}
                  <Separator className='my-2' />
                  <div className='flex items-center justify-between'>
                    <span className='font-semibold'>Total</span>
                    <span className='text-lg font-bold tabular-nums text-primary'>
                      Rs {formatMoney(order.totalAmount)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className='space-y-2 p-4 text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Created by</span>
                    <span className='font-medium'>{(order.createdBy as any)?.name || '—'}</span>
                  </div>
                  {order.createdAt ? (
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>Created</span>
                      <span className='font-medium tabular-nums'>
                        {formatBusinessDate(order.createdAt)}
                      </span>
                    </div>
                  ) : null}
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Units received</span>
                    <span className='font-medium tabular-nums text-emerald-600'>
                      {receivedQty}
                    </span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>Units pending</span>
                    <span className='font-medium tabular-nums text-amber-600'>
                      {remainingQty}
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoTile({
  icon: Icon,
  label,
  value,
  sub,
  leading,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  sub?: string
  leading?: React.ReactNode
}) {
  return (
    <div className='flex items-start gap-3 rounded-lg border bg-background p-3'>
      {leading ?? (
        <div className='flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary'>
          <Icon className='h-4 w-4' />
        </div>
      )}
      <div className='min-w-0'>
        <p className='text-[11px] font-medium uppercase tracking-wide text-muted-foreground'>
          {label}
        </p>
        <p className='truncate text-sm font-semibold'>{value}</p>
        {sub ? <p className='truncate text-xs text-muted-foreground'>{sub}</p> : null}
      </div>
    </div>
  )
}

function SummaryRow({
  label,
  value,
  muted,
}: {
  label: string
  value: number
  muted?: boolean
}) {
  return (
    <div className='flex items-center justify-between text-sm'>
      <span className='text-muted-foreground'>{label}</span>
      <span className={cn('tabular-nums font-medium', muted && 'text-red-600')}>
        Rs {formatMoney(value)}
      </span>
    </div>
  )
}

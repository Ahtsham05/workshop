import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { differenceInCalendarDays, format } from 'date-fns'
import { toast } from 'sonner'
import { useGetPurchaseByIdQuery, useAddPurchaseCommentMutation, useDeletePurchaseCommentMutation } from '@/stores/purchase.api'
import { useGetPurchasePaymentsQuery, useVoidSupplierPaymentMutation } from '@/stores/supplierPayment.api'
import { useGetAuditLogsQuery } from '@/stores/auditLog.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import {
  ArrowUpRight,
  Ban,
  Building2,
  CalendarClock,
  Edit,
  FileText,
  HandCoins,
  Loader2,
  MessageSquare,
  Paperclip,
  Phone,
  Printer,
  Receipt,
  Send,
  Trash2,
  User,
} from 'lucide-react'
import { formatImeiEntries } from '@/stores/imei.api'
import { getPurchaseItemBarcode, getPurchaseItemDisplayName } from '../utils/purchase-item-display'
import { PurchaseAttachmentsButton } from './purchase-attachments-button'
import {
  DUE_STATUS_META,
  SETTLEMENT_STATUS_META,
  paymentTypeClassName,
  resolvePaymentTypeLabel,
  resolvePurchaseSettlement,
} from '../utils/purchase-settlement'

interface PurchaseViewDrawerProps {
  purchaseId: string | null
  /** The list row, shown immediately while the full document is fetched. */
  fallbackPurchase?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  onEdit?: (purchase: any) => void
  onPrint?: (purchase: any) => void
  onRecordPayment?: (purchase: any) => void
}

/** Label + value, the drawer's smallest building block. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='space-y-0.5'>
      <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <div className='text-sm font-medium'>{children}</div>
    </div>
  )
}

/** An empty optional field. Reads as "nobody filled this in", not as a broken value. */
function NotSet({ label }: { label: string }) {
  return <span className='text-sm font-normal text-muted-foreground/70'>{label}</span>
}

function SectionTitle({ icon: Icon, children }: { icon: any; children: React.ReactNode }) {
  return (
    <h3 className='flex items-center gap-2 text-sm font-semibold'>
      <Icon className='h-4 w-4 text-muted-foreground' />
      {children}
    </h3>
  )
}

export function PurchaseViewDrawer({
  purchaseId,
  fallbackPurchase,
  open,
  onOpenChange,
  onEdit,
  onPrint,
  onRecordPayment,
}: PurchaseViewDrawerProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const { hasPermission, hasExplicitPermission } = usePermissions()
  const [comment, setComment] = useState('')

  const { data: fetched, isFetching } = useGetPurchaseByIdQuery(purchaseId, { skip: !purchaseId || !open })
  const purchase = fetched || fallbackPurchase
  const { data: settlementDetail } = useGetPurchasePaymentsQuery(purchaseId as string, { skip: !purchaseId || !open })
  const canSeeAudit = hasPermission('viewAuditLogs')
  const { data: auditLogs } = useGetAuditLogsQuery(
    { module: 'Purchase', entityId: purchaseId as string, limit: 30, sortBy: 'createdAt:desc' },
    { skip: !purchaseId || !open || !canSeeAudit }
  )

  const [addComment, { isLoading: isCommenting }] = useAddPurchaseCommentMutation()
  const [deleteComment] = useDeletePurchaseCommentMutation()
  const [voidPayment, { isLoading: isVoiding }] = useVoidSupplierPaymentMutation()

  const settlement = useMemo(() => resolvePurchaseSettlement({ ...purchase, ...(settlementDetail || {}) }), [purchase, settlementDetail])
  const statusMeta = SETTLEMENT_STATUS_META[settlement.settlementStatus]
  const dueMeta = DUE_STATUS_META[settlement.dueStatus]
  const paymentTypeLabel = resolvePaymentTypeLabel(purchase)

  const subtotal = useMemo(
    () => (purchase?.items || []).reduce((sum: number, item: any) => sum + Number(item.total || 0), 0),
    [purchase]
  )

  /** Whole-number progress for the settlement bar, clamped so an overpay can't overflow it. */
  const settledPercent = useMemo(() => {
    if (!settlement.totalAmount) return 0
    return Math.min(100, Math.max(0, Math.round((settlement.settledAmount / settlement.totalAmount) * 100)))
  }, [settlement.settledAmount, settlement.totalAmount])

  /** "Due in 12 days" / "Overdue by 3 days" — the context a bare Remaining figure lacks. */
  const dueContext = useMemo(() => {
    if (!purchase?.dueDate || settlement.remainingAmount <= 0.001) return ''
    const days = differenceInCalendarDays(new Date(purchase.dueDate), new Date())
    if (days < 0) return `${t('Overdue by')} ${Math.abs(days)} ${t('day(s)')}`
    if (days === 0) return t('Due today')
    return `${t('Due in')} ${days} ${t('day(s)')}`
  }, [purchase?.dueDate, settlement.remainingAmount, t])

  const totalQuantity = useMemo(
    () => (purchase?.items || []).reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0),
    [purchase]
  )

  const supplierId = purchase?.supplier?._id || purchase?.supplier?.id || ''
  const taxLines = purchase?.taxLines || []
  const payments = settlementDetail?.payments || []
  const comments = purchase?.comments || []

  const handleAddComment = async () => {
    if (!comment.trim() || !purchaseId) return
    try {
      await addComment({ purchaseId, message: comment.trim() }).unwrap()
      setComment('')
    } catch (error: any) {
      toast.error(error?.data?.message || t('Could not post the comment'))
    }
  }

  const handleVoidPayment = async (paymentId: string) => {
    try {
      await voidPayment({ id: paymentId, reason: 'Voided from purchase invoice' }).unwrap()
      toast.success(t('Payment voided'))
    } catch (error: any) {
      toast.error(error?.data?.message || t('Could not void the payment'))
    }
  }

  if (!purchase) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side='right' className='w-full sm:max-w-3xl'>
          <SheetHeader>
            <SheetTitle>{t('Purchase Details')}</SheetTitle>
            <SheetDescription>{t('Loading...')}</SheetDescription>
          </SheetHeader>
          <div className='flex h-40 items-center justify-center'>
            <Loader2 className='h-6 w-6 animate-spin text-muted-foreground' />
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-4xl'>
        {/* pr-12 keeps the action buttons clear of SheetContent's own close button, which is
            absolutely positioned at top-4 right-4 and would otherwise sit on top of them. */}
        <SheetHeader className='space-y-3 border-b px-6 py-4 pr-12'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <SheetTitle className='flex flex-wrap items-center gap-x-2 gap-y-1 text-xl'>
                {purchase.invoiceNumber}
                {purchase.supplier?.name && (
                  <span className='text-sm font-normal text-muted-foreground'>· {purchase.supplier.name}</span>
                )}
                {isFetching && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
              </SheetTitle>
              <SheetDescription className='flex flex-wrap items-center gap-2 pt-1'>
                <Badge variant='outline' className={statusMeta.className}>
                  {t(statusMeta.label)}
                </Badge>
                {settlement.dueStatus !== 'settled' && settlement.dueStatus !== 'no_due_date' && (
                  <Badge variant='outline' className={dueMeta.className}>
                    {t(dueMeta.label)}
                  </Badge>
                )}
                <Badge variant='outline' className={paymentTypeClassName(paymentTypeLabel)}>
                  {paymentTypeLabel}
                </Badge>
                {purchase.vendorBillNumber && (
                  <span className='text-xs text-muted-foreground'>
                    {t('Vendor Bill No')}: {purchase.vendorBillNumber}
                  </span>
                )}
              </SheetDescription>
            </div>

            <div className='flex flex-wrap items-center gap-2'>
              {settlement.remainingAmount > 0.001 && onRecordPayment && hasExplicitPermission('createPurchases') && (
                <Button size='sm' onClick={() => onRecordPayment(purchase)}>
                  <HandCoins className='mr-2 h-4 w-4' />
                  {t('Record Payment')}
                </Button>
              )}
              {onPrint && (
                <Button size='sm' variant='outline' onClick={() => onPrint(purchase)}>
                  <Printer className='mr-2 h-4 w-4' />
                  {t('Print')}
                </Button>
              )}
              {onEdit && hasExplicitPermission('editPurchases') && (
                <Button size='sm' variant='outline' onClick={() => onEdit(purchase)}>
                  <Edit className='mr-2 h-4 w-4' />
                  {t('Edit')}
                </Button>
              )}
            </div>
          </div>

          {/* Money at a glance */}
          <div className='grid grid-cols-3 gap-2'>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Invoice Total')}</p>
              <p className='text-lg font-semibold tabular-nums'>{formatMoney(settlement.totalAmount)}</p>
            </div>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Paid')}</p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  // Nothing paid is not good news — only colour it once money has actually landed.
                  settlement.settledAmount > 0.001
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
                )}
              >
                {formatMoney(settlement.settledAmount)}
              </p>
            </div>
            <div className='rounded-lg border bg-muted/40 p-3'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Remaining')}</p>
              <p
                className={cn(
                  'text-lg font-semibold tabular-nums',
                  settlement.remainingAmount > 0.001 ? 'text-rose-600 dark:text-rose-400' : 'text-muted-foreground'
                )}
              >
                {formatMoney(Math.max(0, settlement.remainingAmount))}
              </p>
              {dueContext && <p className='truncate text-[11px] text-muted-foreground'>{dueContext}</p>}
            </div>
          </div>

          {/* How far through paying this invoice is — the one thing three currency figures
              still don't tell you at a glance. */}
          {settlement.totalAmount > 0 && (
            <div className='space-y-1'>
              <div className='h-1.5 overflow-hidden rounded-full bg-muted'>
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    settledPercent >= 100 ? 'bg-emerald-500' : settledPercent > 0 ? 'bg-amber-500' : 'bg-transparent'
                  )}
                  style={{ width: `${settledPercent}%` }}
                />
              </div>
              <p className='text-[11px] text-muted-foreground'>
                {settledPercent}% {t('settled')}
                {settlement.remainingAmount > 0.001 && (
                  <>
                    {' · '}
                    {formatMoney(settlement.remainingAmount)} {t('still owed')}
                  </>
                )}
              </p>
            </div>
          )}
        </SheetHeader>

        <Tabs defaultValue='overview' className='flex min-h-0 flex-1 flex-col'>
          <TabsList className='mx-6 mt-3 grid w-auto grid-cols-4'>
            <TabsTrigger value='overview'>{t('Overview')}</TabsTrigger>
            <TabsTrigger value='payments'>
              {t('Payments')}
              {payments.length > 0 && <span className='ml-1 text-xs text-muted-foreground'>({payments.length})</span>}
            </TabsTrigger>
            <TabsTrigger value='attachments'>
              {t('Files')}
              {purchase.attachments?.length > 0 && (
                <span className='ml-1 text-xs text-muted-foreground'>({purchase.attachments.length})</span>
              )}
            </TabsTrigger>
            <TabsTrigger value='activity'>{t('Activity')}</TabsTrigger>
          </TabsList>

          <ScrollArea className='min-h-0 flex-1'>
            {/* ---------------------------------------------------------------- Overview */}
            <TabsContent value='overview' className='m-0 space-y-6 p-6'>
              <section className='space-y-3'>
                <SectionTitle icon={Building2}>{t('Supplier Details')}</SectionTitle>
                <div className='flex items-start gap-3 rounded-lg border p-4'>
                  <ContactPhotoCell
                    picture={purchase.supplier?.picture}
                    name={purchase.supplier?.name || 'N/A'}
                    className='h-12 w-12 shrink-0'
                  />
                  <div className='min-w-0 flex-1 space-y-1'>
                    <BilingualName primary={purchase.supplier?.name || 'N/A'} secondary={purchase.supplier?.nameUrdu} />
                    <div className='flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground'>
                      {purchase.supplier?.phone && (
                        <span className='flex items-center gap-1'>
                          <Phone className='h-3 w-3' />
                          {purchase.supplier.phone}
                        </span>
                      )}
                      {purchase.supplier?.address && <span>{purchase.supplier.address}</span>}
                      {purchase.supplier?.taxNumber && (
                        <span>
                          {t('Tax No')}: {purchase.supplier.taxNumber}
                        </span>
                      )}
                    </div>
                  </div>
                  {supplierId && (
                    <Button
                      variant='outline'
                      size='sm'
                      className='shrink-0'
                      onClick={() =>
                        navigate({
                          to: '/accounting',
                          search: { tab: 'supplier-ledger', supplierId, supplierName: purchase.supplier?.name },
                        })
                      }
                    >
                      {t('View ledger')}
                      <ArrowUpRight className='ml-1 h-3.5 w-3.5' />
                    </Button>
                  )}
                </div>
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={FileText}>{t('Invoice Information')}</SectionTitle>
                <div className='grid grid-cols-2 gap-4 rounded-lg border p-4 sm:grid-cols-3'>
                  <Field label={t('Invoice Number')}>{purchase.invoiceNumber}</Field>
                  <Field label={t('Vendor Bill No')}>
                    {purchase.vendorBillNumber || <NotSet label={t('Not set')} />}
                  </Field>
                  <Field label={t('Purchase Date')}>
                    {format(new Date(purchase.purchaseDate || purchase.createdAt), 'dd MMM yyyy')}
                  </Field>
                  <Field label={t('Due Date')}>
                    {purchase.dueDate ? (
                      <span className='flex flex-wrap items-center gap-1.5'>
                        {format(new Date(purchase.dueDate), 'dd MMM yyyy')}
                        {dueContext && <span className='text-xs font-normal text-muted-foreground'>({dueContext})</span>}
                      </span>
                    ) : (
                      <NotSet label={t('No due date')} />
                    )}
                  </Field>
                  <Field label={t('Payment Type')}>{paymentTypeLabel}</Field>
                  <Field label={t('Invoice Status')}>
                    <Badge variant={purchase.status ? 'default' : 'secondary'}>
                      {purchase.status ? t('Completed') : t('Pending')}
                    </Badge>
                  </Field>
                  <Field label={t('created_by') || 'Created By'}>
                    {(typeof purchase.createdBy === 'object' && purchase.createdBy?.name) || <NotSet label={t('Unknown')} />}
                  </Field>
                  <Field label={t('Last Updated')}>
                    {purchase.updatedAt ? (
                      format(new Date(purchase.updatedAt), 'dd MMM yyyy HH:mm')
                    ) : (
                      <NotSet label={t('Never edited')} />
                    )}
                  </Field>
                  <Field label={t('Items')}>{purchase.items?.length || 0}</Field>
                </div>
                {purchase.notes && (
                  <div className='rounded-lg border bg-muted/30 p-3 text-sm'>
                    <p className='mb-1 text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Notes')}</p>
                    {purchase.notes}
                  </div>
                )}
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={Receipt}>{t('Purchased Items')}</SectionTitle>
                <div className='overflow-x-auto rounded-lg border'>
                  <Table className='min-w-[520px]'>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t('Product')}</TableHead>
                        <TableHead className='text-right'>{t('Quantity')}</TableHead>
                        {/* NOT t('unit_price') — that resolves to "Unit Sale Price", which is
                            the sales vocabulary. On a purchase this is what we paid. */}
                        <TableHead className='text-right'>{t('Unit Cost')}</TableHead>
                        <TableHead className='text-right'>{t('Total')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(purchase.items || []).map((item: any, index: number) => {
                        const price = item.priceAtPurchase || item.price || item?.product?.cost || 0
                        const gross = (item.quantity || 0) * price
                        const discountAmount = Number(item.discountAmount || 0)
                        const total = item.total ?? gross - discountAmount
                        return (
                          <TableRow key={index}>
                            <TableCell>
                              <BilingualName
                                primary={getPurchaseItemDisplayName(item)}
                                secondary={item.product?.nameUrdu}
                                primaryClassName='text-sm font-medium'
                              />
                              <div className='flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground'>
                                {getPurchaseItemBarcode(item) && <span>{getPurchaseItemBarcode(item)}</span>}
                                {item.batchNumber && <span className='text-blue-600 dark:text-blue-400'>Batch: {item.batchNumber}</span>}
                                {item.imeis?.length > 0 && <span>IMEI: {formatImeiEntries(item.imeis)}</span>}
                              </div>
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {item.quantity || 0} {item.unit || ''}
                            </TableCell>
                            <TableCell className='text-right tabular-nums'>{formatMoney(Number(price))}</TableCell>
                            <TableCell className='text-right tabular-nums'>
                              {discountAmount > 0 && (
                                <span className='mr-1 text-xs text-muted-foreground line-through'>{formatMoney(gross)}</span>
                              )}
                              {formatMoney(Number(total))}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                    {(purchase.items || []).length > 1 && (
                      <TableFooter>
                        <TableRow>
                          <TableCell className='font-medium'>
                            {purchase.items.length} {t('line(s)')}
                          </TableCell>
                          <TableCell className='text-right font-medium tabular-nums'>{totalQuantity}</TableCell>
                          <TableCell />
                          <TableCell className='text-right font-medium tabular-nums'>{formatMoney(subtotal)}</TableCell>
                        </TableRow>
                      </TableFooter>
                    )}
                  </Table>
                </div>
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={Receipt}>{t('Invoice Summary')}</SectionTitle>
                <div className='space-y-2 rounded-lg border p-4 text-sm'>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>{t('Subtotal')}</span>
                    <span className='tabular-nums'>{formatMoney(subtotal)}</span>
                  </div>
                  {Number(purchase.discount || 0) > 0 && (
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>{t('Discount')}</span>
                      <span className='tabular-nums text-emerald-600 dark:text-emerald-400'>
                        -{formatMoney(Number(purchase.discount))}
                      </span>
                    </div>
                  )}
                  {taxLines.length > 0 ? (
                    taxLines.map((line: any, index: number) => (
                      <div key={index} className='flex justify-between'>
                        <span className='text-muted-foreground'>
                          {line.name || line.taxName || t('Tax')}
                          {line.rate != null ? ` (${line.rate}%)` : ''}
                        </span>
                        <span className='tabular-nums'>{formatMoney(Number(line.amount || 0))}</span>
                      </div>
                    ))
                  ) : (
                    <div className='flex justify-between'>
                      <span className='text-muted-foreground'>{t('Input tax')}</span>
                      <span className='tabular-nums'>{formatMoney(Number(purchase.tax || 0))}</span>
                    </div>
                  )}
                  <Separator />
                  <div className='flex justify-between text-base font-semibold'>
                    <span>{t('Total Amount')}</span>
                    <span className='tabular-nums'>{formatMoney(Number(purchase.totalAmount || 0))}</span>
                  </div>
                  <div className='flex justify-between'>
                    <span className='text-muted-foreground'>{t('Paid')}</span>
                    <span className='tabular-nums text-emerald-600 dark:text-emerald-400'>
                      -{formatMoney(settlement.settledAmount)}
                    </span>
                  </div>
                  <Separator />
                  <div className='flex justify-between text-base font-semibold'>
                    <span>{t('Remaining')}</span>
                    <span
                      className={cn(
                        'tabular-nums',
                        settlement.remainingAmount > 0.001 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
                      )}
                    >
                      {formatMoney(Math.max(0, settlement.remainingAmount))}
                    </span>
                  </div>
                </div>
              </section>
            </TabsContent>

            {/* ---------------------------------------------------------------- Payments */}
            <TabsContent value='payments' className='m-0 space-y-4 p-6'>
              <div className='grid grid-cols-2 gap-3 sm:grid-cols-4'>
                <div className='rounded-lg border p-3'>
                  <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Paid at purchase')}</p>
                  <p className='text-base font-semibold tabular-nums'>
                    {formatMoney(settlementDetail?.paidAtPurchase ?? Number(purchase.paidAmount || 0))}
                  </p>
                </div>
                <div className='rounded-lg border p-3'>
                  <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Later payments')}</p>
                  <p className='text-base font-semibold tabular-nums'>
                    {formatMoney(Math.max(0, settlement.settledAmount - (settlementDetail?.paidAtPurchase ?? Number(purchase.paidAmount || 0))))}
                  </p>
                </div>
                <div className='rounded-lg border p-3'>
                  <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Total settled')}</p>
                  <p className='text-base font-semibold tabular-nums text-emerald-600 dark:text-emerald-400'>
                    {formatMoney(settlement.settledAmount)}
                  </p>
                </div>
                <div className='rounded-lg border p-3'>
                  <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Remaining')}</p>
                  <p className='text-base font-semibold tabular-nums'>{formatMoney(Math.max(0, settlement.remainingAmount))}</p>
                </div>
              </div>

              <SectionTitle icon={HandCoins}>{t('Payment History')}</SectionTitle>
              {payments.length === 0 ? (
                <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                  {t('No supplier payments have been applied to this invoice yet.')}
                </div>
              ) : (
                <div className='space-y-2'>
                  {payments.map((payment) => (
                    <div
                      key={payment.id}
                      className={cn(
                        'flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3',
                        payment.status === 'void' && 'opacity-60'
                      )}
                    >
                      <div className='min-w-0'>
                        <div className='flex items-center gap-2'>
                          <p className='font-medium'>{payment.paymentNumber}</p>
                          {payment.status === 'void' && (
                            <Badge variant='outline' className='border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400'>
                              {t('Void')}
                            </Badge>
                          )}
                          {payment.direction === 'refund' && <Badge variant='secondary'>{t('Refund')}</Badge>}
                          {payment.direction === 'return_credit' && (
                            <Badge
                              variant='outline'
                              className='border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400'
                            >
                              {t('Return credit')}
                            </Badge>
                          )}
                        </div>
                        <p className='text-xs text-muted-foreground'>
                          {format(new Date(payment.paymentDate), 'dd MMM yyyy')} ·{' '}
                          {/* A return settles the invoice with goods, not money — saying
                              "Cash" here would read as a payment that never happened. */}
                          {payment.direction === 'return_credit'
                            ? t('Goods returned')
                            : payment.paymentMethod === 'wallet'
                              ? payment.walletType
                              : t('Cash')}
                          {payment.referenceNumber ? ` · ${t('Ref')}: ${payment.referenceNumber}` : ''}
                          {typeof payment.createdBy === 'object' && payment.createdBy?.name ? ` · ${payment.createdBy.name}` : ''}
                        </p>
                      </div>
                      <div className='flex items-center gap-3'>
                        <div className='text-right'>
                          <p className='font-semibold tabular-nums'>{formatMoney(payment.appliedToThisInvoice)}</p>
                          <p className='text-[11px] text-muted-foreground'>
                            {t('of')} {formatMoney(payment.amount)}
                          </p>
                        </div>
                        {payment.status === 'posted' && hasExplicitPermission('deletePurchases') && (
                          <Button
                            size='sm'
                            variant='ghost'
                            className='text-destructive hover:text-destructive'
                            onClick={() => handleVoidPayment(payment.id)}
                            disabled={isVoiding}
                            title={t('Void this payment')}
                          >
                            <Ban className='h-4 w-4' />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* ------------------------------------------------------------- Attachments */}
            <TabsContent value='attachments' className='m-0 space-y-4 p-6'>
              <SectionTitle icon={Paperclip}>{t('Attachments')}</SectionTitle>
              {purchase.attachments?.length ? (
                <div className='space-y-3'>
                  <PurchaseAttachmentsButton attachments={purchase.attachments} contextLabel={purchase.invoiceNumber} />
                  <div className='grid grid-cols-2 gap-3 sm:grid-cols-3'>
                    {purchase.attachments.map((attachment: any, index: number) => (
                      <a
                        key={index}
                        href={attachment.url}
                        target='_blank'
                        rel='noreferrer'
                        className='group overflow-hidden rounded-lg border transition-colors hover:border-primary'
                      >
                        {attachment.fileType === 'pdf' ? (
                          <div className='flex h-28 items-center justify-center bg-muted'>
                            <FileText className='h-8 w-8 text-muted-foreground' />
                          </div>
                        ) : (
                          <img src={attachment.url} alt={attachment.fileName || 'attachment'} className='h-28 w-full object-cover' />
                        )}
                        <p className='truncate px-2 py-1.5 text-xs text-muted-foreground group-hover:text-foreground'>
                          {attachment.fileName || t('Attachment')}
                        </p>
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className='rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground'>
                  {t('No scanned bills attached to this purchase.')}
                </div>
              )}
            </TabsContent>

            {/* ---------------------------------------------------------------- Activity */}
            <TabsContent value='activity' className='m-0 space-y-6 p-6'>
              <section className='space-y-3'>
                <SectionTitle icon={MessageSquare}>{t('Comments')}</SectionTitle>
                <div className='space-y-2'>
                  <Textarea
                    rows={2}
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    placeholder={t('Add a note for your team...')}
                  />
                  <div className='flex justify-end'>
                    <Button size='sm' onClick={handleAddComment} disabled={!comment.trim() || isCommenting}>
                      {isCommenting ? <Loader2 className='mr-2 h-4 w-4 animate-spin' /> : <Send className='mr-2 h-4 w-4' />}
                      {t('Post comment')}
                    </Button>
                  </div>
                </div>
                {comments.length === 0 ? (
                  <p className='text-sm text-muted-foreground'>{t('No comments yet.')}</p>
                ) : (
                  <div className='space-y-2'>
                    {[...comments].reverse().map((entry: any) => (
                      <div key={entry.id || entry._id} className='group rounded-lg border p-3'>
                        <div className='flex items-start justify-between gap-2'>
                          <div className='min-w-0'>
                            <p className='text-xs font-medium'>
                              {entry.authorName || t('Unknown')}
                              <span className='ml-2 font-normal text-muted-foreground'>
                                {entry.createdAt ? format(new Date(entry.createdAt), 'dd MMM yyyy HH:mm') : ''}
                              </span>
                            </p>
                            <p className='mt-1 whitespace-pre-wrap text-sm'>{entry.message}</p>
                          </div>
                          {hasExplicitPermission('editPurchases') && purchaseId && (
                            <button
                              type='button'
                              onClick={() => deleteComment({ purchaseId, commentId: entry.id || entry._id })}
                              className='shrink-0 rounded-sm p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100'
                              aria-label={t('Delete comment')}
                            >
                              <Trash2 className='h-3.5 w-3.5' />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section className='space-y-3'>
                <SectionTitle icon={CalendarClock}>{t('Audit Timeline')}</SectionTitle>
                {!canSeeAudit ? (
                  <p className='text-sm text-muted-foreground'>{t('You do not have permission to view the audit trail.')}</p>
                ) : !auditLogs?.results?.length ? (
                  <p className='text-sm text-muted-foreground'>{t('No recorded changes for this purchase.')}</p>
                ) : (
                  <ol className='relative space-y-4 border-l pl-5'>
                    {auditLogs.results.map((log) => (
                      <li key={log.id} className='relative'>
                        <span className='absolute -left-[26px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-primary' />
                        <p className='text-sm font-medium capitalize'>
                          {log.action.replace('_', ' ')}
                          <span className='ml-2 text-xs font-normal text-muted-foreground'>
                            {format(new Date(log.createdAt), 'dd MMM yyyy HH:mm')}
                          </span>
                        </p>
                        <p className='flex items-center gap-1 text-xs text-muted-foreground'>
                          <User className='h-3 w-3' />
                          {log.userName || (typeof log.userId === 'object' ? log.userId?.name : '') || t('System')}
                        </p>
                        {log.changes?.length > 0 && (
                          <ul className='mt-1 space-y-0.5 text-xs text-muted-foreground'>
                            {log.changes.slice(0, 6).map((change, index) => (
                              <li key={index}>
                                <span className='font-medium'>{change.field}</span>: {String(change.oldValue ?? '—')} →{' '}
                                {String(change.newValue ?? '—')}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </section>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}

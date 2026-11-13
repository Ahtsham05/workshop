import { useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { differenceInCalendarDays } from 'date-fns'
import { toast } from 'sonner'
import { useGetPurchaseByIdQuery, useAddPurchaseCommentMutation, useDeletePurchaseCommentMutation } from '@/stores/purchase.api'
import { useGetPurchasePaymentsQuery, useVoidSupplierPaymentMutation } from '@/stores/supplierPayment.api'
import { useGetAuditLogsQuery } from '@/stores/auditLog.api'
import { useFormatMoney } from '@/lib/format-money'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { WarehouseTag } from '@/components/warehouse-tag'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { PrintFormatButton } from '@/components/print-format-button'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import type { PaperSize } from '@/features/invoice/utils/paper-format'
import { TaxBreakdownSummary } from '@/features/invoice/components/tax-breakdown-summary'
import { usePurchasePrinter } from '../hooks/use-purchase-printer'
import { InvoiceDeleteDialog } from './invoice-delete-dialog'
import { SupplierPaymentDialog } from './supplier-payment-dialog'
import { Textarea } from '@/components/ui/textarea'
import { BilingualName } from '@/components/bilingual-name'
import { ContactPhotoCell } from '@/components/contact-photo-cell'
import {
  ArrowUpRight,
  Ban,
  BookOpen,
  CalendarClock,
  Copy,
  Edit,
  FileDown,
  FileText,
  HandCoins,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Paperclip,
  Phone,
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
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'

interface PurchaseViewDrawerProps {
  purchaseId: string | null
  /** The list row, shown immediately while the full document is fetched. */
  fallbackPurchase?: any
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Defaults to opening /purchase-invoice?editId=…, which works from any screen. */
  onEdit?: (purchase: any) => void
  /** Defaults to the shared purchase printer (usePurchasePrinter). */
  onPrint?: (purchase: any, paperSize?: PaperSize) => void
  /** Defaults to the drawer's own Supplier Payment dialog. */
  onRecordPayment?: (purchase: any) => void
  onDuplicate?: (purchase: any) => void
  /** Where focus goes when the drawer closes — e.g. back to the list that opened it, since a
   *  drawer opened without a Trigger otherwise drops focus on <body>. */
  onCloseAutoFocus?: (event: Event) => void
  /** Optional bar above the header — the previous/next stepper (see record-navigator.tsx). */
  navigation?: React.ReactNode
}

/** Label + value, the drawer's smallest building block. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className='min-w-0'>
      <p className='text-[10px] uppercase tracking-wide text-muted-foreground'>{label}</p>
      <div className='text-xs font-medium'>{children}</div>
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
  onDuplicate,
  onCloseAutoFocus,
  navigation,
}: PurchaseViewDrawerProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const { hasPermission, hasExplicitPermission } = usePermissions()
  const [comment, setComment] = useState('')
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const printer = usePurchasePrinter()
  const { branchData, orgData } = printer

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

  const canEdit = hasExplicitPermission('editPurchases')
  const canCreate = hasExplicitPermission('createPurchases')
  const canDelete = hasExplicitPermission('deletePurchases')

  const doPrint = (paperSize?: PaperSize) => {
    if (!purchase) return
    if (onPrint) onPrint(purchase, paperSize)
    else printer.printPurchase(purchase, paperSize)
  }
  const doEdit = () => {
    if (!purchase) return
    if (onEdit) {
      onEdit(purchase)
      return
    }
    onOpenChange(false)
    navigate({ to: '/purchase-invoice', search: { editId: String(purchase.id || purchase._id) } as never })
  }
  const doRecordPayment = () => {
    if (!purchase) return
    if (onRecordPayment) onRecordPayment(purchase)
    else setPaymentOpen(true)
  }
  const openSupplierLedger = () => {
    if (!supplierId) return
    onOpenChange(false)
    navigate({ to: '/accounting', search: { tab: 'supplier-ledger', supplierId, supplierName: purchase?.supplier?.name } as never })
  }

  const totalLineDiscount = useMemo(
    () => (purchase?.items || []).reduce((sum: number, item: any) => sum + Number(item.discountAmount || 0), 0),
    [purchase]
  )
  const totalLineTax = useMemo(
    () => (purchase?.items || []).reduce((sum: number, item: any) => sum + Number(item.taxAmount || 0), 0),
    [purchase]
  )
  const companyName = resolveBranchCompanyName(orgData?.name, branchData?.name)
  const companyNameUrdu = branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim()
  const companyAddress = [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
    .filter(Boolean)
    .join(', ')
  const multiComponentTax =
    purchase?.taxSystem &&
    purchase.taxSystem !== 'NONE' &&
    (taxLines.length > 1 || taxLines.reduce((sum: number, line: any) => sum + (line.components?.length || 0), 0) > 1)

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
        <SheetContent side='right' className='w-full sm:max-w-3xl' onCloseAutoFocus={onCloseAutoFocus}>
          {navigation}
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
    <>
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side='right' className='flex w-full flex-col gap-0 p-0 sm:max-w-3xl lg:max-w-5xl' onCloseAutoFocus={onCloseAutoFocus}>
        {navigation}
        {/* pr-12 keeps the action buttons clear of SheetContent's own close button, which is
            absolutely positioned at top-4 right-4 and would otherwise sit on top of them. */}
        <SheetHeader className='space-y-2 border-b px-4 py-2.5 pr-12'>
          <div className='flex flex-wrap items-start justify-between gap-3'>
            <div className='min-w-0'>
              <SheetTitle className='flex flex-wrap items-center gap-x-2 gap-y-1 text-base'>
                {purchase.invoiceNumber}
                {purchase.supplier?.name && (
                  <span className='text-sm font-normal text-muted-foreground'>· {purchase.supplier.name}</span>
                )}
                <WarehouseTag warehouseId={purchase.warehouseId} showDefault />
                {isFetching && <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />}
              </SheetTitle>
              <SheetDescription className='flex flex-wrap items-center gap-1.5'>
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
              {settlement.remainingAmount > 0.001 && canCreate && (
                <Button size='sm' variant='outline' onClick={doRecordPayment}>
                  <HandCoins className='mr-2 h-4 w-4' />
                  {t('Record Payment')}
                </Button>
              )}
              {canEdit && (
                <Button size='sm' variant='outline' onClick={doEdit}>
                  <Edit className='mr-2 h-4 w-4' />
                  {t('Edit')}
                </Button>
              )}
              <PrintFormatButton
                size='sm'
                variant='default'
                label={t('Print') || 'Print'}
                defaultPaperSize={printer.defaultPaperSize}
                allowedFormats={['thermal80', 'thermal58', 'a4', 'a5']}
                onPrint={(paperSize) => doPrint(paperSize)}
              />
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button size='icon' variant='outline' className='h-8 w-8' aria-label={t('More actions') || 'More actions'}>
                    <MoreHorizontal className='h-4 w-4' />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-52'>
                  <DropdownMenuItem onSelect={() => doPrint('a4')}>
                    <FileDown className='mr-2 h-4 w-4' />
                    {t('Download PDF')}
                  </DropdownMenuItem>
                  {canCreate && onDuplicate && (
                    <DropdownMenuItem onSelect={() => onDuplicate(purchase)}>
                      <Copy className='mr-2 h-4 w-4' />
                      {t('Duplicate')}
                    </DropdownMenuItem>
                  )}
                  {supplierId && (
                    <DropdownMenuItem onSelect={openSupplierLedger}>
                      <BookOpen className='mr-2 h-4 w-4' />
                      {t('Supplier Ledger') || 'Supplier ledger'}
                    </DropdownMenuItem>
                  )}
                  {canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className='text-destructive focus:text-destructive' onSelect={() => setDeleteOpen(true)}>
                        <Trash2 className='mr-2 h-4 w-4' />
                        {t('Delete')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Money at a glance */}
          <div className='grid grid-cols-3 gap-2'>
            <div className='rounded-md border bg-muted/40 px-2.5 py-1.5'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Invoice Total')}</p>
              <p className='text-base font-semibold tabular-nums'>{formatMoney(settlement.totalAmount)}</p>
            </div>
            <div className='rounded-md border bg-muted/40 px-2.5 py-1.5'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Paid')}</p>
              <p
                className={cn(
                  'text-base font-semibold tabular-nums',
                  // Nothing paid is not good news — only colour it once money has actually landed.
                  settlement.settledAmount > 0.001
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-muted-foreground'
                )}
              >
                {formatMoney(settlement.settledAmount)}
              </p>
            </div>
            <div className='rounded-md border bg-muted/40 px-2.5 py-1.5'>
              <p className='text-[11px] uppercase tracking-wide text-muted-foreground'>{t('Remaining')}</p>
              <p
                className={cn(
                  'text-base font-semibold tabular-nums',
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
          <TabsList className='mx-4 mt-2 grid h-8 w-auto grid-cols-4'>
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
            <TabsContent value='overview' className='m-0 bg-muted/30 p-3'>
              {/* The purchase laid out like its printed copy: company header, supplier,
                  lines, totals, notes. */}
              <article className='overflow-hidden rounded-lg border bg-card shadow-sm'>
                <div className='h-1.5 bg-primary' />
                <div className='space-y-3 p-3 sm:p-4'>
                  <header className='flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between'>
                    <div className='flex min-w-0 items-start gap-3'>
                      {orgData?.logo?.url && (
                        <img src={orgData.logo.url} alt='' className='h-10 w-10 shrink-0 rounded-md border bg-white object-contain p-1' />
                      )}
                      <div className='min-w-0 space-y-0.5'>
                        <BilingualName
                          primary={companyName || '—'}
                          secondary={companyNameUrdu}
                          primaryClassName='text-base font-bold leading-tight'
                        />
                        {companyAddress && <p className='text-xs text-muted-foreground'>{companyAddress}</p>}
                        {(branchData?.phone || branchData?.email) && (
                          <p className='text-xs text-muted-foreground'>
                            {[branchData?.phone, branchData?.email].filter(Boolean).join(' · ')}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className='shrink-0 sm:text-right'>
                      <p className='text-base font-bold uppercase leading-tight tracking-wider text-primary'>{t('Purchase Invoice')}</p>
                      <dl className='mt-1 grid grid-cols-[auto_auto] gap-x-3 text-xs sm:justify-end'>
                        <dt className='text-muted-foreground'>{t('Invoice No') || 'Invoice No'}</dt>
                        <dd className='font-mono font-semibold'>{purchase.invoiceNumber}</dd>
                        {purchase.vendorBillNumber && (
                          <>
                            <dt className='text-muted-foreground'>{t('Vendor Bill No')}</dt>
                            <dd className='font-mono font-medium'>{purchase.vendorBillNumber}</dd>
                          </>
                        )}
                        <dt className='text-muted-foreground'>{t('Purchase Date')}</dt>
                        <dd className='font-medium'>{formatAppDate(new Date(purchase.purchaseDate || purchase.createdAt))}</dd>
                        {purchase.dueDate && (
                          <>
                            <dt className='text-muted-foreground'>{t('Due Date')}</dt>
                            <dd
                              className={cn(
                                'font-medium',
                                settlement.dueStatus === 'overdue' && 'text-rose-600 dark:text-rose-400'
                              )}
                            >
                              {formatAppDate(new Date(purchase.dueDate))}
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                  </header>

                  <section className='grid gap-3 sm:grid-cols-2'>
                    <div className='rounded-md border bg-muted/30 px-3 py-2'>
                      <p className='mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>
                        {t('Supplier') || 'Supplier'}
                      </p>
                      <div className='flex items-start gap-3'>
                        <ContactPhotoCell
                          picture={purchase.supplier?.picture}
                          name={purchase.supplier?.name || 'N/A'}
                          className='h-10 w-10 shrink-0'
                        />
                        <div className='min-w-0 flex-1 space-y-0.5'>
                          <BilingualName
                            primary={purchase.supplier?.name || 'N/A'}
                            secondary={purchase.supplier?.nameUrdu}
                            primaryClassName='font-semibold'
                          />
                          <div className='space-y-0.5 text-xs text-muted-foreground'>
                            {purchase.supplier?.phone && (
                              <p className='flex items-center gap-1'>
                                <Phone className='h-3 w-3' />
                                {purchase.supplier.phone}
                              </p>
                            )}
                            {purchase.supplier?.address && <p>{purchase.supplier.address}</p>}
                            {purchase.supplier?.taxNumber && (
                              <p>
                                {t('Tax No')}: {purchase.supplier.taxNumber}
                              </p>
                            )}
                          </div>
                          {supplierId && (
                            <Button variant='link' size='sm' className='h-auto p-0 text-xs' onClick={openSupplierLedger}>
                              {t('View ledger')}
                              <ArrowUpRight className='ml-0.5 h-3 w-3' />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className='grid grid-cols-2 gap-x-4 gap-y-1.5 rounded-md border px-3 py-2'>
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
                        {purchase.updatedAt ? formatAppDateTime(new Date(purchase.updatedAt)) : <NotSet label={t('Never edited')} />}
                      </Field>
                      <Field label={t('Items')}>
                        {purchase.items?.length || 0} · {t('Qty') || 'Qty'} {totalQuantity}
                      </Field>
                      {dueContext && <Field label={t('Due')}>{dueContext}</Field>}
                    </div>
                  </section>

                  <section className='overflow-x-auto rounded-md border'>
                    <table className='w-full min-w-[560px] text-[13px]'>
                      <thead>
                        <tr className='bg-muted/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground'>
                          <th className='w-10 px-3 py-1.5 font-semibold'>#</th>
                          <th className='px-3 py-1.5 font-semibold'>{t('Product')}</th>
                          <th className='px-3 py-1.5 text-right font-semibold'>{t('Quantity')}</th>
                          {/* NOT t('unit_price') — that resolves to "Unit Sale Price", which is
                              the sales vocabulary. On a purchase this is what we paid. */}
                          <th className='px-3 py-1.5 text-right font-semibold'>{t('Unit Cost')}</th>
                          {totalLineDiscount > 0.001 && <th className='px-3 py-1.5 text-right font-semibold'>{t('Disc.') || 'Disc.'}</th>}
                          {totalLineTax > 0.001 && <th className='px-3 py-1.5 text-right font-semibold'>{t('Tax')}</th>}
                          <th className='px-3 py-1.5 text-right font-semibold'>{t('Total')}</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y'>
                        {(purchase.items || []).map((item: any, index: number) => {
                          const price = item.priceAtPurchase || item.price || item?.product?.cost || 0
                          const gross = (item.quantity || 0) * price
                          const discountAmount = Number(item.discountAmount || 0)
                          const total = item.total ?? gross - discountAmount
                          const details = [
                            getPurchaseItemBarcode(item),
                            item.batchNumber && `Batch: ${item.batchNumber}`,
                            item.expiryDate && `Exp: ${formatAppDate(new Date(item.expiryDate))}`,
                            Number(item.sellingPriceAtPurchase) > 0 && `${t('Sale price') || 'Sale price'}: ${formatMoney(Number(item.sellingPriceAtPurchase))}`,
                          ].filter(Boolean)
                          return (
                            <tr key={index} className='align-top'>
                              <td className='px-3 py-1.5 tabular-nums text-muted-foreground'>{index + 1}</td>
                              <td className='px-3 py-1.5'>
                                <BilingualName
                                  primary={getPurchaseItemDisplayName(item)}
                                  secondary={item.product?.nameUrdu}
                                  primaryClassName='font-medium'
                                  secondaryClassName='text-xs'
                                />
                                {details.length > 0 && <p className='text-xs text-muted-foreground'>{details.join(' · ')}</p>}
                                {item.imeis?.length > 0 && (
                                  <p className='text-xs text-muted-foreground'>IMEI: {formatImeiEntries(item.imeis)}</p>
                                )}
                              </td>
                              <td className='whitespace-nowrap px-3 py-1.5 text-right tabular-nums'>
                                {item.quantity || 0} <span className='text-xs text-muted-foreground'>{item.unit || ''}</span>
                              </td>
                              <td className='whitespace-nowrap px-3 py-1.5 text-right tabular-nums'>{formatMoney(Number(price))}</td>
                              {totalLineDiscount > 0.001 && (
                                <td className='whitespace-nowrap px-3 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                                  {discountAmount > 0 ? `−${formatMoney(discountAmount)}` : <span className='text-muted-foreground'>—</span>}
                                </td>
                              )}
                              {totalLineTax > 0.001 && (
                                <td className='whitespace-nowrap px-3 py-1.5 text-right tabular-nums'>
                                  {Number(item.taxAmount) > 0 ? formatMoney(Number(item.taxAmount)) : <span className='text-muted-foreground'>—</span>}
                                </td>
                              )}
                              <td className='whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums'>{formatMoney(Number(total))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {(purchase.items || []).length > 0 && (
                        <tfoot>
                          <tr className='border-t bg-muted/40 font-medium'>
                            <td className='px-3 py-2' />
                            <td className='px-3 py-2 text-muted-foreground'>
                              {purchase.items.length} {t('line(s)')}
                            </td>
                            <td className='px-3 py-2 text-right tabular-nums'>{totalQuantity}</td>
                            <td className='px-3 py-2' />
                            {totalLineDiscount > 0.001 && (
                              <td className='px-3 py-2 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                                −{formatMoney(totalLineDiscount)}
                              </td>
                            )}
                            {totalLineTax > 0.001 && <td className='px-3 py-2 text-right tabular-nums'>{formatMoney(totalLineTax)}</td>}
                            <td className='px-3 py-2 text-right tabular-nums'>{formatMoney(subtotal)}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </section>

                  <section className='grid gap-4 sm:grid-cols-[1fr_minmax(0,280px)]'>
                    <div className='order-2 space-y-4 sm:order-1'>
                      {purchase.notes && (
                        <div>
                          <p className='mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground'>{t('Notes')}</p>
                          <p className='whitespace-pre-wrap rounded-md border bg-muted/30 p-3 text-sm'>{purchase.notes}</p>
                        </div>
                      )}
                      <div
                        className={cn(
                          'inline-flex -rotate-3 select-none items-center rounded-md border-2 px-3 py-1 text-sm font-extrabold uppercase tracking-[0.2em] opacity-80',
                          statusMeta.className
                        )}
                        aria-hidden
                      >
                        {t(statusMeta.label)}
                      </div>
                    </div>

                    <div className='order-1 text-[13px] sm:order-2'>
                      <div className='flex justify-between py-0.5'>
                        <span className='text-muted-foreground'>{t('Subtotal')}</span>
                        <span className='tabular-nums'>{formatMoney(subtotal)}</span>
                      </div>
                      {Number(purchase.discount || 0) > 0 && (
                        <div className='flex justify-between py-0.5'>
                          <span className='text-muted-foreground'>
                            {t('Discount')}
                            {purchase.discountType === 'percentage' && Number(purchase.discountValue) > 0 ? ` (${purchase.discountValue}%)` : ''}
                          </span>
                          <span className='tabular-nums text-emerald-600 dark:text-emerald-400'>−{formatMoney(Number(purchase.discount))}</span>
                        </div>
                      )}
                      {Number(purchase.tax || 0) > 0 && (
                        <div className='flex justify-between py-0.5'>
                          <span className='text-muted-foreground'>
                            {t('Input tax')}
                            {purchase.taxInclusive ? ` (${t('inclusive') || 'inclusive'})` : ''}
                          </span>
                          <span className='tabular-nums'>{formatMoney(Number(purchase.tax))}</span>
                        </div>
                      )}
                      {multiComponentTax && (
                        <div className='py-1'>
                          <TaxBreakdownSummary taxLines={taxLines} totalTax={purchase.tax || 0} compact />
                        </div>
                      )}
                      <div className='mt-1 flex items-baseline justify-between border-y-2 border-foreground/80 py-1.5 text-[15px] font-bold'>
                        <span>{t('Total Amount')}</span>
                        <span className='tabular-nums'>{formatMoney(Number(purchase.totalAmount || 0))}</span>
                      </div>
                      <div className='flex justify-between py-0.5'>
                        <span className='text-muted-foreground'>{t('Paid')}</span>
                        <span className='tabular-nums text-emerald-600 dark:text-emerald-400'>{formatMoney(settlement.settledAmount)}</span>
                      </div>
                      <div
                        className={cn(
                          'mt-1 flex items-baseline justify-between rounded-md px-3 py-2 font-semibold',
                          settlement.remainingAmount > 0.001
                            ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                            : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                        )}
                      >
                        <span>{t('Remaining')}</span>
                        <span className='tabular-nums'>{formatMoney(Math.max(0, settlement.remainingAmount))}</span>
                      </div>
                    </div>
                  </section>
                </div>
              </article>
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
                          {payment.direction === 'discount' && (
                            <Badge variant='outline' className='border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400'>
                              {t('Discount received')}
                            </Badge>
                          )}
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
                          {formatAppDate(new Date(payment.paymentDate))} ·{' '}
                          {/* A return settles the invoice with goods, not money — saying
                              "Cash" here would read as a payment that never happened. */}
                          {payment.direction === 'return_credit'
                            ? t('Goods returned')
                            : payment.direction === 'discount'
                            ? t('Discount (no cash)')
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
                                {entry.createdAt ? formatAppDateTime(new Date(entry.createdAt)) : ''}
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
                            {formatAppDateTime(new Date(log.createdAt))}
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

    {canDelete && (
      <InvoiceDeleteDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        currentRow={purchase}
        onDeleted={() => onOpenChange(false)}
      />
    )}
    {!onRecordPayment && (
      <SupplierPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultSupplierId={supplierId || undefined} />
    )}
    </>
  )
}

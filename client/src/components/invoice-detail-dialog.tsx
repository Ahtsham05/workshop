import { useMemo, useState, type ReactNode } from 'react'
import { formatPaymentMethod } from '@/lib/payment-modes'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  ArrowUpRight,
  Banknote,
  BookOpen,
  Edit,
  FileCheck,
  FileDown,
  Flag,
  Loader2,
  MoreHorizontal,
  Phone,
  Mail,
  MapPin,
  Trash2,
} from 'lucide-react'
import { useGetInvoiceByIdQuery, useUpdateInvoiceFlagMutation } from '@/stores/invoice.api'
import { useGetInvoicePaymentsQuery } from '@/stores/customerPayment.api'
import { formatImeiEntries } from '@/stores/imei.api'
import type { TaxLine } from '@/stores/taxCalculator.api'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { WarehouseTag } from '@/components/warehouse-tag'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BilingualName } from '@/components/bilingual-name'
import { FlagBadge, FlagPickerPopover } from '@/components/flag-badge'
import { PrintFormatButton } from '@/components/print-format-button'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate, formatAppDateTime } from '@/lib/date-format'
import { invoiceTermsToSafeHtml } from '@/lib/rich-text-utils'
import { cn } from '@/lib/utils'
import { resolveBranchCompanyName } from '@/utils/branch-company-name'
import { useInvoicePrinter } from '@/features/invoice/hooks/use-invoice-printer'
import { normalizeInvoiceForEdit } from '@/features/invoice/utils/invoice-edit-normalize'
import {
  DUE_STATUS_META,
  SETTLEMENT_STATUS_META,
  resolveInvoiceSettlement,
} from '@/features/invoice/utils/invoice-settlement'
import { InvoiceDeleteDialog } from '@/features/invoice/components/invoice-delete-dialog'
import { CustomerPaymentDialog } from '@/features/invoice/components/customer-payment-dialog'
import { QuotationConvertDialog } from '@/features/invoice/components/quotation-convert-dialog'
import { TaxBreakdownSummary } from '@/features/invoice/components/tax-breakdown-summary'

const TYPE_META: Record<string, { label: string; className: string }> = {
  cash: { label: 'Cash', className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  credit: { label: 'Credit', className: 'border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400' },
  pending: { label: 'Pending', className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  quotation: { label: 'Quotation', className: 'border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400' },
}

const SHEET_FORMATS = ['thermal80', 'thermal58', 'a4', 'a5', 'a4-half-left', 'a4-half-right'] as const

const toNumber = (value: unknown) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const safeDate = (value: unknown) => {
  if (!value) return null
  const d = new Date(value as string)
  return Number.isNaN(d.getTime()) ? null : d
}

const refOf = (value: unknown): Record<string, any> | undefined =>
  value && typeof value === 'object' ? (value as Record<string, any>) : undefined

const userName = (value: unknown) => refOf(value)?.name || refOf(value)?.email || ''

/** Primary tender with its reference — "Cash", "Check #10234", "Credit Card · Card 4242". */
function paymentMethodLabel(invoice: any) {
  return formatPaymentMethod({ ...invoice, type: undefined, splitPaymentMethod: undefined }) || 'Cash'
}

function customerAddress(customer: Record<string, any> | undefined) {
  if (!customer) return ''
  const b = customer.billingAddress || {}
  const structured = [b.line1, b.line2, b.city, b.state, b.postalCode].filter(Boolean).join(', ')
  return structured || String(customer.address || '').trim()
}

function TotalRow({
  label,
  value,
  className,
  hint,
}: {
  label: ReactNode
  value: ReactNode
  className?: string
  hint?: ReactNode
}) {
  return (
    <div className={cn('flex items-baseline justify-between gap-4 py-0.5', className)}>
      <span className='text-muted-foreground'>
        {label}
        {hint && <span className='block text-[11px] font-normal'>{hint}</span>}
      </span>
      <span className='tabular-nums'>{value}</span>
    </div>
  )
}

interface InvoiceDetailDialogProps {
  invoiceId?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Where focus goes when the dialog closes — e.g. back to the list that opened it, since a
   *  dialog opened without a Trigger otherwise drops focus on <body>. */
  onCloseAutoFocus?: (event: Event) => void
  /** Optional bar above the details — the previous/next stepper (see record-navigator.tsx). */
  navigation?: ReactNode
  /** The list row, shown at once while the full invoice is fetched. */
  fallbackInvoice?: any
  /** Open the invoice in the edit form. Defaults to navigating to /invoice?editId=…, which
   *  works from any screen. Receives the invoice with populated refs flattened to ids. */
  onEdit?: (invoice: any) => void
}

/**
 * The "view invoice" dialog used everywhere an invoice can be opened (invoice list,
 * previous/next navigator, ledgers, rate history). It reads like the printed invoice —
 * company header, Bill To, line items, totals, notes and terms — and carries every action
 * the invoice supports: print (any paper size), PDF, record payment, convert quotation,
 * edit, flag, open the customer's ledger and delete. Each action is permission-gated.
 */
export function InvoiceDetailDialog({
  invoiceId,
  open,
  onOpenChange,
  onCloseAutoFocus,
  navigation,
  fallbackInvoice,
  onEdit,
}: InvoiceDetailDialogProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const { hasExplicitPermission } = usePermissions()
  const canEdit = hasExplicitPermission('editInvoices')
  const canDelete = hasExplicitPermission('deleteInvoices')
  const canCreate = hasExplicitPermission('createInvoices')

  const { data: fetched, isLoading, isFetching, error } = useGetInvoiceByIdQuery(invoiceId, { skip: !invoiceId || !open })
  const invoice: any = fetched || fallbackInvoice
  const isQuotation = invoice?.type === 'quotation'
  const { data: settlementDetail } = useGetInvoicePaymentsQuery(invoiceId as string, {
    skip: !invoiceId || !open || !invoice || isQuotation,
  })

  const printer = useInvoicePrinter()
  const { branchData, orgData } = printer
  const [updateInvoiceFlag] = useUpdateInvoiceFlagMutation()

  const [deleteOpen, setDeleteOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [convertOpen, setConvertOpen] = useState(false)

  const settlement = useMemo(
    () => (invoice ? resolveInvoiceSettlement({ ...invoice, ...(settlementDetail || {}) }) : null),
    [invoice, settlementDetail]
  )

  const items: any[] = useMemo(() => invoice?.items || [], [invoice])
  const totals = useMemo(() => {
    let qty = 0
    let gross = 0
    let itemDiscount = 0
    let lineTax = 0
    for (const item of items) {
      qty += toNumber(item.quantity)
      gross += toNumber(item.quantity) * toNumber(item.unitPrice)
      itemDiscount += toNumber(item.discountAmount)
      lineTax += toNumber(item.taxAmount)
    }
    return { qty, gross, itemDiscount, lineTax }
  }, [items])
  const showDiscountColumn = totals.itemDiscount > 0.001
  const showTaxColumn = totals.lineTax > 0.001

  const customer = refOf(invoice?.customerId) || refOf(invoice?.customer)
  const customerIdStr: string | undefined =
    invoice && invoice.customerId !== 'walk-in'
      ? (customer?._id || customer?.id || (typeof invoice.customerId === 'string' ? invoice.customerId : undefined))?.toString()
      : undefined
  const isWalkIn = !customerIdStr
  const customerName = isWalkIn
    ? invoice?.walkInCustomerName || t('walk_in_customer') || 'Walk-in Customer'
    : customer?.name || invoice?.customerName || '—'

  const companyName = resolveBranchCompanyName(orgData?.name, branchData?.name)
  const companyNameUrdu = branchData?.nameUrdu?.trim() || orgData?.nameUrdu?.trim()
  const companyAddress = [branchData?.location?.address, branchData?.location?.city, branchData?.location?.country]
    .filter(Boolean)
    .join(', ')

  const docTitle = isQuotation
    ? t('Quotation') || 'Quotation'
    : invoice?.type === 'credit'
      ? t('Credit Invoice') || 'Credit Invoice'
      : invoice?.type === 'pending'
        ? t('Pending Invoice') || 'Pending Invoice'
        : t('Sales Invoice') || 'Sales Invoice'

  const statusMeta = settlement ? SETTLEMENT_STATUS_META[settlement.settlementStatus] : null
  const dueMeta = settlement ? DUE_STATUS_META[settlement.dueStatus] : null
  const typeMeta = TYPE_META[invoice?.type] || TYPE_META.cash
  const remaining = Math.max(0, settlement?.remainingAmount ?? 0)
  const settledPercent =
    settlement && settlement.total > 0
      ? Math.min(100, Math.max(0, Math.round((settlement.settledAmount / settlement.total) * 100)))
      : 0

  const taxLines: TaxLine[] = invoice?.taxLines || []
  const multiComponentTax =
    invoice?.taxSystem &&
    invoice.taxSystem !== 'NONE' &&
    (taxLines.length > 1 || taxLines.reduce((sum, line) => sum + (line.components?.length || 0), 0) > 1)

  const invoiceDate = safeDate(invoice?.invoiceDate || invoice?.createdAt)
  const dueDate = safeDate(invoice?.dueDate)
  const createdAt = safeDate(invoice?.createdAt)
  const updatedAt = safeDate(invoice?.updatedAt)
  const payments = settlementDetail?.payments || []
  const paidAtSale = settlementDetail?.paidAtSale ?? toNumber(invoice?.paidAmount)

  const handleEdit = () => {
    if (!invoice) return
    const normalized = normalizeInvoiceForEdit(invoice)
    onOpenChange(false)
    if (onEdit) {
      onEdit(normalized)
    } else {
      navigate({ to: '/invoice', search: { editId: String(invoice._id || invoice.id) } as never })
    }
  }

  const openLedger = () => {
    if (!customerIdStr) return
    onOpenChange(false)
    navigate({
      to: '/accounting',
      search: { tab: 'customer-ledger', customerId: customerIdStr, customerName: customer?.name } as never,
    })
  }

  const invoiceKey = invoice ? String(invoice._id || invoice.id) : ''
  const isPrinting = printer.printingId === invoiceKey

  const dueContext = (() => {
    if (!dueDate || remaining <= 0.001 || isQuotation) return ''
    const days = Math.ceil((new Date(dueDate).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86_400_000)
    if (days < 0) return `${t('Overdue by') || 'Overdue by'} ${Math.abs(days)} ${t('day(s)') || 'day(s)'}`
    if (days === 0) return t('Due today') || 'Due today'
    return `${t('Due in') || 'Due in'} ${days} ${t('day(s)') || 'day(s)'}`
  })()
  const contactBits = [
    customer?.phone && (
      <span key='p' className='inline-flex items-center gap-1'>
        <Phone className='h-3 w-3' />
        {customer.phone}
      </span>
    ),
    customer?.email && (
      <span key='e' className='inline-flex items-center gap-1'>
        <Mail className='h-3 w-3' />
        {customer.email}
      </span>
    ),
    customerAddress(customer) && (
      <span key='a' className='inline-flex items-center gap-1'>
        <MapPin className='h-3 w-3' />
        {customerAddress(customer)}
      </span>
    ),
    customer?.taxNumber && (
      <span key='t'>
        {t('Tax No') || 'Tax No'}: {customer.taxNumber}
      </span>
    ),
  ].filter(Boolean)
  const hasNotes = Boolean(invoice?.notes?.trim() || invoice?.termsAndConditions?.trim() || invoice?.returnPolicy?.trim())

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className='flex !max-h-[92vh] w-full !max-w-[min(97vw,1200px)] flex-col gap-0 overflow-hidden p-0'
          onCloseAutoFocus={onCloseAutoFocus}
        >
          {navigation}

          {/* ── Toolbar: identity + every action, one compact row ─────────────── */}
          <div className='flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b px-4 py-2 pr-12'>
            <div className='flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1'>
              <DialogTitle className='flex items-center gap-2 text-base font-semibold'>
                {docTitle}
                {invoice?.invoiceNumber && (
                  <span className='font-mono text-sm font-semibold text-muted-foreground'>#{invoice.invoiceNumber}</span>
                )}
              </DialogTitle>
              <DialogDescription asChild>
                <div className='flex flex-wrap items-center gap-1'>
                  {invoice && (
                    <Badge variant='outline' className={cn('h-5 px-1.5 text-[11px] font-normal', typeMeta.className)}>
                      {t(typeMeta.label)}
                    </Badge>
                  )}
                  {invoice && !isQuotation && statusMeta && (
                    <Badge variant='outline' className={cn('h-5 px-1.5 text-[11px] font-normal', statusMeta.className)}>
                      {t(statusMeta.label)}
                    </Badge>
                  )}
                  {invoice && !isQuotation && settlement?.dueStatus === 'overdue' && dueMeta && (
                    <Badge variant='outline' className={cn('h-5 px-1.5 text-[11px] font-normal', dueMeta.className)}>
                      {t(dueMeta.label)}
                    </Badge>
                  )}
                  {invoice?.type === 'pending' && invoice?.isConvertedToBill && (
                    <Badge className='h-5 bg-green-600 px-1.5 text-[11px] font-normal text-white'>
                      {t('converted_pending') || 'Converted'}
                    </Badge>
                  )}
                  {invoice && <FlagBadge flag={invoice.flag} />}
                  {invoice && !isQuotation && <WarehouseTag warehouseId={invoice.warehouseId} showDefault />}
                  {(isFetching || isLoading) && <Loader2 className='h-3.5 w-3.5 animate-spin text-muted-foreground' />}
                </div>
              </DialogDescription>
            </div>

            {invoice && (
              <div className='flex flex-wrap items-center gap-1.5'>
                {isQuotation && canEdit && (
                  <Button size='sm' variant='outline' className='h-8' onClick={() => setConvertOpen(true)}>
                    <FileCheck className='mr-1.5 h-4 w-4' />
                    {t('convert_to_invoice') || 'Convert to Invoice'}
                  </Button>
                )}
                {!isQuotation && canCreate && remaining > 0.001 && customerIdStr && (
                  <Button size='sm' variant='outline' className='h-8' onClick={() => setPaymentOpen(true)}>
                    <Banknote className='mr-1.5 h-4 w-4' />
                    {t('Record Payment')}
                  </Button>
                )}
                {canEdit && (
                  <Button size='sm' variant='outline' className='h-8' onClick={handleEdit}>
                    <Edit className='mr-1.5 h-4 w-4' />
                    {t('Edit')}
                  </Button>
                )}
                {printer.canPrint && (
                  <PrintFormatButton
                    size='sm'
                    variant='default'
                    label={t('Print') || 'Print'}
                    defaultPaperSize={printer.defaultPaperSize}
                    allowedFormats={[...SHEET_FORMATS]}
                    invoiceHeaderStyles
                    disabled={isPrinting}
                    mainButtonContent={isPrinting ? <Loader2 className='h-4 w-4 animate-spin' /> : undefined}
                    onPrint={(paperSize) => printer.printInvoice(invoice, paperSize)}
                  />
                )}
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button size='icon' variant='outline' className='h-8 w-8' aria-label={t('More actions') || 'More actions'}>
                      <MoreHorizontal className='h-4 w-4' />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align='end' className='w-52'>
                    {printer.canPrint && (
                      <DropdownMenuItem onSelect={() => printer.printInvoice(invoice, 'a4')}>
                        <FileDown className='mr-2 h-4 w-4' />
                        {t('Download PDF')}
                      </DropdownMenuItem>
                    )}
                    {customerIdStr && (
                      <DropdownMenuItem onSelect={openLedger}>
                        <BookOpen className='mr-2 h-4 w-4' />
                        {t('Customer Ledger') || 'Customer ledger'}
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
                {canEdit && (
                  <FlagPickerPopover
                    flag={invoice.flag}
                    onSave={async (data) => {
                      try {
                        await updateInvoiceFlag({ id: invoiceKey, ...data }).unwrap()
                        toast.success(invoice.flag ? 'Flag updated' : 'Invoice flagged for review')
                      } catch {
                        toast.error('Failed to update flag')
                      }
                    }}
                    onClear={async () => {
                      try {
                        await updateInvoiceFlag({ id: invoiceKey, clear: true }).unwrap()
                        toast.success('Flag cleared')
                      } catch {
                        toast.error('Failed to clear flag')
                      }
                    }}
                    trigger={
                      <Button size='icon' variant='outline' className='h-8 w-8' title={t('Flag for review') || 'Flag for review'}>
                        <Flag
                          className='h-4 w-4'
                          style={invoice.flag ? { color: invoice.flag.color, fill: invoice.flag.color } : undefined}
                        />
                      </Button>
                    }
                  />
                )}
              </div>
            )}
          </div>

          {/* ── Body: document on the left, money + details on the right ────── */}
          <div className='min-h-0 flex-1 overflow-y-auto bg-muted/30 p-3'>
            {isLoading && !invoice && (
              <div className='flex h-40 items-center justify-center text-sm text-muted-foreground'>
                <Loader2 className='mr-2 h-4 w-4 animate-spin' />
                {t('loading') || 'Loading...'}
              </div>
            )}
            {!isLoading && !invoice && (error || invoiceId) && (
              <div className='py-10 text-center text-sm text-destructive'>
                {t('failed_to_load_invoice') || 'Failed to load invoice details'}
              </div>
            )}

            {invoice && settlement && (
              <div className='grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start'>
                {/* The document, laid out like the printed invoice but dense */}
                <article className='min-w-0 overflow-hidden rounded-lg border bg-card shadow-sm'>
                  <div className='h-1 bg-primary' />

                  {/* Company + document header */}
                  <header className='flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between'>
                    <div className='flex min-w-0 items-center gap-2.5'>
                      {orgData?.logo?.url && (
                        <img src={orgData.logo.url} alt='' className='h-10 w-10 shrink-0 rounded border bg-white object-contain p-0.5' />
                      )}
                      <div className='min-w-0'>
                        <BilingualName
                          primary={companyName || '—'}
                          secondary={companyNameUrdu}
                          primaryClassName='text-sm font-bold leading-tight'
                          secondaryClassName='text-xs'
                        />
                        <p className='truncate text-[11px] text-muted-foreground' title={companyAddress}>
                          {[companyAddress, branchData?.phone, branchData?.email].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                    </div>
                    <div className='shrink-0 sm:text-right'>
                      <p className='text-base font-bold uppercase leading-tight tracking-wider text-primary'>{docTitle}</p>
                      <dl className='mt-1 grid grid-cols-[auto_auto] gap-x-3 text-xs sm:justify-end'>
                        <dt className='text-muted-foreground'>{isQuotation ? t('Quotation No') || 'Quotation No' : t('Invoice No') || 'Invoice No'}</dt>
                        <dd className='font-mono font-semibold'>{invoice.invoiceNumber || '—'}</dd>
                        <dt className='text-muted-foreground'>{t('date') || 'Date'}</dt>
                        <dd className='font-medium'>{invoiceDate ? formatAppDate(invoiceDate) : '—'}</dd>
                        {dueDate && (
                          <>
                            <dt className='text-muted-foreground'>{t('Due Date')}</dt>
                            <dd className={cn('font-medium', settlement.dueStatus === 'overdue' && 'text-rose-600 dark:text-rose-400')}>
                              {formatAppDate(dueDate)}
                            </dd>
                          </>
                        )}
                        {invoice.billNumber && (
                          <>
                            <dt className='text-muted-foreground'>{t('bill_number') || 'Bill No'}</dt>
                            <dd className='font-mono font-medium text-green-600'>{invoice.billNumber}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  </header>

                  {/* Bill To — one line of contact details */}
                  <section className='flex flex-wrap items-start justify-between gap-x-4 gap-y-1 border-b bg-muted/30 px-4 py-2'>
                    <div className='min-w-0'>
                      <p className='text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>{t('Bill To') || 'Bill To'}</p>
                      <BilingualName
                        primary={customerName}
                        secondary={isWalkIn ? undefined : customer?.nameUrdu}
                        primaryClassName='text-sm font-semibold'
                        secondaryClassName='text-xs'
                      />
                      {contactBits.length > 0 && (
                        <div className='mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground'>{contactBits}</div>
                      )}
                    </div>
                    {customerIdStr && (
                      <Button variant='link' size='sm' className='h-auto shrink-0 p-0 text-xs' onClick={openLedger}>
                        {t('View ledger') || 'View ledger'}
                        <ArrowUpRight className='ml-0.5 h-3 w-3' />
                      </Button>
                    )}
                  </section>

                  {/* Line items */}
                  <div className='overflow-x-auto'>
                    <table className='w-full min-w-[560px] text-[13px]'>
                      <thead>
                        <tr className='border-b bg-muted/50 text-left text-[10.5px] uppercase tracking-wide text-muted-foreground'>
                          <th className='w-8 px-3 py-1.5 font-semibold'>#</th>
                          <th className='px-2 py-1.5 font-semibold'>{t('Item') || 'Item'}</th>
                          <th className='px-2 py-1.5 text-right font-semibold'>{t('Qty') || 'Qty'}</th>
                          <th className='px-2 py-1.5 text-right font-semibold'>{t('Rate') || 'Rate'}</th>
                          {showDiscountColumn && <th className='px-2 py-1.5 text-right font-semibold'>{t('Disc.') || 'Disc.'}</th>}
                          {showTaxColumn && <th className='px-2 py-1.5 text-right font-semibold'>{t('tax') || 'Tax'}</th>}
                          <th className='px-3 py-1.5 text-right font-semibold'>{t('Amount') || 'Amount'}</th>
                        </tr>
                      </thead>
                      <tbody className='divide-y'>
                        {items.length === 0 && (
                          <tr>
                            <td colSpan={7} className='px-3 py-6 text-center text-muted-foreground'>
                              {t('no_items') || 'No items'}
                            </td>
                          </tr>
                        )}
                        {items.map((item, index) => {
                          const product = refOf(item.productId)
                          const variant = refOf(item.variantId)
                          const batch = refOf(item.batchId)
                          const variantLabel = variant?.attributes
                            ? Object.values(variant.attributes as Record<string, string>).join(' / ')
                            : ''
                          const batchLabel =
                            item.batchAllocations?.length > 1
                              ? item.batchAllocations.map((a: any) => `${a.batchNumber}×${a.quantity}`).join(', ')
                              : batch?.batchNumber || item.batchNumber
                          const expiry = safeDate(batch?.expiryDate)
                          const barcode = product?.barcode || item.barcode
                          const net = item.subtotal ?? toNumber(item.quantity) * toNumber(item.unitPrice) - toNumber(item.discountAmount)
                          const details = [
                            barcode && `${t('Code') || 'Code'}: ${barcode}`,
                            variantLabel,
                            batchLabel && `${t('Batch') || 'Batch'}: ${batchLabel}`,
                            expiry && `${t('Exp') || 'Exp'}: ${formatAppDate(expiry)}`,
                            item.imeis?.length > 0 && `IMEI: ${formatImeiEntries(item.imeis)}`,
                          ].filter(Boolean)
                          return (
                            <tr key={item._id || item.id || index} className='align-top hover:bg-muted/30'>
                              <td className='px-3 py-1.5 tabular-nums text-muted-foreground'>{index + 1}</td>
                              <td className='px-2 py-1.5'>
                                <div className='flex items-start gap-2'>
                                  {item.image?.url && (
                                    <img src={item.image.url} alt='' className='h-7 w-7 shrink-0 rounded border object-cover' />
                                  )}
                                  <div className='min-w-0'>
                                    <BilingualName
                                      primary={item.name || product?.name || '—'}
                                      secondary={item.nameUrdu || product?.nameUrdu}
                                      primaryClassName='font-medium leading-snug'
                                      secondaryClassName='text-xs'
                                    />
                                    {details.length > 0 && (
                                      <p className='text-[11px] leading-snug text-muted-foreground'>{details.join(' · ')}</p>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className='whitespace-nowrap px-2 py-1.5 text-right tabular-nums'>
                                {toNumber(item.quantity)} <span className='text-[11px] text-muted-foreground'>{item.unit || ''}</span>
                              </td>
                              <td className='whitespace-nowrap px-2 py-1.5 text-right tabular-nums'>{formatMoney(toNumber(item.unitPrice))}</td>
                              {showDiscountColumn && (
                                <td className='whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                                  {toNumber(item.discountAmount) > 0 ? (
                                    <>
                                      −{formatMoney(toNumber(item.discountAmount))}
                                      {item.discountType === 'percentage' && toNumber(item.discountValue) > 0 && (
                                        <span className='ml-1 text-[11px] text-muted-foreground'>({toNumber(item.discountValue)}%)</span>
                                      )}
                                    </>
                                  ) : (
                                    <span className='text-muted-foreground'>—</span>
                                  )}
                                </td>
                              )}
                              {showTaxColumn && (
                                <td className='whitespace-nowrap px-2 py-1.5 text-right tabular-nums'>
                                  {toNumber(item.taxAmount) > 0 ? formatMoney(toNumber(item.taxAmount)) : <span className='text-muted-foreground'>—</span>}
                                </td>
                              )}
                              <td className='whitespace-nowrap px-3 py-1.5 text-right font-medium tabular-nums'>{formatMoney(toNumber(net))}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                      {items.length > 0 && (
                        <tfoot>
                          <tr className='border-t bg-muted/40 text-xs font-medium'>
                            <td className='px-3 py-1.5' />
                            <td className='px-2 py-1.5 text-muted-foreground'>
                              {items.length} {t('line(s)') || 'line(s)'}
                            </td>
                            <td className='px-2 py-1.5 text-right tabular-nums'>{totals.qty}</td>
                            <td className='px-2 py-1.5' />
                            {showDiscountColumn && (
                              <td className='px-2 py-1.5 text-right tabular-nums text-emerald-600 dark:text-emerald-400'>
                                −{formatMoney(totals.itemDiscount)}
                              </td>
                            )}
                            {showTaxColumn && <td className='px-2 py-1.5 text-right tabular-nums'>{formatMoney(totals.lineTax)}</td>}
                            <td className='px-3 py-1.5 text-right tabular-nums'>{formatMoney(toNumber(invoice.subtotal))}</td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  </div>

                  {/* Notes / terms / return policy, side by side */}
                  {hasNotes && (
                    <section className='grid gap-3 border-t px-4 py-2.5 sm:grid-cols-2'>
                      {([
                        ['notes', invoice.notes],
                        ['terms_and_conditions', invoice.termsAndConditions],
                      ] as const).map(([labelKey, html]) =>
                        html?.trim() ? (
                          <div key={labelKey} className='min-w-0'>
                            <p className='mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>{t(labelKey)}</p>
                            <div
                              className='text-xs leading-relaxed [&_b]:font-bold [&_em]:italic [&_i]:italic [&_ol]:list-decimal [&_ol]:pl-4 [&_strong]:font-bold [&_u]:underline [&_ul]:list-disc [&_ul]:pl-4'
                              dangerouslySetInnerHTML={{ __html: invoiceTermsToSafeHtml(html) }}
                            />
                          </div>
                        ) : null
                      )}
                      {invoice.returnPolicy?.trim() && (
                        <div className='min-w-0'>
                          <p className='mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
                            {t('Return Policy') || 'Return Policy'}
                          </p>
                          <p className='whitespace-pre-wrap text-xs'>{invoice.returnPolicy}</p>
                        </div>
                      )}
                    </section>
                  )}

                  <footer className='flex flex-wrap justify-between gap-x-4 gap-y-0.5 border-t px-4 py-1.5 text-[10.5px] text-muted-foreground'>
                    <span>
                      {createdAt && (
                        <>
                          {t('Created') || 'Created'} {formatAppDateTime(createdAt)}
                          {userName(invoice.createdBy) ? ` · ${userName(invoice.createdBy)}` : ''}
                        </>
                      )}
                    </span>
                    {updatedAt && createdAt && updatedAt.getTime() - createdAt.getTime() > 60_000 && (
                      <span>
                        {t('Last Updated') || 'Last updated'} {formatAppDateTime(updatedAt)}
                        {userName(invoice.updatedBy) ? ` · ${userName(invoice.updatedBy)}` : ''}
                      </span>
                    )}
                  </footer>
                </article>

                {/* ── Sidebar: totals, payment, details ─────────────────────────── */}
                <aside className='space-y-3 lg:sticky lg:top-0'>
                  <section className='rounded-lg border bg-card p-3 text-[13px] shadow-sm'>
                    <TotalRow
                      label={t('subtotal') || 'Subtotal'}
                      value={formatMoney(toNumber(invoice.subtotal))}
                      hint={
                        totals.itemDiscount > 0.001
                          ? `${t('after item discounts of') || 'after item discounts of'} ${formatMoney(totals.itemDiscount)}`
                          : undefined
                      }
                    />
                    {toNumber(invoice.discount) > 0 && (
                      <TotalRow
                        label={
                          <>
                            {t('discount') || 'Discount'}
                            {invoice.discountType === 'percentage' && toNumber(invoice.discountValue) > 0
                              ? ` (${toNumber(invoice.discountValue)}%)`
                              : ''}
                          </>
                        }
                        value={<span className='text-emerald-600 dark:text-emerald-400'>−{formatMoney(toNumber(invoice.discount))}</span>}
                      />
                    )}
                    {toNumber(invoice.tax) > 0 && (
                      <TotalRow
                        label={`${t('tax') || 'Tax'}${invoice.taxInclusive ? ` (${t('inclusive') || 'inclusive'})` : ''}`}
                        value={formatMoney(toNumber(invoice.tax))}
                      />
                    )}
                    {multiComponentTax && (
                      <div className='py-0.5'>
                        <TaxBreakdownSummary taxLines={taxLines} totalTax={invoice.tax || 0} compact />
                      </div>
                    )}
                    {toNumber(invoice.deliveryCharge) > 0 && (
                      <TotalRow label={t('Delivery Charge') || 'Delivery charge'} value={formatMoney(toNumber(invoice.deliveryCharge))} />
                    )}
                    {toNumber(invoice.serviceCharge) > 0 && (
                      <TotalRow label={t('Service Charge') || 'Service charge'} value={formatMoney(toNumber(invoice.serviceCharge))} />
                    )}
                    {Math.abs(toNumber(invoice.roundingAdjustment)) > 0.0001 && (
                      <TotalRow label={t('Rounding') || 'Rounding'} value={formatMoney(toNumber(invoice.roundingAdjustment))} />
                    )}
                    <div className='my-1 flex items-baseline justify-between gap-4 border-y border-foreground/70 py-1.5 text-[15px] font-bold'>
                      <span>{t('Grand Total') || 'Grand Total'}</span>
                      <span className='tabular-nums'>{formatMoney(toNumber(invoice.total))}</span>
                    </div>
                    {!isQuotation && (
                      <>
                        <TotalRow
                          label={t('Paid') || 'Paid'}
                          value={<span className='text-emerald-600 dark:text-emerald-400'>{formatMoney(settlement.settledAmount)}</span>}
                        />
                        <div
                          className={cn(
                            'mt-1 flex items-baseline justify-between gap-4 rounded-md px-2.5 py-1.5 font-semibold',
                            remaining > 0.001
                              ? 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                          )}
                        >
                          <span>{t('Balance Due') || 'Balance Due'}</span>
                          <span className='tabular-nums'>{formatMoney(remaining)}</span>
                        </div>
                        <div className='mt-2 h-1.5 overflow-hidden rounded-full bg-muted'>
                          <div
                            className={cn(
                              'h-full rounded-full',
                              settledPercent >= 100 ? 'bg-emerald-500' : settledPercent > 0 ? 'bg-amber-500' : 'bg-transparent'
                            )}
                            style={{ width: `${settledPercent}%` }}
                          />
                        </div>
                        <p className='mt-1 text-[11px] text-muted-foreground'>
                          {settledPercent}% {t('settled') || 'settled'}
                          {dueContext ? ` · ${dueContext}` : ''}
                        </p>
                      </>
                    )}
                  </section>

                  <section className='rounded-lg border bg-card p-3 shadow-sm'>
                    <p className='mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>{t('Details') || 'Details'}</p>
                    <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
                      <dt className='text-muted-foreground'>{t('type') || 'Type'}</dt>
                      <dd className='text-right font-medium'>{t(typeMeta.label)}</dd>
                      <dt className='text-muted-foreground'>{t('payment_method') || 'Payment'}</dt>
                      <dd className='text-right font-medium'>
                        {paymentMethodLabel(invoice)}
                        {toNumber(invoice.splitPaidAmount) > 0 && (
                          <span className='block font-normal text-muted-foreground'>
                            + {formatMoney(toNumber(invoice.splitPaidAmount))}{' '}
                            {invoice.splitPaymentMethod === 'wallet' ? invoice.splitWalletType || 'Wallet' : invoice.splitPaymentMethod}
                          </span>
                        )}
                      </dd>
                      {userName(invoice.salesmanId) && (
                        <>
                          <dt className='text-muted-foreground'>{t('salesman') || 'Salesman'}</dt>
                          <dd className='truncate text-right font-medium'>{userName(invoice.salesmanId)}</dd>
                        </>
                      )}
                      {userName(invoice.createdBy) && (
                        <>
                          <dt className='text-muted-foreground'>{t('created_by') || 'Created By'}</dt>
                          <dd className='truncate text-right font-medium'>{userName(invoice.createdBy)}</dd>
                        </>
                      )}
                      {invoice.receivedByName && (
                        <>
                          <dt className='text-muted-foreground'>{t('Received By') || 'Received By'}</dt>
                          <dd className='truncate text-right font-medium'>{invoice.receivedByName}</dd>
                        </>
                      )}
                      {invoice.couponCode && (
                        <>
                          <dt className='text-muted-foreground'>{t('Coupon') || 'Coupon'}</dt>
                          <dd className='text-right font-medium'>{invoice.couponCode}</dd>
                        </>
                      )}
                      {invoice.currency && invoice.baseCurrency && invoice.currency !== invoice.baseCurrency && (
                        <>
                          <dt className='text-muted-foreground'>{t('Currency') || 'Currency'}</dt>
                          <dd className='text-right font-medium'>
                            {invoice.currency} @ {toNumber(invoice.exchangeRate)}
                          </dd>
                        </>
                      )}
                      <dt className='text-muted-foreground'>{t('Items') || 'Items'}</dt>
                      <dd className='text-right font-medium'>
                        {items.length} · {t('Qty') || 'Qty'} {totals.qty}
                      </dd>
                    </dl>
                  </section>

                  {!isQuotation && (paidAtSale > 0.001 || payments.length > 0) && (
                    <section className='rounded-lg border bg-card shadow-sm'>
                      <p className='border-b px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground'>
                        {t('Payment History') || 'Payment History'}
                      </p>
                      <ul className='max-h-48 divide-y overflow-y-auto text-xs'>
                        {paidAtSale > 0.001 && (
                          <li className='flex items-center justify-between gap-2 px-3 py-1.5'>
                            <div className='min-w-0'>
                              <p className='font-medium'>{t('Paid at sale') || 'Paid at sale'}</p>
                              <p className='truncate text-[11px] text-muted-foreground'>
                                {invoiceDate ? formatAppDate(invoiceDate) : ''} · {paymentMethodLabel(invoice)}
                              </p>
                            </div>
                            <span className='font-semibold tabular-nums'>{formatMoney(paidAtSale)}</span>
                          </li>
                        )}
                        {payments.map((payment) => (
                          <li
                            key={payment.id}
                            className={cn('flex items-center justify-between gap-2 px-3 py-1.5', payment.status === 'void' && 'opacity-60')}
                          >
                            <div className='min-w-0'>
                              <p className='flex items-center gap-1.5 font-medium'>
                                {payment.paymentNumber}
                                {payment.status === 'void' && (
                                  <Badge variant='outline' className='h-4 border-rose-500/30 bg-rose-500/10 px-1 text-[10px] font-normal text-rose-600'>
                                    {t('Void')}
                                  </Badge>
                                )}
                                {payment.direction && payment.direction !== 'payment' && (
                                  <Badge variant='secondary' className='h-4 px-1 text-[10px] font-normal capitalize'>
                                    {String(payment.direction).replace('_', ' ')}
                                  </Badge>
                                )}
                              </p>
                              <p
                                className='truncate text-[11px] text-muted-foreground'
                                title={[payment.referenceNumber, userName(payment.createdBy)].filter(Boolean).join(' · ')}
                              >
                                {formatAppDate(new Date(payment.paymentDate))} ·{' '}
                                {payment.paymentMethod === 'wallet' ? payment.walletType || 'Wallet' : t('Cash') || 'Cash'}
                                {payment.referenceNumber ? ` · ${payment.referenceNumber}` : ''}
                              </p>
                            </div>
                            <div className='shrink-0 text-right'>
                              <p className='font-semibold tabular-nums'>{formatMoney(payment.appliedToThisInvoice)}</p>
                              {Math.abs(payment.amount - payment.appliedToThisInvoice) > 0.001 && (
                                <p className='text-[10px] text-muted-foreground'>
                                  {t('of') || 'of'} {formatMoney(payment.amount)}
                                </p>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </aside>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {invoice && (
        <InvoiceDeleteDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          currentRow={invoice}
          onDeleted={() => onOpenChange(false)}
        />
      )}
      <CustomerPaymentDialog open={paymentOpen} onOpenChange={setPaymentOpen} defaultCustomerId={customerIdStr} />
      <QuotationConvertDialog
        invoice={convertOpen ? invoice : null}
        open={convertOpen}
        onOpenChange={setConvertOpen}
        onConverted={() => onOpenChange(false)}
      />
    </>
  )
}

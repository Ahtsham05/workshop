import { PrintBrandingChoice } from '@/components/print-branding-choice'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import {
  Banknote,
  BookOpen,
  CheckCircle2,
  Download,
  Edit,
  Eye,
  FilePlus2,
  Loader2,
  MoreVertical,
  Printer,
  Share2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { InvoiceDetailDialog } from '@/components/invoice-detail-dialog'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { usePermissions } from '@/context/permission-context'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { useGetInvoiceByIdQuery } from '@/stores/invoice.api'
import { useInvoicePrinter } from '../../hooks/use-invoice-printer'
import { generateA4InvoiceHTML, generateInvoiceHTML } from '../../utils/print-utils'
import { prepareSheetPrintData } from '../../utils/distributor-print-details'
import { PAPER_FORMATS, resolveSheetFormat, resolveThermalSize, type PaperSize } from '../../utils/paper-format'
import { downloadInvoicePdf } from '../../utils/invoice-share'
import { useInvoiceSharePdf } from '../../hooks/use-invoice-share-pdf'
import { InvoiceShareDialog } from '../invoice-share-dialog'
import { CustomerPaymentDialog } from '../customer-payment-dialog'
import { MobileScreen } from './mobile-screen'
import { PrintPreviewFrame } from './print-preview-frame'
import { formatCustomerAddress, type ApiRecord } from './mobile-utils'

interface MobilePostedInvoiceProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  invoiceId: string | null
  /** Shown in the title while the invoice loads. */
  invoiceNumber?: string
  onNewInvoice: () => void
}

const PREVIEW_FORMATS: Array<{ value: PaperSize; label: string }> = [
  { value: 'thermal80', label: 'Receipt' },
  { value: 'a4', label: 'A4' },
  { value: 'a5', label: 'A5' },
]

const refOf = (value: unknown): ApiRecord | undefined =>
  value && typeof value === 'object' ? (value as ApiRecord) : undefined

/**
 * What a phone shows right after Confirm — Odoo's posted invoice: the number, the status
 * ribbon, Share (Odoo's "Send") and Print up top, a ⋮ sheet with the rest (Pay, Preview,
 * PDF, Edit), and the actual printed invoice below in the branch's paper format.
 */
export function MobilePostedInvoice({ open, onOpenChange, invoiceId, invoiceNumber, onNewInvoice }: MobilePostedInvoiceProps) {
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const navigate = useNavigate()
  const { hasExplicitPermission } = usePermissions()
  const canEdit = hasExplicitPermission('editInvoices')
  const canCreate = hasExplicitPermission('createInvoices')
  const printer = useInvoicePrinter()
  const { getSharePdf, ready: shareReady } = useInvoiceSharePdf()

  const { data: invoice, isLoading, isError, refetch } = useGetInvoiceByIdQuery(invoiceId as string, {
    skip: !open || !invoiceId,
  })

  const [format, setFormat] = useState<PaperSize | null>(null)
  const activeFormat: PaperSize = format ?? printer.defaultPaperSize
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [actionsOpen, setActionsOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [downloading, setDownloading] = useState(false)

  useEffect(() => {
    if (!open) {
      setFormat(null)
      setPreviewHtml(null)
    }
  }, [open])

  // The same HTML Print produces for this paper size, rebuilt when the format changes.
  const invoiceKey = invoice ? `${invoice._id || invoice.id}:${invoice.updatedAt || ''}` : ''
  useEffect(() => {
    if (!open || !invoice || !printer.branchData) return
    let cancelled = false
    setPreviewHtml(null)
    ;(async () => {
      try {
        const { printData } = await printer.buildInvoicePrintData(invoice)
        let html: string
        if (PAPER_FORMATS[activeFormat].family === 'thermal') {
          html = generateInvoiceHTML(printData, resolveThermalSize(activeFormat))
        } else {
          const sheetData = await prepareSheetPrintData(printData, invoice, printer.invoiceTemplate)
          html = generateA4InvoiceHTML(sheetData, resolveSheetFormat(activeFormat, printer.printOrientation), printer.invoiceTemplate)
        }
        if (!cancelled) setPreviewHtml(html)
      } catch {
        if (!cancelled) toast.error(t('Failed to open preview') || 'Failed to open preview')
      }
    })()
    return () => {
      cancelled = true
    }
    // buildInvoicePrintData's identity follows branch/org data; the key covers the invoice.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceKey, activeFormat, printer.branchData, printer.invoiceTemplate, printer.printOrientation])

  // Build the share PDF quietly once the preview is on screen, so Share opens ready.
  const previewShown = previewHtml !== null
  useEffect(() => {
    if (!open || !invoice || !shareReady || !previewShown) return
    const timer = setTimeout(() => {
      getSharePdf(invoice).catch(() => undefined)
    }, 300)
    return () => clearTimeout(timer)
    // getSharePdf follows branch/org data; the key covers the invoice version.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, invoiceKey, shareReady, previewShown])

  const customer = refOf(invoice?.customerId) || refOf(invoice?.customer)
  const customerId = invoice && invoice.customerId !== 'walk-in' ? String(customer?._id || customer?.id || invoice.customerId || '') : ''
  const isWalkIn = !customerId || invoice?.customerId === 'walk-in'
  const customerName = isWalkIn
    ? invoice?.walkInCustomerName || t('walk_in_customer')
    : customer?.name || invoice?.customerName || '—'
  const address = formatCustomerAddress(customer)
  const isQuotation = invoice?.type === 'quotation'
  const total = Number(invoice?.total || 0)
  const paid = Number(invoice?.paidAmount || 0)
  const due = Math.max(0, total - paid)
  const status = useMemo(() => {
    if (!invoice) return { label: t('Posted') || 'Posted', tone: 'bg-muted text-muted-foreground' }
    if (isQuotation) return { label: t('Quotation') || 'Quotation', tone: 'bg-violet-100 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300' }
    if (invoice.type === 'pending') return { label: t('pending') || 'Pending', tone: 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300' }
    if (due <= 0.004) return { label: t('Paid') || 'Paid', tone: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300' }
    return { label: t('Posted') || 'Posted', tone: 'bg-sky-100 text-sky-800 dark:bg-sky-950/50 dark:text-sky-300' }
  }, [invoice, isQuotation, due, t])

  const docLabel = isQuotation
    ? t('Quotation') || 'Quotation'
    : invoice?.type === 'credit'
      ? t('Credit Invoice') || 'Credit Invoice'
      : invoice?.type === 'pending'
        ? t('Pending Invoice') || 'Pending Invoice'
        : t('Customer Invoice') || 'Customer Invoice'

  const handleDownload = async () => {
    if (!invoice) return
    setActionsOpen(false)
    setDownloading(true)
    try {
      const { pdf } = await getSharePdf(invoice)
      downloadInvoicePdf(pdf)
    } catch {
      toast.error(t('Could not prepare the invoice PDF') || 'Could not prepare the invoice PDF')
    } finally {
      setDownloading(false)
    }
  }

  const handleEdit = () => {
    if (!invoice) return
    setActionsOpen(false)
    onOpenChange(false)
    navigate({ to: '/invoice', search: { editId: String(invoice._id || invoice.id) } as never })
  }

  const openLedger = () => {
    if (!customerId) return
    setActionsOpen(false)
    onOpenChange(false)
    navigate({ to: '/accounting', search: { tab: 'customer-ledger', customerId, customerName: customer?.name } as never })
  }

  const actions: Array<{ key: string; label: string; icon: React.ReactNode; onSelect: () => void; hidden?: boolean }> = [
    {
      key: 'print',
      label: `${t('Print') || 'Print'} (${PREVIEW_FORMATS.find((f) => f.value === activeFormat)?.label ?? PAPER_FORMATS[activeFormat].label})`,
      icon: <Printer className='h-5 w-5' />,
      onSelect: () => {
        setActionsOpen(false)
        if (invoice) void printer.printInvoice(invoice, activeFormat)
      },
      hidden: !printer.canPrint,
    },
    {
      key: 'pay',
      label: t('Record Payment') || 'Record payment',
      icon: <Banknote className='h-5 w-5' />,
      onSelect: () => {
        setActionsOpen(false)
        setPaymentOpen(true)
      },
      hidden: !canCreate || isQuotation || isWalkIn || due <= 0.004,
    },
    {
      key: 'preview',
      label: t('Full details') || 'Full details',
      icon: <Eye className='h-5 w-5' />,
      onSelect: () => {
        setActionsOpen(false)
        setDetailOpen(true)
      },
    },
    { key: 'pdf', label: t('Download PDF') || 'Download PDF', icon: <Download className='h-5 w-5' />, onSelect: handleDownload },
    { key: 'edit', label: t('Edit') || 'Edit', icon: <Edit className='h-5 w-5' />, onSelect: handleEdit, hidden: !canEdit },
    {
      key: 'ledger',
      label: t('Customer Ledger') || 'Customer ledger',
      icon: <BookOpen className='h-5 w-5' />,
      onSelect: openLedger,
      hidden: isWalkIn,
    },
  ]

  return (
    <>
      <MobileScreen
        open={open}
        onOpenChange={onOpenChange}
        title={invoice?.invoiceNumber || invoiceNumber || t('Invoice') || 'Invoice'}
        bodyClassName='bg-muted/40'
        footer={
          <div className='grid grid-cols-2 gap-2'>
            <Button
              type='button'
              variant='outline'
              className='h-11 gap-1.5 text-[15px]'
              onClick={() => {
                onOpenChange(false)
                onNewInvoice()
              }}
            >
              <FilePlus2 className='h-4 w-4' />
              {t('New invoice') || 'New invoice'}
            </Button>
            <Button type='button' variant='secondary' className='h-11 text-[15px]' onClick={() => onOpenChange(false)}>
              {t('Done') || 'Done'}
            </Button>
          </div>
        }
      >
        {/* Control panel: Send/Share · Print · ⋮ … status ribbon */}
        <div className='flex items-center gap-2 border-b bg-background px-3 py-2.5'>
          <Button type='button' className='h-10 gap-1.5 px-4' disabled={!invoice} onClick={() => setShareOpen(true)}>
            <Share2 className='h-4 w-4' />
            {t('Share') || 'Share'}
          </Button>
          {printer.canPrint && (
            <PrintBrandingChoice
              disabled={!invoice || printer.printingId !== null}
              onPrint={() => invoice && printer.printInvoice(invoice, activeFormat)}
            >
              <Button
                type='button'
                variant='outline'
                className='h-10 gap-1.5 px-3'
                disabled={!invoice || printer.printingId !== null}
                onClick={() => invoice && printer.printInvoice(invoice, activeFormat)}
              >
                {printer.printingId ? <Loader2 className='h-4 w-4 animate-spin' /> : <Printer className='h-4 w-4' />}
                {t('Print') || 'Print'}
              </Button>
            </PrintBrandingChoice>
          )}
          <Button
            type='button'
            variant='outline'
            size='icon'
            className='h-10 w-10'
            disabled={!invoice}
            aria-label={t('More actions') || 'More actions'}
            onClick={() => setActionsOpen(true)}
          >
            {downloading ? <Loader2 className='h-4 w-4 animate-spin' /> : <MoreVertical className='h-4 w-4' />}
          </Button>
          <span
            className={cn(
              'ml-auto inline-flex h-8 items-center pr-3 pl-4 text-xs font-semibold [clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)]',
              status.tone,
            )}
          >
            {status.label}
          </span>
        </div>

        {isLoading || (!invoice && !isError) ? (
          <div className='flex items-center justify-center gap-2 py-24 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            {t('loading') || 'Loading…'}
          </div>
        ) : isError || !invoice ? (
          <div className='px-6 py-20 text-center'>
            <p className='text-sm text-destructive'>{t('failed_to_load_invoice') || 'Failed to load invoice details'}</p>
            <Button type='button' variant='outline' className='mt-3' onClick={() => refetch()}>
              {t('Retry')}
            </Button>
          </div>
        ) : (
          <>
            <div className='flex items-center gap-2 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300'>
              <CheckCircle2 className='h-4 w-4 shrink-0' />
              {isQuotation
                ? t('Quotation saved') || 'Quotation saved'
                : t('Invoice confirmed and posted to the ledger') || 'Invoice confirmed and posted to the ledger'}
            </div>

            {/* Header facts, read-only like Odoo's posted form */}
            <section className='border-b bg-background px-4 py-4'>
              <p className='text-[13px] font-medium text-muted-foreground'>{docLabel}</p>
              <h2 className='mt-0.5 font-mono text-2xl font-semibold tracking-tight break-all'>{invoice.invoiceNumber}</h2>
              <dl className='mt-4 space-y-3 text-[15px]'>
                <div>
                  <dt className='text-[13px] text-muted-foreground'>{t('customer') || 'Customer'}</dt>
                  <dd className='font-medium text-primary'>{customerName}</dd>
                  {address ? <dd className='text-sm whitespace-pre-line text-foreground/80'>{address}</dd> : null}
                  {customer?.phone ? <dd className='text-sm text-foreground/80'>{customer.phone}</dd> : null}
                </div>
                <div className='grid grid-cols-2 gap-3'>
                  <div>
                    <dt className='text-[13px] text-muted-foreground'>{t('invoice_date') || 'Invoice Date'}</dt>
                    <dd>{formatAppDate(invoice.invoiceDate || invoice.createdAt)}</dd>
                  </div>
                  {invoice.dueDate && !isQuotation ? (
                    <div>
                      <dt className='text-[13px] text-muted-foreground'>{t('Due Date') || 'Due Date'}</dt>
                      <dd>{formatAppDate(String(invoice.dueDate).slice(0, 10))}</dd>
                    </div>
                  ) : null}
                </div>
                <div className='grid grid-cols-2 gap-3 rounded-xl bg-muted/60 p-3'>
                  <div>
                    <dt className='text-[13px] text-muted-foreground'>{t('total') || 'Total'}</dt>
                    <dd className='text-lg font-bold tabular-nums'>{formatMoney(total)}</dd>
                  </div>
                  {!isQuotation ? (
                    <div>
                      <dt className='text-[13px] text-muted-foreground'>{t('Amount Due') || 'Amount Due'}</dt>
                      <dd className={cn('text-lg font-bold tabular-nums', due > 0.004 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600')}>
                        {formatMoney(due)}
                      </dd>
                    </div>
                  ) : null}
                </div>
              </dl>
            </section>

            {/* The printed invoice */}
            <section className='px-3 pt-4 pb-6'>
              <div className='mb-3 flex items-center justify-between gap-2'>
                <p className='text-sm font-semibold'>{t('Print preview') || 'Print preview'}</p>
                <div className='flex rounded-lg border bg-background p-0.5' role='radiogroup' aria-label={t('Paper size') || 'Paper size'}>
                  {PREVIEW_FORMATS.map((option) => {
                    const active = option.value === activeFormat
                    return (
                      <button
                        key={option.value}
                        type='button'
                        role='radio'
                        aria-checked={active}
                        onClick={() => setFormat(option.value)}
                        className={cn(
                          'rounded-md px-3 py-1 text-xs font-semibold transition-colors',
                          active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground',
                        )}
                      >
                        {option.label}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className='overflow-hidden rounded-lg border bg-white shadow-sm'>
                <PrintPreviewFrame
                  html={previewHtml}
                  baseWidth={PAPER_FORMATS[activeFormat].family === 'thermal' ? (PAPER_FORMATS[activeFormat].bodyWidthPx ?? 300) + 40 : 820}
                />
              </div>
            </section>
          </>
        )}
      </MobileScreen>

      {/* ⋮ — Odoo's bottom action sheet */}
      <Sheet open={actionsOpen} onOpenChange={setActionsOpen}>
        <SheetContent side='bottom' className='rounded-t-2xl px-0 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]'>
          <div className='mx-auto mb-1 h-1 w-10 rounded-full bg-muted-foreground/25' aria-hidden />
          <SheetTitle className='sr-only'>{t('More actions') || 'More actions'}</SheetTitle>
          <SheetDescription className='sr-only'>{invoice?.invoiceNumber}</SheetDescription>
          <ul className='py-1'>
            {actions
              .filter((a) => !a.hidden)
              .map((action) => (
                <li key={action.key}>
                  <button
                    type='button'
                    onClick={action.onSelect}
                    className='flex w-full items-center gap-4 px-6 py-3.5 text-left text-[15px] active:bg-muted'
                  >
                    <span className='text-muted-foreground'>{action.icon}</span>
                    {action.label}
                  </button>
                </li>
              ))}
          </ul>
        </SheetContent>
      </Sheet>

      <InvoiceShareDialog open={shareOpen} onOpenChange={setShareOpen} invoice={invoice ?? null} />
      {customerId && !isWalkIn ? (
        <CustomerPaymentDialog
          open={paymentOpen}
          onOpenChange={setPaymentOpen}
          defaultCustomerId={customerId}
          onRecorded={() => refetch()}
        />
      ) : null}
      <InvoiceDetailDialog invoiceId={invoiceId ?? undefined} open={detailOpen} onOpenChange={setDetailOpen} />
    </>
  )
}

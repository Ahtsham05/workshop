import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Send,
  Share2,
} from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useGetInvoiceByIdQuery } from '@/stores/invoice.api'
import type { ApiRecord } from './mobile/mobile-utils'
import { cn } from '@/lib/utils'
import { useLanguage } from '@/context/language-context'
import { useWhatsAppOptional } from '@/context/whatsapp-context'
import { WHATSAPP_UI_ENABLED } from '@/config/whatsapp-ui'
import { useFormatMoney } from '@/lib/format-money'
import { formatAppDate } from '@/lib/date-format'
import { useInvoiceSharePdf } from '../hooks/use-invoice-share-pdf'
import type { PrintInvoiceData } from '../utils/print-utils'
import { sendInvoiceReceiptWhatsApp } from '../utils/send-invoice-whatsapp'
import {
  buildInvoiceShareMessage,
  canShareInvoiceFile,
  downloadInvoicePdf,
  emailUrl,
  openInvoicePdfInNewTab,
  shareInvoiceFile,
  whatsappChatUrl,
  type InvoiceSharePdf,
} from '../utils/invoice-share'

interface InvoiceShareDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** A saved invoice — from getInvoiceById (populated customer) or a list row. */
  invoice?: ApiRecord | null
  /** Or just its id — the full invoice (with the customer's phone/email) is fetched. */
  invoiceId?: string | null
}

type BuildState =
  | { status: 'idle' }
  | { status: 'building' }
  | { status: 'ready'; pdf: InvoiceSharePdf; printData: PrintInvoiceData }
  | { status: 'error'; message: string }

const formatBytes = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

const refOf = (value: unknown): ApiRecord | undefined =>
  value && typeof value === 'object' ? (value as ApiRecord) : undefined

/**
 * "Share invoice" — one screen for every way an invoice leaves the shop: the phone's own
 * share sheet (WhatsApp, Gmail, Files, AirDrop, printers…), a WhatsApp chat with the
 * customer, email, the connected WhatsApp Business number, download, or a copied message.
 *
 * The PDF is the branch's A4 template, built as soon as the dialog opens so the Share tap
 * can pass it to the OS synchronously. Bottom sheet on phones, centred dialog on desktop.
 */
export function InvoiceShareDialog({ open, onOpenChange, invoice: invoiceProp, invoiceId }: InvoiceShareDialogProps) {
  const { data: fetchedInvoice, isError: fetchFailed } = useGetInvoiceByIdQuery(invoiceId as string, {
    skip: !open || !invoiceId,
  })
  const invoice: ApiRecord | null = invoiceId ? fetchedInvoice ?? null : invoiceProp ?? null
  const { t } = useLanguage()
  const formatMoney = useFormatMoney()
  const { getSharePdf, ready: printSettingsReady, printer } = useInvoiceSharePdf()
  const whatsapp = useWhatsAppOptional()
  const [state, setState] = useState<BuildState>({ status: 'idle' })
  const [copied, setCopied] = useState(false)
  const [sendingDirect, setSendingDirect] = useState(false)
  const buildIdRef = useRef(0)

  const invoiceKey = invoice ? String(invoice._id || invoice.id || invoice.invoiceNumber || '') : ''
  const customer = refOf(invoice?.customerId) || refOf(invoice?.customer)
  const customerEmail: string | undefined = customer?.email?.trim() || undefined

  const build = useCallback(async () => {
    if (!invoice) return
    const buildId = ++buildIdRef.current
    setState({ status: 'building' })
    try {
      // Reuses a PDF already built for this invoice version (e.g. in the background by the
      // phone's posted-invoice screen) — then Share is ready the moment it opens.
      const { pdf, printData } = await getSharePdf(invoice)
      if (buildId === buildIdRef.current) setState({ status: 'ready', pdf, printData })
    } catch {
      if (buildId === buildIdRef.current) {
        setState({ status: 'error', message: t('Could not prepare the invoice PDF') || 'Could not prepare the invoice PDF' })
      }
    }
    // getSharePdf changes identity whenever branch/org data lands — build once per open +
    // invoice instead of rebuilding the PDF on every such change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoiceKey, printer.invoiceTemplate])

  useEffect(() => {
    if (!open) {
      buildIdRef.current++
      setState({ status: 'idle' })
      setCopied(false)
      return
    }
    // Branch settings decide the template — wait for them instead of building a 'standard' PDF.
    if (!printSettingsReady || !invoice) return
    if (state.status === 'idle') void build()
  }, [open, printSettingsReady, build, state.status, invoice])

  useEffect(() => {
    if (open && fetchFailed) setState({ status: 'error', message: t('failed_to_load_invoice') || 'Failed to load invoice' })
  }, [open, fetchFailed, t])

  const ready = state.status === 'ready' ? state : null
  const message = ready
    ? buildInvoiceShareMessage(ready.printData, formatMoney, (value) => formatAppDate(value))
    : null
  const phone = ready?.printData.customerWhatsapp || ready?.printData.customerPhone || customer?.whatsapp || customer?.phone
  const systemShare = ready ? canShareInvoiceFile(ready.pdf.file) : false
  const directWhatsApp = WHATSAPP_UI_ENABLED && Boolean(whatsapp?.isReady)

  const handleSystemShare = async () => {
    if (!ready || !message) return
    const outcome = await shareInvoiceFile(ready.pdf, message.title, message.text)
    if (outcome === 'shared') onOpenChange(false)
    else if (outcome === 'failed') toast.error(t('Sharing failed — try Download instead') || 'Sharing failed — try Download instead')
  }

  const handleWhatsAppChat = () => {
    if (!ready || !message) return
    // Phones: the share sheet attaches the PDF to the WhatsApp chat itself.
    if (systemShare) {
      void handleSystemShare()
      return
    }
    // Desktop: WhatsApp Web can't receive a file from a link — save the PDF so it can be
    // dragged into the chat that opens.
    downloadInvoicePdf(ready.pdf)
    window.open(whatsappChatUrl(phone, message.text), '_blank', 'noopener')
    toast.info(t('PDF downloaded — attach it in the WhatsApp chat') || 'PDF downloaded — attach it in the WhatsApp chat')
  }

  const handleEmail = () => {
    if (!ready || !message) return
    downloadInvoicePdf(ready.pdf)
    window.location.href = emailUrl(customerEmail, message.title, message.text)
    toast.info(t('PDF downloaded — attach it to the email') || 'PDF downloaded — attach it to the email')
  }

  const handleDirectWhatsApp = async () => {
    if (!ready) return
    const to = (ready.printData.customerWhatsapp || ready.printData.customerPhone || '').trim()
    if (!to) {
      toast.error(t('This customer has no phone or WhatsApp number') || 'This customer has no phone or WhatsApp number')
      return
    }
    setSendingDirect(true)
    try {
      const res = await sendInvoiceReceiptWhatsApp({
        printData: ready.printData,
        phone: to,
        template: printer.invoiceTemplate,
        templateCategory: ready.printData.type === 'quotation' ? 'quotation' : 'invoice',
        source: invoice,
      })
      if (res.success) {
        toast.success(t('Invoice sent on WhatsApp') || 'Invoice sent on WhatsApp')
        onOpenChange(false)
      } else {
        toast.error(res.error || 'Failed to send on WhatsApp')
      }
    } finally {
      setSendingDirect(false)
    }
  }

  const handleCopy = async () => {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message.text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      toast.error(t('Could not copy') || 'Could not copy')
    }
  }

  const docLabel = invoice?.type === 'quotation' ? t('Quotation') || 'Quotation' : t('Invoice') || 'Invoice'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          'gap-0 overflow-hidden p-0 sm:max-w-md',
          // Phones: a bottom sheet the thumb can reach, like the OS share sheet.
          'max-sm:top-auto max-sm:bottom-0 max-sm:max-w-none max-sm:translate-y-0 max-sm:rounded-t-2xl max-sm:rounded-b-none max-sm:border-x-0 max-sm:border-b-0 max-sm:pb-[env(safe-area-inset-bottom)]',
        )}
      >
        <div className='mx-auto mt-2 h-1 w-10 rounded-full bg-muted-foreground/25 sm:hidden' aria-hidden />
        <div className='px-5 pt-4 pb-3 pr-12'>
          <DialogTitle className='text-base font-semibold'>
            {t('Share')} {docLabel.toLowerCase()} {invoice?.invoiceNumber ? `#${invoice.invoiceNumber}` : ''}
          </DialogTitle>
          <DialogDescription className='mt-0.5 text-xs'>
            {t('Send the PDF to your customer or save it.') || 'Send the PDF to your customer or save it.'}
          </DialogDescription>
        </div>

        {/* The file that will be sent */}
        <div className='mx-5 mb-4 flex items-center gap-3 rounded-xl border bg-muted/40 p-3'>
          <div className='flex h-11 w-9 shrink-0 items-center justify-center rounded-md bg-red-600 text-[9px] font-bold tracking-wide text-white shadow-sm'>
            PDF
          </div>
          <div className='min-w-0 flex-1'>
            {state.status === 'ready' ? (
              <>
                <p className='truncate text-sm font-medium' title={state.pdf.filename}>{state.pdf.filename}</p>
                <p className='text-xs text-muted-foreground'>
                  {t('PDF document') || 'PDF document'} · {formatBytes(state.pdf.blob.size)}
                </p>
              </>
            ) : state.status === 'error' ? (
              <p className='flex items-center gap-1.5 text-sm text-destructive'>
                <AlertCircle className='h-4 w-4 shrink-0' />
                {state.message}
              </p>
            ) : (
              <>
                <p className='flex items-center gap-2 text-sm font-medium'>
                  <Loader2 className='h-4 w-4 animate-spin text-muted-foreground' />
                  {t('Preparing PDF…') || 'Preparing PDF…'}
                </p>
                <div className='mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                  <div className='h-full w-2/3 animate-pulse rounded-full bg-primary/60' />
                </div>
              </>
            )}
          </div>
          {state.status === 'ready' ? (
            <Button
              type='button'
              variant='ghost'
              size='icon'
              className='h-8 w-8 shrink-0'
              title={t('Open PDF') || 'Open PDF'}
              onClick={() => openInvoicePdfInNewTab(state.pdf)}
            >
              <ExternalLink className='h-4 w-4' />
            </Button>
          ) : state.status === 'error' ? (
            <Button type='button' variant='outline' size='sm' className='h-8 shrink-0 gap-1' onClick={() => void build()}>
              <RefreshCw className='h-3.5 w-3.5' />
              {t('Retry')}
            </Button>
          ) : null}
        </div>

        {systemShare && (
          <div className='px-5 pb-3'>
            <Button type='button' size='lg' className='h-12 w-full gap-2 text-base' disabled={!ready} onClick={handleSystemShare}>
              <Share2 className='h-5 w-5' />
              {t('Share PDF') || 'Share PDF'}
            </Button>
          </div>
        )}

        <div className='grid grid-cols-4 gap-1 border-t px-3 py-4'>
          <ShareTile
            label='WhatsApp'
            disabled={!ready}
            onClick={handleWhatsAppChat}
            icon={<MessageCircle className='h-5 w-5' />}
            tone='bg-[#25D366] text-white'
          />
          <ShareTile
            label={t('Email') || 'Email'}
            disabled={!ready}
            onClick={handleEmail}
            icon={<Mail className='h-5 w-5' />}
            tone='bg-sky-600 text-white'
          />
          <ShareTile
            label={t('Download') || 'Download'}
            disabled={!ready}
            onClick={() => ready && downloadInvoicePdf(ready.pdf)}
            icon={<Download className='h-5 w-5' />}
            tone='bg-slate-700 text-white dark:bg-slate-600'
          />
          <ShareTile
            label={copied ? t('Copied') || 'Copied' : t('Copy text') || 'Copy text'}
            disabled={!ready}
            onClick={handleCopy}
            icon={copied ? <Check className='h-5 w-5' /> : <Copy className='h-5 w-5' />}
            tone='bg-muted text-foreground'
          />
        </div>

        {directWhatsApp && (
          <div className='border-t px-5 py-3'>
            <button
              type='button'
              disabled={!ready || sendingDirect}
              onClick={handleDirectWhatsApp}
              className='flex w-full items-center gap-3 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-muted disabled:opacity-50'
            >
              <span className='flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'>
                {sendingDirect ? <Loader2 className='h-4 w-4 animate-spin' /> : <Send className='h-4 w-4' />}
              </span>
              <span className='min-w-0 flex-1'>
                <span className='block text-sm font-medium'>
                  {t('Send from business WhatsApp') || 'Send from business WhatsApp'}
                </span>
                <span className='block truncate text-xs text-muted-foreground'>
                  {phone
                    ? `${t('PDF goes straight to') || 'PDF goes straight to'} ${phone}`
                    : t('Customer has no number saved') || 'Customer has no number saved'}
                </span>
              </span>
            </button>
          </div>
        )}

        {message && (
          <details className='group border-t px-5 py-3 text-xs'>
            <summary className='flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground'>
              <FileText className='h-3.5 w-3.5' />
              {t('Message sent with the PDF') || 'Message sent with the PDF'}
            </summary>
            <pre className='mt-2 max-h-40 overflow-auto rounded-md bg-muted/60 p-2.5 font-sans whitespace-pre-wrap text-foreground'>
              {message.text}
            </pre>
          </details>
        )}
      </DialogContent>
    </Dialog>
  )
}

function ShareTile({
  label,
  icon,
  tone,
  onClick,
  disabled,
}: {
  label: string
  icon: React.ReactNode
  tone: string
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      type='button'
      onClick={onClick}
      disabled={disabled}
      className='flex flex-col items-center gap-1.5 rounded-xl px-1 py-2 text-[11px] font-medium text-foreground transition-colors hover:bg-muted active:scale-95 disabled:pointer-events-none disabled:opacity-40'
    >
      <span className={cn('flex h-11 w-11 items-center justify-center rounded-full shadow-sm', tone)}>{icon}</span>
      <span className='w-full truncate text-center'>{label}</span>
    </button>
  )
}
